import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { GitSwitchAccount, StoredGitSwitchAccount } from './account.interface';

@Injectable()
export class AccountService {
  private baseDir = path.join(os.homedir(), '.gitswitch');

  private accountFile = path.join(this.baseDir, 'accounts.json');

  private async ensureStorage() {
    await fs.ensureDir(this.baseDir);

    if (!(await fs.pathExists(this.accountFile))) {
      await fs.writeJson(
        this.accountFile,
        {},
        {
          spaces: 2,
        },
      );
    }
  }

  async saveAccount(account: GitSwitchAccount) {
    await this.ensureStorage();

    const accounts = await this.getAccounts();

    accounts[account.profile] = account;

    await fs.writeJson(this.accountFile, accounts, {
      spaces: 2,
    });
  }

  async getAccounts(): Promise<Record<string, GitSwitchAccount>> {
    await this.ensureStorage();

    const accounts: Record<string, StoredGitSwitchAccount> = await fs.readJson(
      this.accountFile,
    );

    return Object.fromEntries(
      Object.entries(accounts).map(([profileKey, account]) => [
        profileKey,
        this.normalizeAccount(profileKey, account),
      ]),
    );
  }

  async getAccount(name: string): Promise<GitSwitchAccount | null> {
    const accounts = await this.getAccounts();

    return accounts[name] ?? null;
  }

  async deleteAccount(name: string) {
    const accounts = await this.getAccounts();

    delete accounts[name];

    await fs.writeJson(this.accountFile, accounts, {
      spaces: 2,
    });
  }

  private normalizeAccount(
    profileKey: string,
    account: StoredGitSwitchAccount,
  ): GitSwitchAccount {
    const isLegacyAccount = !account.profile;

    return {
      profile: account.profile ?? profileKey,

      githubUsername: account.githubUsername ?? profileKey,

      name: isLegacyAccount
        ? profileKey
        : (account.name ?? account.githubUsername ?? profileKey),
      email: account.email ?? '',
      hostAlias: account.hostAlias ?? `github-${profileKey}`,
      sshKey: account.sshKey ?? '',
      authType: account.authType ?? 'token',
      createdAt: account.createdAt ?? new Date().toISOString(),
    };
  }
}
