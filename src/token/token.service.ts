import * as keytar from 'keytar';
import chalk from 'chalk';

const SERVICE_NAME = 'GitSwitch CLI';

export class TokenService {
  async saveToken(profileName: string, token: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, profileName, token);
  }

  async getToken(profileName: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, profileName);
  }

  async deleteToken(profileName: string): Promise<boolean> {
    const deleted = await keytar.deletePassword(SERVICE_NAME, profileName);
    if (deleted) {
      console.log(chalk.yellow(`Deleted saved token for ${profileName}.`));
      return true;
    } else {
      console.log(chalk.gray(`No saved token found for ${profileName}.`));
      return false;
    }
  }
}
