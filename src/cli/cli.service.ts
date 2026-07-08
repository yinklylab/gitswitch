import { Injectable } from '@nestjs/common';
import * as inquirer from 'inquirer';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import figlet from 'figlet';
import { SshService } from '../ssh/ssh.service';
import { GithubService } from '../github/github.service';
import { TokenService } from '../token/token.service';
import { GitService } from '../git/git.service';


@Injectable()
export class CliService {
  constructor(
    private readonly sshService: SshService,
    private readonly githubService: GithubService,
    private readonly tokenService: TokenService,
    private readonly gitService: GitService,
  ) { }

  async runSetup() {
    const { accountName, email, hostAlias } = await inquirer.prompt([
      { name: 'accountName', message: 'Enter GitHub account name:' },
      {
        name: 'email', message: 'Enter email associated with this GitHub account:', validate: (input: string) => {
          if (/\S+@\S+\.\S+/.test(input)) {
            return true;
          }
          return '❌ This does not look like a valid email address.';
        }
      },
      {
        name: 'hostAlias',
        message: 'Enter a custom host alias (e.g., github-work):',
        default: (answers: { accountName: string; }) => `github-${answers.accountName}`,
      },
    ]);

    let token: string | null = await this.tokenService.getToken(accountName);
    let verified = false;

    if (token) {
      console.log(chalk.green('🔐 Using saved GitHub token...'));
      const verification = await this.githubService.verifyAccount(accountName, token);
      if (verification.valid) {
        verified = true;
        console.log(chalk.green(`✅ Verified saved token belongs to '${accountName}'.`));
      } else {
        console.log(chalk.red('❌ Saved token is invalid or expired. It will be removed.'));
        await this.tokenService.deleteToken(accountName);
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
        token = tokenInput.trim() || '';

        const verification = await this.githubService.verifyAccount(accountName, token as string);
        if (token) {
          if (verification.valid) {
            console.log(chalk.green('✅ Token verified and saved securely for future use.'));
            await this.tokenService.saveToken(token, accountName);
            verified = true;
          } else {
            console.log(chalk.red('❌ Invalid token — not saved. Proceeding without token.'));
            token = null;
          }
        } else {
          console.log(chalk.yellow('⚠️ Empty token provided. Proceeding without token.'));
        }
      } else {
        const verification = await this.githubService.verifyAccount(accountName);
        if (verification.valid) {
          console.log(chalk.yellow('⚠️ No token provided — skipping GitHub verification.'));
          console.log(chalk.green('✅ Username exists on GitHub.'));
          verified = true;
        } else {
          console.error(chalk.red('\n❌ Account verification failed. The username does not exist or a network error occurred. Aborting setup.'));
          return;
        }
      }
    }

    if (!verified) {
      console.error(chalk.red('❌ Setup aborted because account could not be verified.'));
      return;
    }

    const keyPath = await this.sshService.generateKey(email, accountName);
    await this.sshService.updateSshConfig(accountName, keyPath, hostAlias);
    await this.githubService.setupGitConfig(accountName, email);

    const publicKeyPath = `${keyPath}.pub`;
    let publicKey = '';
    try {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
    } catch (err) {
      console.error(chalk.red('⚠️  Could not read public key file:'), err.message);
      return;
    }

    if (token) {
      console.log(chalk.cyan('\n🔍 Checking if SSH key already exists on GitHub...'));
      const keyExists = await this.githubService.keyExistsOnGithub(accountName, publicKey, token);

      if (keyExists) {
        console.log(chalk.green('✅ SSH key already exists on your GitHub account — skipping upload.'));
      } else {
        console.log(chalk.yellow('📤 Uploading SSH key to GitHub...'));
        await this.githubService.uploadKey(publicKey, token, hostAlias);
        console.log(chalk.green('🚀 Successfully uploaded SSH key to GitHub!'));
      }
    } else {
      console.log(chalk.yellow('\n🔑 No token provided — skipping GitHub key check/upload.'));
    }

    console.log(chalk.greenBright(`\n✅ Setup complete for ${accountName} (${hostAlias})\n`));

    console.log(chalk.white('Here\'s your SSH public key — copy it and add it to GitHub:\n'));
    console.log(chalk.yellow.bold('──────────────────────────────────────────────'));
    console.log(chalk.cyan(publicKey));
    console.log(chalk.yellow.bold('──────────────────────────────────────────────\n'));

    const copied = await this.sshService.copyPublicKeyToClipboard(accountName);
    if (copied) {
      console.log(chalk.green('📋 Your SSH public key has been copied to your clipboard.'));
      console.log('\n🔑 If you need to recopy later, navigate to ' + keyPath);
    } else {
      console.log(chalk.yellow('⚠️ Could not copy key to clipboard automatically.'));
      console.log(chalk.white(`You can manually copy it from:`));
      console.log(chalk.gray(publicKeyPath));
    }
    console.log('\n' + chalk.magenta.bold('👉 Next Steps:'));
    console.log(`${chalk.white('1️⃣ Go to')} ${chalk.blueBright('https://github.com/settings/keys')}`);
    console.log(`${chalk.white('2️⃣ Click')} ${chalk.green('"New SSH key"')}`);
    console.log(`${chalk.white('3️⃣ Paste the above key into the field')}`);
    console.log(`${chalk.white('4️⃣ Give it a recognizable title (e.g.,')} ${chalk.yellow(hostAlias)}${chalk.white(')')}`);
    console.log(`${chalk.white('5️⃣ Click')} ${chalk.green('"Add SSH key"')}`);
    console.log(`\n${chalk.greenBright('🎉 You’re all set!')} ${chalk.white('Use your new identity via:')}`);
    console.log(chalk.cyan(`git@${hostAlias}:<username>/<repo>.git\n`));
  }

  async listAccounts() {
    console.log(chalk.cyan.bold('\n📜 Listing configured GitHub accounts...\n'));

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
      console.log(`${chalk.cyan(i + 1 + '.')}\t${chalk.white(acc.name)}\t${mark}`);
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
      const isConfigDeleted = await this.githubService.deleteAccountConfig(_accountToDelete as string);
      const isSSHDeleted = await this.sshService.deleteSSHKeys(_accountToDelete as string);
      await this.sshService.removeFromSshConfig(_accountToDelete as string);

      if (isConfigDeleted && isSSHDeleted) {
        console.log(chalk.green(`\n✅ Successfully removed account '${_accountToDelete}'.\n`));
        return;
      }
      console.error(chalk.red(`❌ Could not find account: '${_accountToDelete}'`));
    } catch (err: any) {
      console.error(chalk.red(`❌ Error deleting account '${_accountToDelete}': ${err.message}`));
    }
  }

  async verifyAccount(username: string, token?: string): Promise<void> {
    console.log(chalk.cyan(`\n🔍 Verifying GitHub account: ${username}...`));
    await this.githubService.verifyAccount(username, token);
  }

  async showMainMenu() {
    console.log(chalk.yellow.bold(
      figlet.textSync('Git Switch', { horizontalLayout: 'full' })
    ));

    console.log(chalk.cyan.bold('\n🚀 Git Switch: Multi-account GitHub Management 🚀'));
    console.log(chalk.white('   Easily manage and switch between your personal and work GitHub accounts.\n'));

    const choices = [
      {
        name: chalk.green.bold('⚙️  Setup New Account') + chalk.dim(' - Run the initial account setup wizard.'),
        value: 'setup'
      },
      {
        name: chalk.blue.bold('📋  List Accounts') + chalk.dim(' - See all currently configured GitHub profiles.'),
        value: 'list'
      },
      {
        name: chalk.magenta.bold('🔄  Switch Account') + chalk.dim(' - Change your active global Git user.'),
        value: 'switch'
      },
      {
        name: chalk.red.bold('🗑️  Delete Account') + chalk.dim(' - Remove an account configuration from Git Switch.'),
        value: 'delete'
      },
      {
        name: chalk.yellow.bold('✔️  Verify Account') + chalk.dim(' - Check if a username or token is valid on GitHub.'),
        value: 'verify'
      },
      {
        name: chalk.cyan.bold('👤 Current Account') + chalk.dim(' - Show active GitSwitch profile.'),
        value: 'current'
      },
      {
        name: chalk.cyan.bold('🚀 Workflow Guide') + chalk.dim(' - Learn how to use GitSwitch.'),
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
      case 'switch':
        const { accountToSwitch } = await inquirer.prompt([
          {
            type: 'input',
            name: 'accountToSwitch',
            message: chalk.magenta('Enter the account name you want to switch to:'),
            validate: (input) => input.trim().length > 0 ? true : 'Account name cannot be empty.',
          },
        ]);
        await this.switchAccount(accountToSwitch);
        break;
      case 'delete':
        const { accountToDelete } = await inquirer.prompt([
          {
            type: 'input',
            name: 'accountToDelete',
            message: chalk.red('Enter the name of the account to DELETE:'),
            validate: (input) => input.trim().length > 0 ? true : 'Account name cannot be empty.',
          },
        ]);
        await this.deleteAccount(accountToDelete);
        break;
      case 'current':
        await this.currentAccount();
        break;
      case 'guide':
        await this.showGuide();
        break;
      case 'verify':
        const { username, token } = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: chalk.yellow('Enter the GitHub username to verify:'),
            validate: (input) => input.trim().length > 0 ? true : 'Username cannot be empty.',
          },
          {
            type: 'input',
            name: 'token',
            message: chalk.yellow('Enter the optional GitHub Personal Access Token (press Enter to skip):')
          },
        ]);
        await this.verifyAccount(username, token);
        break;
      default:
        console.log(chalk.yellow('Command not recognized.'));
    }
  }

  async currentAccount() {

    console.log(
      chalk.cyan.bold(
        '\n👤 Active GitSwitch Profile\n'
      )
    );


    const profile =
      await this.githubService.getActiveProfile();


    if (!profile.name) {

      console.log(
        chalk.yellow(
          '⚠️ No active GitSwitch account found.'
        )
      );


      console.log(
        chalk.gray(
          'Run: gitswitch use <account>'
        )
      );


      return;
    }


    const repo =
      await this.gitService.getRepositoryName();


    const branch =
      await this.gitService.getCurrentBranch();


    const remote =
      await this.gitService.getRemote();


    console.log(
      `${chalk.green('Account:')} ${profile.name}`
    );


    console.log(
      `${chalk.green('Email:')} ${profile.email}`
    );


    console.log(
      `${chalk.green('SSH:')} github-${profile.name}`
    );


    console.log(
      `${chalk.green('Repository:')} ${repo ?? 'Not inside repository'}`
    );


    console.log(
      `${chalk.green('Branch:')} ${branch ?? '-'}`
    );


    console.log(
      `${chalk.green('Remote:')} ${remote ?? '-'}`
    );


    console.log();
  }

  async showGuide() {
    console.log(
      chalk.cyan.bold(
        '\n🚀 ===GitSwitch Workflow Guide===\n'
      )
    );

    console.log(
      chalk.green.bold(
        '1️⃣  Setup a GitHub account'
      )
    );

    console.log(
      chalk.white(
        'Configure your GitHub identity, SSH key and authentication.'
      )
    );

    console.log(
      chalk.cyan(
        'gitswitch setup\n'
      )
    );


    console.log(
      chalk.green.bold(
        '2️⃣  Clone a repository with an account'
      )
    );

    console.log(
      chalk.white(
        'Clone repositories using a configured GitSwitch profile.'
      )
    );

    console.log(
      chalk.cyan(
        'gitswitch clone work git@github.com:user/project.git\n'
      )
    );


    console.log(
      chalk.green.bold(
        '3️⃣  Switch an existing repository remote'
      )
    );

    console.log(
      chalk.white(
        'Move an existing repo from one GitHub identity to another.'
      )
    );

    console.log(
      chalk.cyan(
        'gitswitch remote work\n'
      )
    );


    console.log(
      chalk.green.bold(
        '4️⃣  Push using a specific account'
      )
    );

    console.log(
      chalk.white(
        'Push code with your selected GitHub identity.'
      )
    );

    console.log(
      chalk.cyan(
        'gitswitch push work\n'
      )
    );


    console.log(
      chalk.green.bold(
        '5️⃣  Check current identity'
      )
    );

    console.log(
      chalk.cyan(
        'gitswitch current\n'
      )
    );


    console.log(
      chalk.magenta.bold(
        '✨ Tip'
      )
    );

    console.log(
      chalk.gray(
        'Run `gitswitch list` anytime to view your configured accounts.\n'
      )
    );
  }
}
