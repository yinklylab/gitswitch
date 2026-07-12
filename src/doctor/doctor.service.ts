import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import { GitService } from '../git/git.service';
import { AccountService } from '../account/account.service';
import { SshService } from '../ssh/ssh.service';

@Injectable()
export class DoctorService {
  constructor(
    private readonly gitService: GitService,
    private readonly accountService: AccountService,
    private readonly sshService: SshService,
  ) {}

  private success(message: string) {
    console.log(chalk.green(`${message}`));
  }

  private warning(message: string) {
    console.log(chalk.yellow(`${message}`));
  }

  private error(message: string) {
    console.log(chalk.red(`${message}`));
  }

  async run() {
    console.log(chalk.cyan.bold('\nGitSwitch Health Check\n'));

    this.checkGit();
    this.checkSSH();
    this.checkGitSwitchAliases();

    await this.checkAccounts();
    await this.checkRepository();

    console.log(chalk.greenBright('\nHealth check completed\n'));
  }

  private checkGit() {
    try {
      const version = execSync('git --version').toString().trim();

      this.success(`Git installed (${version})`);
    } catch {
      this.error('Git is not installed');
    }
  }

  private checkSSH() {
    try {
      execSync('ssh -V', {
        stdio: 'ignore',
      });

      this.success('SSH installed');
    } catch {
      this.error('SSH is missing');
    }
  }

  private async checkGitSwitchAliases() {
    const accounts = await this.accountService.listAccounts();

    if (!accounts.length) {
      this.warning('No GitSwitch SSH profiles to verify');
      return;
    }

    for (const account of accounts) {
      const connection = await this.sshService.testConnection(
        account.hostAlias,
      );

      if (!connection.connected) {
        this.error(
          `${account.profile} SSH connection failed (${account.hostAlias})`,
        );

        if (process.env.DEBUG && connection.message) {
          console.log(chalk.gray(connection.message));
        }

        continue;
      }

      if (
        account.githubUsername &&
        connection.username?.toLowerCase() !==
          account.githubUsername.toLowerCase()
      ) {
        this.error(
          `${account.profile} authenticated as '${connection.username}', expected '${account.githubUsername}'`,
        );

        continue;
      }

      this.success(
        `${account.profile} SSH connected as ${connection.username}`,
      );
    }
  }

  private async checkAccounts() {
    const accounts = await this.accountService.getAccounts();

    const names = Object.keys(accounts);

    if (!names.length) {
      this.error('No GitSwitch accounts configured');

      return;
    }

    this.success(`${names.length} GitSwitch account(s) configured`);

    for (const account of names) {
      const sshKey = accounts[account].sshKey;

      if (await fs.pathExists(sshKey)) {
        this.success(`${account} SSH key exists`);
      } else {
        this.error(`${account} SSH key missing`);
      }
    }
  }

  private async checkRepository() {
    const isRepo = await this.gitService.isGitRepository();

    if (!isRepo) {
      this.warning('Current directory is not a Git repository');

      return;
    }

    this.success('Current directory is a Git repository');

    const branch = await this.gitService.getCurrentBranch();

    if (branch) {
      this.success(`Current branch: ${branch}`);
    }

    const remote = await this.gitService.getRemote();

    if (remote) {
      this.success(`Remote configured: ${remote}`);
    } else {
      this.warning('No remote configured');
    }
  }
}
