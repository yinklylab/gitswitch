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

  async runSetup() {
    console.log(chalk.cyan.bold('\n🚀 Welcome to GitSwitch\n'));

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
      console.log(chalk.yellow(`⚠️ Profile '${profile}' already exists.`));

      return;
    }

    //
    // GitHub OAuth Login
    //

    const device = await this.githubAuthService.startDeviceLogin();

    const token = await this.githubAuthService.pollForToken(
      device.device_code,
      device.interval,
    );

    await this.tokenService.saveToken(profile, token);

    console.log(chalk.green('🔐 GitHub token stored securely'));

    //
    // Get GitHub user
    //

    const githubUser = await this.githubAuthService.getAuthenticatedUser(token);
    const githubUsername = githubUser.username;
    const gitName = githubUser.name;
    const email = githubUser.email;
    const hostAlias = `github-${profile}`;

    console.log(chalk.green(`\n✅ Connected to GitHub as ${githubUsername}`));

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

    console.log(chalk.cyan('\n☁️ Uploading SSH key to GitHub...'));

    const keyExists = await this.githubService.keyExistsOnGithub(
      githubUsername,
      publicKey,
      token,
    );

    if (keyExists) {
      console.log(chalk.green('✓ SSH key already exists on GitHub'));
    } else {
      await this.githubService.uploadKey(publicKey, token, hostAlias);

      console.log(chalk.green('✓ SSH key added to GitHub'));
    }

    console.log(chalk.cyan('\n🔍 Verifying SSH connection...'));

    const sshConnection = await this.sshService.testConnection(hostAlias);

    if (!sshConnection.connected) {
      console.log(chalk.yellow('⚠️ SSH connection could not be verified.'));

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
          `❌ SSH authenticated as '${sshConnection.username}', expected '${githubUsername}'.`,
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

    console.log(chalk.greenBright('\n🎉 GitSwitch setup complete\n'));

    console.log(`${chalk.bold('Profile:')} ${profileName}`);
    console.log(`${chalk.bold('GitHub:')} ${githubUsername}`);
    console.log(`${chalk.bold('SSH:')} ${hostAlias}`);

    console.log(`${chalk.bold('SSH Status')} ${chalk.green('Connected ✓')}`);

    console.log(chalk.cyan('\nYou can now use:\n'));

    console.log(chalk.white(`  gitswitch clone ${profileName} <repo>`));

    console.log(chalk.white(`  gitswitch push ${profileName}`));

    console.log();
  }

  async listAccounts() {
    console.log(
      chalk.cyan.bold('\n📜 Listing configured GitHub accounts...\n'),
    );

    const accounts = await this.githubService.listAccounts();
    const active = await this.githubService.getActiveAccount();

    if (!accounts.length) {
      console.log(chalk.yellow('⚠️ No configured GitHub accounts found.'));
      console.log(chalk.gray('\n💡 Run `gitswitch setup` to add one.\n'));
      return;
    }

    console.log(chalk.white('🔐 Configured Accounts:\n'));
    accounts.forEach((acc, i) => {
      const isActive = acc.name === active;
      const mark = isActive ? chalk.greenBright('⭐ Active') : '';
      console.log(
        `${chalk.cyan(i + 1 + '.')}\t${chalk.white(acc.name)}\t${mark}`,
      );
    });

    console.log();
  }

  async switchAccount(accountName?: string) {
    console.log(`🔀 Switching to account: ${accountName || '(prompting...)'}`);
    let target = accountName;

    if (!target) {
      const accounts = await this.githubService.listAccounts();
      if (accounts.length === 0) {
        console.log('⚠️  No accounts configured yet.');
        return;
      }

      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select an account to activate:',
          choices: accounts,
        },
      ]);

      target = selected;
    }

    if (typeof target === 'string') {
      await this.githubService.switchAccount(target);
      return;
    } else {
      console.log('⚠️  No account selected to switch.');
    }
  }

  async deleteAccount(accountName?: string) {
    console.log(chalk.cyan('\n🧹 GitHub Account Cleanup\n'));

    let _accountToDelete = accountName;
    if (!_accountToDelete) {
      const accounts = await this.githubService.listAccounts();

      if (accounts.length === 0) {
        console.log(chalk.yellow('⚠️ No accounts found.'));
        return;
      }

      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select the account you want to delete:',
          choices: accounts,
        },
      ]);

      _accountToDelete = selected;
    }
    const { confirmDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDelete',
        message: `Are you sure you want to delete all local data for '${_accountToDelete}'?`,
        default: false,
      },
    ]);

    if (!confirmDelete) {
      console.log(chalk.gray('❎ Deletion canceled.'));
      return;
    }

    try {
      await this.tokenService.deleteToken(_accountToDelete as string);
      const isConfigDeleted = await this.githubService.deleteAccountConfig(
        _accountToDelete as string,
      );
      const isSSHDeleted = await this.sshService.deleteSSHKeys(
        _accountToDelete as string,
      );
      await this.sshService.removeFromSshConfig(_accountToDelete as string);
      await this.accountService.deleteAccount(_accountToDelete as string);

      if (isConfigDeleted && isSSHDeleted) {
        console.log(
          chalk.green(
            `\n✅ Successfully removed account '${_accountToDelete}'.\n`,
          ),
        );
        return;
      }
      console.error(
        chalk.red(`❌ Could not find account: '${_accountToDelete}'`),
      );
    } catch (err: any) {
      console.error(
        chalk.red(
          `❌ Error deleting account '${_accountToDelete}': ${err.message}`,
        ),
      );
    }
  }

  async verifyAccount(username: string, token?: string): Promise<void> {
    console.log(chalk.cyan(`\n🔍 Verifying GitHub account: ${username}...`));
    await this.githubService.verifyAccount(username, token);
  }

  async showMainMenu() {
    console.log(
      chalk.yellow.bold(
        figlet.textSync('Git Switch', { horizontalLayout: 'full' }),
      ),
    );

    console.log(
      chalk.cyan.bold('\n🚀 Git Switch: Multi-account GitHub Management 🚀'),
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
        await this.runSetup();
        break;
      case 'list':
        await this.listAccounts();
        break;
      case 'switch': {
        const { accountToSwitch } = await inquirer.prompt([
          {
            type: 'input',
            name: 'accountToSwitch',
            message: chalk.magenta(
              'Enter the account name you want to switch to:',
            ),
            validate: (input) =>
              input.trim().length > 0 ? true : 'Account name cannot be empty.',
          },
        ]);
        await this.switchAccount(accountToSwitch);
        break;
      }
      case 'delete': {
        const { accountToDelete } = await inquirer.prompt([
          {
            type: 'input',
            name: 'accountToDelete',
            message: chalk.red('Enter the name of the account to DELETE:'),
            validate: (input) =>
              input.trim().length > 0 ? true : 'Account name cannot be empty.',
          },
        ]);
        await this.deleteAccount(accountToDelete);
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
    console.log(chalk.cyan.bold('\n👤 Active GitSwitch Profile\n'));

    const profile = await this.githubService.getActiveProfile();

    if (!profile.name) {
      console.log(chalk.yellow('⚠️ No active GitSwitch account found.'));

      console.log(chalk.gray('Run: gitswitch use <account>'));

      return;
    }

    const repo = await this.gitService.getRepositoryName();

    const branch = await this.gitService.getCurrentBranch();

    const remote = await this.gitService.getRemote();

    console.log(`${chalk.green('Account:')} ${profile.name}`);

    console.log(`${chalk.green('Email:')} ${profile.email}`);

    console.log(`${chalk.green('SSH:')} github-${profile.name}`);

    console.log(
      `${chalk.green('Repository:')} ${repo ?? 'Not inside repository'}`,
    );

    console.log(`${chalk.green('Branch:')} ${branch ?? '-'}`);

    console.log(`${chalk.green('Remote:')} ${remote ?? '-'}`);

    console.log();
  }

  showGuide() {
    console.log(chalk.cyan.bold('\n🚀 ===GitSwitch Workflow Guide===\n'));

    console.log(chalk.green.bold('1️⃣  Setup a GitHub account'));

    console.log(
      chalk.white(
        'Configure your GitHub identity, SSH key and authentication.',
      ),
    );

    console.log(chalk.cyan('gitswitch setup\n'));

    console.log(chalk.green.bold('2️⃣  Clone a repository with an account'));

    console.log(
      chalk.white('Clone repositories using a configured GitSwitch profile.'),
    );

    console.log(
      chalk.cyan('gitswitch clone work git@github.com:user/project.git\n'),
    );

    console.log(chalk.green.bold('3️⃣  Switch an existing repository remote'));

    console.log(
      chalk.white('Move an existing repo from one GitHub identity to another.'),
    );

    console.log(chalk.cyan('gitswitch remote work\n'));

    console.log(chalk.green.bold('4️⃣  Push using a specific account'));

    console.log(chalk.white('Push code with your selected GitHub identity.'));

    console.log(chalk.cyan('gitswitch push work\n'));

    console.log(chalk.green.bold('5️⃣  Check current identity'));

    console.log(chalk.cyan('gitswitch current\n'));

    console.log(chalk.magenta.bold('✨ Tip'));

    console.log(
      chalk.gray(
        'Run `gitswitch list` anytime to view your configured accounts.\n',
      ),
    );
  }

  async switchRemote(accountName: string) {
    console.log(
      chalk.cyan(`\n🔀 Switching repository remote to '${accountName}'...\n`),
    );

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`❌ Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const isRepo = await this.gitService.isGitRepository();

    if (!isRepo) {
      console.log(chalk.red('❌ Current directory is not a Git repository.'));

      return;
    }

    const currentRemote = await this.gitService.getRemote();

    if (!currentRemote) {
      console.log(chalk.yellow('⚠️ No remote origin found.'));

      return;
    }

    const newRemote = this.gitService.convertRemoteUrl(
      currentRemote,
      account.hostAlias,
    );

    await this.gitService.setRemote(newRemote);

    console.log(chalk.green('\n✅ Repository account switched successfully'));

    console.log(chalk.gray(newRemote));
  }

  async pushWithAccount(accountName: string, targetBranch?: string) {
    console.log(chalk.cyan(`\n🚀 Preparing push with '${accountName}'...\n`));

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`❌ Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const isRepo = await this.gitService.isGitRepository();

    if (!isRepo) {
      console.log(chalk.red('❌ Current directory is not a Git repository.'));

      return;
    }

    // Magic part 🔥
    // Automatically switch origin URL
    await this.switchRemote(accountName);

    const currentBranch = await this.gitService.getCurrentBranch();

    if (!currentBranch && !targetBranch) {
      console.log(chalk.red('❌ Unable to detect current branch.'));

      return;
    }

    if (targetBranch) {
      console.log(chalk.cyan(`🚀 Pushing directly to '${targetBranch}'`));

      await this.gitService.push(targetBranch);

      console.log(
        chalk.greenBright(
          `\n🎉 Successfully pushed '${targetBranch}' using '${accountName}'\n`,
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
        `\n🎉 Successfully pushed '${branch}' using '${accountName}'\n`,
      ),
    );
  }

  async cloneWithAccount(accountName: string, repoUrl: string) {
    console.log(chalk.cyan(`\n📦 Cloning with '${accountName}'...\n`));

    const account = await this.accountService.getAccount(accountName);

    if (!account) {
      console.log(chalk.red(`❌ Account '${accountName}' does not exist.`));

      console.log(chalk.gray('Run: gitswitch setup'));

      return;
    }

    const sshUrl = this.gitService.convertRemoteUrl(repoUrl, account.hostAlias);

    console.log(chalk.gray(sshUrl));

    await this.gitService.clone(sshUrl);

    console.log(
      chalk.greenBright(`\n🎉 Repository cloned using '${accountName}'\n`),
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
    );

    const user = await this.githubAuthService.getAuthenticatedUser(token);

    console.log(user);
  }
}
