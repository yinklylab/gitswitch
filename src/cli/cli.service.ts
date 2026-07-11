import { Injectable } from '@nestjs/common';
import * as inquirer from 'inquirer';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import figlet from 'figlet';
import { SshService } from '../ssh/ssh.service';
import { GithubService } from '../github/github.service';
import { TokenService } from '../token/token.service';
import { GitService } from '../git/git.service';
import { AccountService } from '../account/account.service';
import { DoctorService } from '../doctor/doctor.service';
import { GithubAuthService } from '../auth/github-auth.service';

@Injectable()
export class CliService {
  constructor(
    private readonly sshService: SshService,
    private readonly githubService: GithubService,
    private readonly tokenService: TokenService,
    private readonly gitService: GitService,
    private readonly accountService: AccountService,
    private readonly doctorService: DoctorService,
    private readonly githubAuthService: GithubAuthService,
  ) {}

  async runOAuthSetup() {
    console.log(chalk.cyan.bold('\nWelcome to GitSwitch\n'));

    const { profileName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'profileName',
        message: 'Profile name (work, personal, client):',
        validate: (input: string) =>
          input.trim().length > 0 || 'Profile name is required.',
      },
    ]);

    const profile = profileName.trim().toLowerCase();
    const existingAccount = await this.accountService.getAccount(profile);

    if (existingAccount) {
      console.log(chalk.yellow(`Profile '${profile}' already exists.`));

      return;
    }

    //
    // GitHub OAuth Login
    //

    const device = await this.githubAuthService.startDeviceLogin();

    const token = await this.githubAuthService.pollForToken(
      device.device_code,
      device.interval,
      device.expires_in,
    );

    await this.tokenService.saveToken(profile, token);

    console.log(chalk.green('GitHub token stored securely'));

    //
    // Get GitHub user
    //

    const githubUser = await this.githubAuthService.getAuthenticatedUser(token);
    const githubUsername = githubUser.username;
    const gitName = githubUser.name;
    const email = githubUser.email;
    const hostAlias = `github-${profile}`;

    console.log(chalk.green(`\nConnected to GitHub as ${githubUsername}`));

    const sshKeyName = `gitswitch_${profile}`;

    const keyPath = await this.sshService.generateKey(email, sshKeyName);
    await this.sshService.updateSshConfig(profile, keyPath, hostAlias);
    await this.githubService.setupGitConfig(profile, gitName, email);

    const publicKeyPath = `${keyPath}.pub`;
    let publicKey = '';
    try {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
    } catch (err) {
      console.error(
        chalk.red('⚠️  Could not read public key file:'),
        err.message,
      );
      return;
    }

    console.log(chalk.cyan('\nUploading SSH key to GitHub...'));

    const keyExists = await this.githubService.keyExistsOnGithub(
      githubUsername,
      publicKey,
      token,
    );

    if (keyExists) {
      console.log(chalk.green('SSH key already exists on GitHub'));
    } else {
      await this.githubService.uploadKey(publicKey, token, hostAlias);

      console.log(chalk.green('SSH key added to GitHub'));
    }

    console.log(chalk.cyan('\nVerifying SSH connection...'));

    const sshConnection = await this.sshService.testConnection(hostAlias);

    if (!sshConnection.connected) {
      console.log(chalk.yellow('SSH connection could not be verified.'));

      if (process.env.DEBUG && sshConnection.message) {
        console.log(chalk.gray(sshConnection.message));
      }

      return;
    }

    if (
      sshConnection.username?.toLowerCase() !== githubUsername.toLowerCase()
    ) {
      console.log(
        chalk.red(
          `SSH authenticated as '${sshConnection.username}', expected '${githubUsername}'.`,
        ),
      );

      return;
    }

    console.log(chalk.green(`✓ SSH connected as ${sshConnection.username}`));

    await this.accountService.saveAccount({
      profile,
      githubUsername,
      name: gitName,
      email,
      hostAlias,
      sshKey: keyPath,
      authType: 'oauth',
      createdAt: new Date().toISOString(),
    });

    console.log(chalk.greenBright('\nGitSwitch setup complete\n'));

    console.log(`${chalk.bold('Profile:')} ${profileName}`);
    console.log(`${chalk.bold('GitHub:')} ${githubUsername}`);
    console.log(`${chalk.bold('SSH:')} ${hostAlias}`);

    console.log(`${chalk.bold('SSH Status')} ${chalk.green('Connected ✓')}`);

    console.log(chalk.cyan('\nYou can now use:\n'));

    console.log(chalk.white(`  gitswitch clone ${profileName} <repo>`));

    console.log(chalk.white(`  gitswitch push ${profileName}`));

    console.log();
  }

  async runManualSetup() {
    console.log(chalk.yellow.bold('\nGitSwitch Manual Setup\n'));

    const { profileName, accountName, email, hostAlias } =
      await inquirer.prompt([
        {
          name: 'profileName',
          message: 'Profile name (work, personal, client):',
          validate: (input: string) =>
            input.trim().length > 0 || 'Profile name is required.',
        },
        {
          name: 'accountName',
          message: 'Enter GitHub username:',
          validate: (input: string) =>
            input.trim().length > 0 || 'GitHub username is required.',
        },
        {
          name: 'email',
          message: 'Enter email associated with this GitHub account:',
          validate: (input: string) => {
            if (/\S+@\S+\.\S+/.test(input)) {
              return true;
            }

            return 'This does not look like a valid email address.';
          },
        },
        {
          name: 'hostAlias',
          message: 'Enter a custom host alias:',
          default: (answers: { profileName: string }) =>
            `github-${answers.profileName.trim().toLowerCase()}`,
        },
      ]);

    const profile = profileName.trim().toLowerCase();
    const githubUsername = accountName.trim();

    const existingAccount = await this.accountService.getAccount(profile);

    if (existingAccount) {
      console.log(chalk.yellow(`Profile '${profile}' already exists.`));
      return;
    }

    let token: string | null = await this.tokenService.getToken(profile);

    let verified = false;

    if (token) {
      console.log(chalk.green('Using saved GitHub token...'));

      const verification = await this.githubService.verifyAccount(
        githubUsername,
        token,
      );

      if (verification.valid) {
        verified = true;

        console.log(
          chalk.green(`Verified saved token belongs to '${githubUsername}'.`),
        );
      } else {
        console.log(
          chalk.red('Saved token is invalid or expired. It will be removed.'),
        );

        await this.tokenService.deleteToken(profile);
        token = null;
      }
    }

    if (!verified) {
      const { hasToken } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'hasToken',
          message: 'Do you have a GitHub Personal Access Token (PAT)?',
          default: false,
        },
      ]);

      if (hasToken) {
        const { tokenInput } = await inquirer.prompt([
          {
            type: 'password',
            name: 'tokenInput',
            message: 'Enter your GitHub Personal Access Token:',
            mask: '*',
          },
        ]);

        token = tokenInput.trim() || null;

        if (token) {
          const verification = await this.githubService.verifyAccount(
            githubUsername,
            token,
          );

          if (verification.valid) {
            await this.tokenService.saveToken(profile, token);

            verified = true;

            console.log(chalk.green('Token verified and saved securely.'));
          } else {
            console.log(chalk.red('Invalid token — not saved.'));

            token = null;
          }
        } else {
          console.log(
            chalk.yellow('Empty token provided. Proceeding without token.'),
          );
        }
      } else {
        const verification =
          await this.githubService.verifyAccount(githubUsername);

        if (!verification.valid) {
          console.error(
            chalk.red('\nAccount verification failed. Aborting setup.'),
          );

          return;
        }

        verified = true;

        console.log(chalk.green(`GitHub account '${githubUsername}' exists.`));
      }
    }

    if (!verified) {
      console.error(
        chalk.red('Setup aborted because account could not be verified.'),
      );

      return;
    }

    const sshKeyName = `gitswitch_${profile}`;

    const keyPath = await this.sshService.generateKey(email, sshKeyName);

    await this.sshService.updateSshConfig(profile, keyPath, hostAlias);

    await this.githubService.setupGitConfig(profile, githubUsername, email);

    const publicKeyPath = `${keyPath}.pub`;

    let publicKey = '';

    try {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
    } catch (err: any) {
      console.error(
        chalk.red('⚠️ Could not read public key file:'),
        err.message,
      );

      return;
    }

    if (token) {
      console.log(
        chalk.cyan('\nChecking if SSH key already exists on GitHub...'),
      );

      const keyExists = await this.githubService.keyExistsOnGithub(
        githubUsername,
        publicKey,
        token,
      );

      if (keyExists) {
        console.log(chalk.green('SSH key already exists on GitHub.'));
      } else {
        console.log(chalk.yellow('Uploading SSH key to GitHub...'));

        await this.githubService.uploadKey(publicKey, token, hostAlias);

        console.log(chalk.green('Successfully uploaded SSH key to GitHub!'));
      }
    } else {
      console.log(
        chalk.yellow('\nNo token provided — automatic SSH key upload skipped.'),
      );

      console.log(chalk.white("\nHere's your SSH public key:\n"));

      console.log(
        chalk.yellow.bold('──────────────────────────────────────────────'),
      );

      console.log(chalk.cyan(publicKey));

      console.log(
        chalk.yellow.bold('──────────────────────────────────────────────\n'),
      );

      const copied = await this.sshService.copyPublicKeyToClipboard(sshKeyName);

      if (copied) {
        console.log(chalk.green('SSH public key copied to your clipboard.'));
      } else {
        console.log(chalk.yellow('Could not copy SSH key automatically.'));

        console.log(chalk.gray(`Copy it manually from: ${publicKeyPath}`));
      }

      console.log(
        chalk.yellow(
          '\nAdd the SSH key to your GitHub account before using this profile.',
        ),
      );
    }

    await this.accountService.saveAccount({
      profile,
      githubUsername,
      name: githubUsername,
      email,
      hostAlias,
      sshKey: keyPath,
      authType: 'token',
      createdAt: new Date().toISOString(),
    });

    console.log(chalk.greenBright('\nGitSwitch manual setup complete\n'));

    console.log(`${chalk.bold('Profile:')} ${profile}`);
    console.log(`${chalk.bold('GitHub:')} ${githubUsername}`);
    console.log(`${chalk.bold('SSH Host:')} ${hostAlias}`);

    console.log(
      `${chalk.bold('Authentication:')} ${
        token ? chalk.green('PAT ✓') : chalk.yellow('Manual SSH setup required')
      }`,
    );

    console.log();
  }

  async listAccounts() {
    console.log(chalk.cyan.bold('\nConfigured GitSwitch profiles\n'));

    const accounts = await this.accountService.listAccounts();
    const activeProfile = await this.githubService.getActiveProfileName();

    if (!accounts.length) {
      console.log(chalk.yellow('No GitSwitch profiles configured.'));
      console.log(chalk.gray('\nRun `gitswitch setup` to add one.\n'));

      return;
    }

    console.log(chalk.white('Profiles:\n'));

    accounts.forEach((account, index) => {
      const isActive = account.profile === activeProfile;

      const activeLabel = isActive ? chalk.green(' ← active') : '';

      console.log(
        `${chalk.cyan(`${index + 1}.`)} ${chalk.bold(
          account.profile,
        )}${activeLabel}`,
      );

      console.log(chalk.gray(`   GitHub: ${account.githubUsername}`));
      console.log(chalk.gray(`   SSH: ${account.hostAlias}`));
      console.log(chalk.gray(`   Auth: ${account.authType}`));

      console.log();
    });
  }

  async switchAccount(accountName?: string) {
    console.log(`Switching to account: ${accountName || '(prompting...)'}`);
    let target = accountName;

    if (!target) {
      const accounts = await this.accountService.listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts configured yet.');
        return;
      }

      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select an account to activate:',
          choices: accounts.map((account) => ({
            name: `${account.profile} (${account.githubUsername})`,
            value: account.profile,
          })),
        },
      ]);

      target = selected;
    }

    if (typeof target === 'string') {
      await this.githubService.switchAccount(target);
      return;
    } else {
      console.log('No account selected to switch.');
    }
  }

  async deleteAccount(profileName?: string) {
    console.log(chalk.cyan('\nGitSwitch Profile Cleanup\n'));

    let targetProfile = profileName?.trim().toLowerCase();

    if (!targetProfile) {
      const accounts = await this.accountService.listAccounts();

      if (!accounts.length) {
        console.log(chalk.yellow('No GitSwitch profiles found.'));
        return;
      }

      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select the profile you want to delete:',
          choices: accounts.map((account) => ({
            name: `${account.profile} (${account.githubUsername})`,
            value: account.profile,
          })),
        },
      ]);

      targetProfile = selected;
    }

    if (!targetProfile) {
      console.log(chalk.red('No profile selected.'));
      return;
    }

    const account = await this.accountService.getAccount(targetProfile);

    if (!account) {
      console.log(chalk.red(`Profile '${targetProfile}' does not exist.`));
      return;
    }

    const { confirmDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDelete',
        message:
          `Are you sure you want to delete all local data for ` +
          `'${account.profile}' (${account.githubUsername})?`,
        default: false,
      },
    ]);

    if (!confirmDelete) {
      console.log(chalk.gray('Deletion canceled.'));
      return;
    }

    try {
      await this.tokenService.deleteToken(account.profile);

      await this.githubService.deleteAccountConfig(account.profile);

      await this.sshService.deleteSSHKeys(account.profile);

      await this.sshService.removeFromSshConfig(account.profile);

      await this.accountService.deleteAccount(account.profile);

      console.log(
        chalk.green(`\nSuccessfully removed profile '${account.profile}'.\n`),
      );
    } catch (err: any) {
      console.error(
        chalk.red(
          `Error deleting profile '${account.profile}': ${err.message}`,
        ),
      );
    }
  }

  async verifyAccount(username: string, token?: string): Promise<void> {
    console.log(chalk.cyan(`\nVerifying GitHub account: ${username}...`));
    await this.githubService.verifyAccount(username, token);
  }

  async showMainMenu() {
    console.log(
      chalk.yellow.bold(
        figlet.textSync('Git Switch', { horizontalLayout: 'full' }),
      ),
    );

    console.log(
      chalk.cyan.bold('\nGit Switch: Multi-account GitHub Management'),
    );
    console.log(
      chalk.white(
        '   Easily manage and switch between your personal and work GitHub accounts.\n',
      ),
    );

    const choices = [
      new inquirer.Separator(chalk.gray('\n── Daily Workflow ──')),

      {
        name:
          chalk.blue.bold('👤  Current Profile') +
          chalk.dim(' - Show active account, branch and remote.'),
        value: 'current',
      },

      {
        name:
          chalk.green.bold('📦  Clone Repository') +
          chalk.dim(' - Clone using a GitSwitch account.'),
        value: 'clone',
      },

      {
        name:
          chalk.green.bold('🚀  Push Code') +
          chalk.dim(' - Push using a selected account.'),
        value: 'push',
      },

      {
        name:
          chalk.magenta.bold('🔗  Switch Remote') +
          chalk.dim(' - Change repository GitHub identity.'),
        value: 'remote',
      },

      new inquirer.Separator(chalk.gray('\n── Account Management ──')),

      {
        name:
          chalk.green.bold('⚙️  Setup Account') +
          chalk.dim(' - Configure a new GitHub profile.'),
        value: 'setup',
      },

      {
        name:
          chalk.magenta.bold('🔄  Switch Account') +
          chalk.dim(' - Change active global Git identity.'),
        value: 'switch',
      },

      {
        name:
          chalk.blue.bold('📋  List Accounts') +
          chalk.dim(' - View configured profiles.'),
        value: 'list',
      },

      {
        name:
          chalk.yellow.bold('✔️  Verify Account') +
          chalk.dim(' - Validate GitHub credentials.'),
        value: 'verify',
      },

      {
        name:
          chalk.red.bold('🗑️  Delete Account') +
          chalk.dim(' - Remove a GitSwitch profile.'),
        value: 'delete',
      },

      new inquirer.Separator(chalk.gray('\n── Tools ──')),

      {
        name:
          chalk.yellow.bold('🩺  Doctor') +
          chalk.dim(' - Diagnose GitSwitch problems.'),
        value: 'doctor',
      },

      {
        name:
          chalk.cyan.bold('📖  Workflow Guide') +
          chalk.dim(' - Learn GitSwitch commands.'),
        value: 'guide',
      },
    ];

    const { command } = await inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: chalk.hex('#FF8C00')('▶️  Select an action:'),
        choices: choices,
      },
    ]);

    switch (command) {
      case 'setup':
        await this.runOAuthSetup();
        break;
      case 'list':
        await this.listAccounts();
        break;
      case 'switch': {
        await this.switchAccount();
        break;
      }
      case 'delete': {
        await this.deleteAccount();
        break;
      }
      case 'current':
        await this.currentAccount();
        break;
      case 'guide':
        this.showGuide();
        break;
      case 'remote': {
        const { remoteAccount } = await inquirer.prompt([
          {
            type: 'input',
            name: 'remoteAccount',
            message: 'Account name:',
          },
        ]);
        await this.switchRemote(remoteAccount);
        break;
      }
      case 'push': {
        const { pushAccount } = await inquirer.prompt([
          {
            type: 'input',
            name: 'pushAccount',
            message: 'Account name:',
          },
        ]);
        await this.pushWithAccount(pushAccount);
        break;
      }
      case 'clone': {
        const { account, repo } = await inquirer.prompt([
          {
            type: 'input',
            name: 'account',
            message: 'Account name:',
          },
          {
            type: 'input',
            name: 'repo',
            message: 'Repository URL:',
          },
        ]);
        await this.cloneWithAccount(account, repo);
        break;
      }
      case 'doctor':
        await this.doctor();
        break;
      case 'verify': {
        const { username, token } = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: chalk.yellow('Enter the GitHub username to verify:'),
            validate: (input) =>
              input.trim().length > 0 ? true : 'Username cannot be empty.',
          },
          {
            type: 'input',
            name: 'token',
            message: chalk.yellow(
              'Enter the optional GitHub Personal Access Token (press Enter to skip):',
            ),
          },
        ]);
        await this.verifyAccount(username, token);
        break;
      }
      default:
        console.log(chalk.yellow('Command not recognized.'));
    }
  }

  async currentAccount() {
    const profileName = await this.githubService.getActiveProfileName();

    if (!profileName) {
      console.log(chalk.yellow('\nNo active GitSwitch profile.\n'));

      console.log(
        chalk.gray('Run `gitswitch use <profile>` to activate one.\n'),
      );

      return;
    }

    const account = await this.accountService.getAccount(profileName);

    if (!account) {
      console.log(
        chalk.red(
          `\nActive profile '${profileName}' was not found in GitSwitch accounts.\n`,
        ),
      );

      return;
    }

    console.log(chalk.cyan.bold('\nCurrent GitSwitch Profile\n'));
    console.log(
      `${chalk.white('Profile:')} ${chalk.green.bold(account.profile)}`,
    );
    console.log(
      `${chalk.white('GitHub:')} ${chalk.cyan(account.githubUsername)}`,
    );
    console.log(`${chalk.white('Name:')} ${chalk.cyan(account.name)}`);
    console.log(`${chalk.white('Email:')} ${chalk.cyan(account.email)}`);
    console.log(
      `${chalk.white('SSH Host:')} ${chalk.yellow(account.hostAlias)}`,
    );
    console.log(`${chalk.white('Auth:')} ${chalk.magenta(account.authType)}\n`);
  }

  showGuide() {
    console.log(chalk.cyan.bold('\n===GitSwitch Workflow Guide===\n'));
    console.log(chalk.green.bold('1.  Setup a GitHub account'));
    console.log(
      chalk.white(
        'Configure your GitHub identity, SSH key and authentication.',
      ),
    );

    console.log(chalk.cyan('gitswitch setup\n'));
    console.log(chalk.green.bold('2.  Clone a repository with an account'));

    console.log(
      chalk.white('Clone repositories using a configured GitSwitch profile.'),
    );

    console.log(
      chalk.cyan('gitswitch clone work git@github.com:user/project.git\n'),
    );
    console.log(chalk.green.bold('3.  Switch an existing repository remote'));
    console.log(
      chalk.white('Move an existing repo from one GitHub identity to another.'),
    );

    console.log(chalk.cyan('gitswitch remote work\n'));
    console.log(chalk.green.bold('4.  Push using a specific account'));
    console.log(chalk.white('Push code with your selected GitHub identity.'));
    console.log(chalk.cyan('gitswitch push work\n'));
    console.log(chalk.green.bold('5.  Check current identity'));
    console.log(chalk.cyan('gitswitch current\n'));
    console.log(chalk.magenta.bold('Tip'));
    console.log(
      chalk.gray(
        'Run `gitswitch list` anytime to view your configured accounts.\n',
      ),
    );
  }

  async switchRemote(accountName: string) {
    console.log(
      chalk.cyan(`\nSwitching repository remote to '${accountName}'...\n`),
    );

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const isRepo = await this.gitService.isGitRepository();

    if (!isRepo) {
      console.log(chalk.red('Current directory is not a Git repository.'));

      return;
    }

    const currentRemote = await this.gitService.getRemote();

    if (!currentRemote) {
      console.log(chalk.yellow('No remote origin found.'));

      return;
    }

    const newRemote = this.gitService.convertRemoteUrl(
      currentRemote,
      account.hostAlias,
    );

    await this.gitService.setRemote(newRemote);

    console.log(chalk.green('\nRepository account switched successfully'));

    console.log(chalk.gray(newRemote));
  }

  async pushWithAccount(accountName: string, targetBranch?: string) {
    console.log(chalk.cyan(`\nPreparing push with '${accountName}'...\n`));

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const isRepo = await this.gitService.isGitRepository();

    if (!isRepo) {
      console.log(chalk.red('Current directory is not a Git repository.'));

      return;
    }

    await this.switchRemote(accountName);

    const currentBranch = await this.gitService.getCurrentBranch();

    if (!currentBranch && !targetBranch) {
      console.log(chalk.red('Unable to detect current branch.'));

      return;
    }

    if (targetBranch) {
      console.log(chalk.cyan(`Pushing directly to '${targetBranch}'`));

      await this.gitService.push(targetBranch);

      console.log(
        chalk.greenBright(
          `\nSuccessfully pushed '${targetBranch}' using '${accountName}'\n`,
        ),
      );

      return;
    }

    console.log(chalk.green(`Current branch detected: ${currentBranch}`));

    const { pushTarget } = await inquirer.prompt([
      {
        type: 'list',
        name: 'pushTarget',
        message: 'Where do you want to push?',
        choices: [
          {
            name: `Current branch (${currentBranch})`,
            value: 'current',
          },
          {
            name: 'Different branch',
            value: 'different',
          },
        ],
      },
    ]);

    let branch: string | undefined = currentBranch ?? undefined;

    if (pushTarget === 'different') {
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'branch',
          message: 'Enter branch name:',
          validate: (input: string) =>
            input.trim() ? true : 'Branch name required',
        },
      ]);

      branch = response.branch;
    }

    await this.gitService.push(branch);

    console.log(
      chalk.greenBright(
        `\nSuccessfully pushed '${branch}' using '${accountName}'\n`,
      ),
    );
  }

  async cloneWithAccount(accountName: string, repoUrl: string) {
    console.log(chalk.cyan(`\nCloning with '${accountName}'...\n`));

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const sshUrl = this.gitService.convertRemoteUrl(repoUrl, account.hostAlias);

    console.log(chalk.gray(sshUrl));

    await this.gitService.clone(sshUrl);

    console.log(
      chalk.greenBright(`\nRepository cloned using '${accountName}'\n`),
    );
  }

  async doctor() {
    await this.doctorService.run();
  }

  async testGithubLogin() {
    const device = await this.githubAuthService.startDeviceLogin();

    const token = await this.githubAuthService.pollForToken(
      device.device_code,
      device.interval,
      device.expires_in,
    );

    const user = await this.githubAuthService.getAuthenticatedUser(token);

    console.log(user);
  }
}
