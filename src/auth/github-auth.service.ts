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
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
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

    console.log(chalk.cyan('\nConnect your GitHub account...\n'));

    console.log(
      `${chalk.white('Enter code:')} ${chalk.yellow.bold(
        response.data.user_code,
      )}\n`,
    );

    console.log(chalk.gray('Opening GitHub in your browser...'));
    try {
      await open(response.data.verification_uri);
    } catch {
      console.log(chalk.yellow('Could not open browser automatically.'));
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
  async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
  ): Promise<string> {
    console.log(chalk.gray('Waiting for GitHub authorization...\n'));

    const expiresAt = Date.now() + expiresIn * 1000;

    let pollingInterval = interval;

    while (Date.now() < expiresAt) {
      await new Promise((resolve) =>
        setTimeout(resolve, pollingInterval * 1000),
      );

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

      const data = response.data;

      if (data.access_token) {
        console.log(chalk.green('✅ GitHub authentication successful'));

        return data.access_token;
      }

      switch (data.error) {
        case 'authorization_pending':
          continue;

        case 'slow_down':
          pollingInterval = data.interval ?? pollingInterval + 5;

          if (process.env.DEBUG) {
            console.log(
              chalk.gray(
                `GitHub requested slower polling. New interval: ${pollingInterval}s`,
              ),
            );
          }

          continue;

        case 'expired_token':
          throw new Error(
            'GitHub authorization code expired. Run setup again.',
          );

        case 'access_denied':
          throw new Error('GitHub authorization was cancelled.');

        case 'incorrect_device_code':
          throw new Error('GitHub returned an invalid device code.');

        case 'incorrect_client_credentials':
          throw new Error('GitSwitch GitHub OAuth configuration is invalid.');

        case 'device_flow_disabled':
          throw new Error('GitHub Device Flow is disabled for GitSwitch.');

        default:
          throw new Error(
            data.error_description ??
              data.error ??
              'GitHub authentication failed.',
          );
      }
    }

    throw new Error('GitHub authorization timed out. Run setup again.');
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
