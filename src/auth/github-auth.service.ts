import { Injectable } from '@nestjs/common';
import axios from 'axios';
import chalk from 'chalk';
import open from 'open';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
}

@Injectable()
export class GithubAuthService {
  private readonly clientId = 'Ov23liR0KT1ogc7x2cru';

  /**
   * Starts GitHub Device Authorization
   */
  async startDeviceLogin(): Promise<DeviceCodeResponse> {
    if (!this.clientId) {
      throw new Error('Missing GitHub OAuth Client ID');
    }

    const response = await axios.post<DeviceCodeResponse>(
      'https://github.com/login/device/code',
      {
        client_id: this.clientId,
        scope: 'read:user user:email admin:public_key',
      },
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    console.log(chalk.cyan('\n🔐 Connect your GitHub account...\n'));

    console.log(
      `${chalk.white('Enter code:')} ${chalk.yellow.bold(
        response.data.user_code,
      )}\n`,
    );

    console.log(chalk.gray('Opening GitHub in your browser...'));
    try {
      await open(response.data.verification_uri);
    } catch {
      console.log(chalk.yellow('⚠️ Could not open browser automatically.'));
    }

    console.log(
      `\nIf nothing opened, visit:\n${chalk.green(
        response.data.verification_uri,
      )}\n`,
    );

    return response.data;
  }

  /**
   * Wait until user approves GitHub login
   */
  async pollForToken(deviceCode: string, interval: number): Promise<string> {
    console.log(chalk.gray('Waiting for GitHub authorization...\n'));

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));

      const response = await axios.post<AccessTokenResponse>(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.clientId,

          device_code: deviceCode,

          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        },
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (response.data.access_token) {
        console.log(chalk.green('✅ GitHub authentication successful'));

        return response.data.access_token;
      }

      if (
        response.data.error &&
        response.data.error !== 'authorization_pending'
      ) {
        throw new Error(response.data.error);
      }
    }
  }

  /**
   * Retrieve logged-in GitHub user
   */
  async getAuthenticatedUser(token: string) {
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const user = userResponse.data;

    let email = user.email;

    if (!email) {
      const emailResponse = await axios.get(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );

      const primaryEmail = emailResponse.data.find(
        (item: { primary: any; verified: any }) =>
          item.primary && item.verified,
      );

      email = primaryEmail?.email ?? `${user.login}@users.noreply.github.com`;
    }

    return {
      username: user.login,
      name: user.name ?? user.login,
      email,
      avatar: user.avatar_url,
    };
  }
}
