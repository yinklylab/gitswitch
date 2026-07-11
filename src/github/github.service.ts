import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';
import axios from 'axios';
import chalk from 'chalk';
import { TokenService } from '../token/token.service';

@Injectable()
export class GithubService {
  constructor(private readonly tokenService: TokenService) {}
  private homeDir = os.homedir();
  private mainGitConfig = path.join(this.homeDir, '.gitconfig');
  private baseUrl =
    process.env.GITHUB_USERS_URL || 'https://api.github.com/users';

  async verifyAccount(
    username: string,
    token?: string,
  ): Promise<{
    valid: boolean;
    reason?: string;
    authenticatedUser?: string;
    hasToken?: boolean;
  }> {
    if (!token) {
      console.log(
        chalk.yellow(
          '⚠️ No GitHub token provided. Checking if username exists...',
        ),
      );
      try {
        const response = await axios.get(`${this.baseUrl}/${username}`, {
          headers: {
            'User-Agent': 'GitSwitch',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        const { login } = response.data || {};

        if (
          response.status === 200 &&
          login?.toLowerCase() === username.toLowerCase()
        ) {
          console.log(chalk.green(`✅ GitHub account '${username}' exists.`));
          return { valid: true, hasToken: false };
        }
        console.log(chalk.red(`❌ GitHub account '${username}' not found.`));
        return { valid: false, reason: 'api_error', hasToken: false };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            console.error(
              chalk.red(`❌ GitHub account '${username}' not found.`),
            );

            return {
              valid: false,
              reason: 'not_found',
              hasToken: false,
            };
          }

          if (error.response?.status === 403) {
            console.log(chalk.yellow('⚠️ GitHub API rate limit reached.'));

            console.log(
              chalk.yellow('Skipping online verification. Continuing setup...'),
            );

            return {
              valid: true,
              reason: 'rate_limit',
              hasToken: false,
            };
          }

          if (error.code === 'ENOTFOUND') {
            console.error(
              chalk.red(
                '❌ Verification failed! Please check your internet connection',
              ),
            );

            return {
              valid: false,
              reason: 'ENOTFOUND',
              hasToken: false,
            };
          }
        }

        const errorMessage = (error as Error)?.message || String(error);

        console.error(
          chalk.red(`⚠️ Error verifying GitHub account:`),
          errorMessage,
        );

        return {
          valid: false,
          reason: 'network_error',
          hasToken: false,
        };
      }
    }

    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'GitSwitch',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      const { login: authenticatedUser } = response.data || {};
      if (!authenticatedUser) {
        console.error(
          chalk.red('⚠️ Received unexpected response from GitHub API /user.'),
        );
        return { valid: false, reason: 'api_error', hasToken: true };
      }

      if (authenticatedUser.toLowerCase() === username.toLowerCase()) {
        console.log(chalk.green(`✅ Verified token belongs to '${username}'.`));
        return { valid: true, authenticatedUser, hasToken: true };
      } else {
        console.log(
          chalk.red(
            `❌ Token belongs to '${authenticatedUser}', not '${username}'. Please check the token.`,
          ),
        );
        return {
          valid: false,
          reason: 'wrong_user',
          authenticatedUser,
          hasToken: true,
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          console.log(chalk.red('❌ Invalid or expired GitHub token.'));
          return { valid: false, reason: 'unauthorized', hasToken: true };
        }
      }
      const errorMessage = (error as Error)?.message || String(error);
      console.log(chalk.red(`⚠️ Error verifying token: ${errorMessage}`));
      return { valid: false, reason: 'network_error', hasToken: true };
    }
  }

  async setupGitConfig(
    profileName: string,
    name: string,
    email: string,
  ): Promise<void> {
    const gitConfigPath = path.join(os.homedir(), `.gitconfig-${profileName}`);
    const gitConfigContent = `
    [user]
      name = ${name}
      email = ${email}
    `;

    await fs.writeFile(gitConfigPath, gitConfigContent);
  }

  async listAccounts(): Promise<{ name: string; validToken: boolean }[]> {
    const files = await fs.readdir(this.homeDir);
    const accountFiles = files.filter((f) => f.startsWith('.gitconfig-'));
    const accounts: { name: string; validToken: boolean }[] = [];

    for (const file of accountFiles) {
      const accountName = file.replace('.gitconfig-', '');
      const token = await this.tokenService.getToken(accountName);
      let verification = { valid: false };

      if (token) {
        verification = await this.verifyAccount(accountName, token);
      }

      accounts.push({ name: accountName, validToken: verification.valid });
    }

    return accounts;
  }

  async deleteAccountConfig(accountName: string): Promise<boolean> {
    const filePath = path.join(this.homeDir, `.gitconfig-${accountName}`);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(chalk.yellow(`🗑️  Deleted ${filePath}`));
      return true;
    } else {
      console.log(chalk.gray(`ℹ️  No local config found for ${accountName}.`));
      return false;
    }
  }

  async switchAccount(username: string): Promise<void> {
    const configPath = path.join(this.homeDir, `.gitconfig-${username}`);
    const mainConfig = path.join(this.homeDir, '.gitconfig');
    const activeFile = path.join(this.homeDir, '.active-account');

    try {
      await fs.access(configPath);
    } catch {
      console.log(chalk.red(`❌ Account '${username}' does not exist.`));
      return;
    }

    const token = await this.tokenService.getToken(username);
    if (!token) {
      console.log(
        chalk.yellow(
          `⚠️ No token found for '${username}'. Proceeding without verification...`,
        ),
      );
    } else {
      const isValid = await this.verifyAccount(username, token);
      if (!isValid) {
        console.log(
          chalk.red(
            `❌ Invalid or expired token for '${username}'. Aborting switch.`,
          ),
        );
        return;
      }
    }

    try {
      await fs.copyFile(configPath, mainConfig);
    } catch (err) {
      console.log(chalk.red(`❌ Failed to update .gitconfig: ${err.message}`));
      return;
    }

    try {
      await fs.writeFile(activeFile, username, 'utf8');
    } catch (err) {
      console.log(
        chalk.red(`⚠️ Could not record active account: ${err.message}`),
      );
    }

    console.log(chalk.green(`✅ Switched successfully to '${username}'.`));
  }

  async getActiveAccount(): Promise<string | null> {
    if (!(await fs.pathExists(this.mainGitConfig))) return null;
    const content = await fs.readFile(this.mainGitConfig, 'utf-8');
    const match = content.match(/name\s*=\s*(.*)/);
    return match ? match[1].trim() : null;
  }

  async cloneRepoWithAccount(
    repoUrl: string,
    accountAlias: string,
    targetDir: string,
  ) {
    const git = simpleGit();
    const sshUrl = repoUrl.replace('github.com', `${accountAlias}`);
    await git.clone(sshUrl, targetDir);
  }

  async keyExistsOnGithub(
    username: string,
    publicKey: string,
    token: string,
  ): Promise<boolean> {
    try {
      const response = await axios.get('https://api.github.com/user/keys', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'GitSwitch',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      const keys = response.data as { key: string }[];
      return keys.some((k) => k.key.trim() === publicKey.trim());
    } catch (err) {
      console.error(
        chalk.red('⚠️ Could not verify SSH key on GitHub:'),
        err.response?.data || err.message,
      );
      return false;
    }
  }

  async uploadKey(
    publicKey: string,
    token: string,
    title: string,
  ): Promise<void> {
    const response = await fetch('https://api.github.com/user/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: `GitSwitch - ${title}`, key: publicKey }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`GitHub key upload failed: ${err}`);
    }
  }

  async getActiveProfile(): Promise<{
    name: string | null;
    email: string | null;
  }> {
    if (!(await fs.pathExists(this.mainGitConfig))) {
      return {
        name: null,
        email: null,
      };
    }

    const content = await fs.readFile(this.mainGitConfig, 'utf-8');

    const nameMatch = content.match(/name\s*=\s*(.*)/);

    const emailMatch = content.match(/email\s*=\s*(.*)/);

    return {
      name: nameMatch ? nameMatch[1].trim() : null,

      email: emailMatch ? emailMatch[1].trim() : null,
    };
  }
}
