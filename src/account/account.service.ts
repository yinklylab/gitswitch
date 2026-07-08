import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { GitSwitchAccount } from './account.interface';


@Injectable()
export class AccountService {

  private baseDir =
    path.join(
      os.homedir(),
      '.gitswitch'
    );


  private accountFile =
    path.join(
      this.baseDir,
      'accounts.json'
    );


  private async ensureStorage() {

    await fs.ensureDir(
      this.baseDir
    );


    if (
      !(await fs.pathExists(this.accountFile))
    ) {

      await fs.writeJson(
        this.accountFile,
        {},
        {
          spaces:2
        }
      );

    }

  }



  async saveAccount(
    account: GitSwitchAccount
  ) {

    await this.ensureStorage();


    const accounts =
      await this.getAccounts();


    accounts[
      account.name
    ] = account;


    await fs.writeJson(
      this.accountFile,
      accounts,
      {
        spaces:2
      }
    );

  }




  async getAccounts(): Promise<Record<string,GitSwitchAccount>> {

    await this.ensureStorage();


    return fs.readJson(
      this.accountFile
    );

  }




  async getAccount(
    name:string
  ): Promise<GitSwitchAccount | null> {


    const accounts =
      await this.getAccounts();


    return accounts[name] ?? null;

  }




  async deleteAccount(
    name:string
  ) {

    const accounts =
      await this.getAccounts();


    delete accounts[name];


    await fs.writeJson(
      this.accountFile,
      accounts,
      {
        spaces:2
      }
    );
  }

}
