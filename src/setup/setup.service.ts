import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { GithubAuthService } from '../auth/github-auth.service';
import { GithubService } from '../github/github.service';
import { SshService } from '../ssh/ssh.service';
import { TokenService } from '../token/token.service';
import { AccountService } from '../account/account.service';

@Injectable()
export class SetupService {
  constructor(
    private readonly githubAuthService: GithubAuthService,
    private readonly githubService: GithubService,
    private readonly sshService: SshService,
    private readonly tokenService: TokenService,
    private readonly accountService: AccountService,
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

    const publicKey = await this.sshService.getPublicKey(sshKeyName);

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

    const publicKey = await this.sshService.getPublicKey(sshKeyName);

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

        console.log(chalk.gray(`Copy it manually from: ${keyPath}.pub`));
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
}
