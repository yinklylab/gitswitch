import { Injectable } from '@nestjs/common';
import { exec, spawnSync } from 'child_process';
import * as lockfile from 'proper-lockfile';
import * as fs from 'fs-extra';
import * as path from 'path';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

@Injectable()
export class SshService {
  private sshDir = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '',
    '.ssh',
  );

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
  }

  async generateKey(email: string, keyName: string): Promise<string> {
    await this.ensureSshInstalled();
    await fs.ensureDir(this.sshDir);
    await fs.chmod(this.sshDir, 0o700);

    const keyPath = path.join(this.sshDir, keyName);
    const privateExists = await fs.pathExists(keyPath);
    const publicExists = await fs.pathExists(`${keyPath}.pub`);

    if (privateExists && publicExists) {
      console.log(
        chalk.yellow(
          `⚠️ SSH key for '${keyName}' already exists — skipping generation.`,
        ),
      );
      return keyPath;
    }

    console.log(`🔑 Generating SSH key for '${keyName}'...`);
    const command = `ssh-keygen -t rsa -b 4096 -C "${email}" -f "${keyPath}" -N ""`;
    try {
      await execAsync(command);
      console.log(`✅ SSH key successfully created at: ${keyPath}`);
      return keyPath;
    } catch (err) {
      console.error(
        chalk.red('❌ Failed to generate SSH key:'),
        err.stderr || err.message,
      );
      throw err;
    }
  }

  async updateSshConfig(
    profileName: string,
    keyPath: string,
    hostAlias: string,
  ) {
    if (!profileName || !keyPath || !hostAlias) {
      throw new Error('Invalid SSH config parameters.');
    }

    await fs.ensureDir(this.sshDir);
    const configPath = path.join(this.sshDir, 'config');

    const normalizedKeyPath = this.normalizePath(keyPath);

    const startMarker = `# >>> GitSwitch: ${profileName} >>>`;

    const endMarker = `# <<< GitSwitch: ${profileName} <<<`;

    const configEntry = [
      startMarker,
      `Host ${hostAlias}`,
      `  HostName github.com`,
      `  User git`,
      `  IdentityFile ${normalizedKeyPath.replace('.pub', '')}`,
      `  IdentitiesOnly yes`,
      endMarker,
      '',
    ].join('\n');

    await fs.ensureFile(configPath);

    let release: (() => Promise<void>) | undefined;

    try {
      release = await lockfile.lock(configPath);

      const currentConfig = (await fs.pathExists(configPath))
        ? await fs.readFile(configPath, 'utf-8')
        : '';

      if (currentConfig.includes(startMarker)) {
        console.log(
          chalk.yellow(
            `⚠️ SSH config for profile '${profileName}' already exists — skipping.`,
          ),
        );
        return;
      }

      console.log(chalk.cyan(`🧩 Configuring SSH profile '${profileName}'...`));
      await fs.appendFile(configPath, configEntry);

      console.log(chalk.green(`✓ SSH config updated at ${configPath}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to update SSH config:`), error);
    } finally {
      if (release) await release();
    }
  }

  async getPublicKey(keyName: string): Promise<string> {
    let pubPath = path.join(this.sshDir, `${keyName}`);
    if (!pubPath.endsWith('.pub')) pubPath += '.pub';

    if (!(await fs.pathExists(pubPath))) {
      throw new Error(`Public key not found at ${pubPath}`);
    }

    return (await fs.readFile(pubPath, 'utf8')).trim();
  }

  async removeFromSshConfig(profileName: string): Promise<void> {
    const configPath = path.join(this.sshDir, 'config');
    if (!fs.existsSync(configPath)) {
      console.log(chalk.gray('ℹ️ No SSH config file found.'));
      return;
    }

    let release: (() => Promise<void>) | undefined;

    try {
      release = await lockfile.lock(configPath);

      const content = await fs.promises.readFile(configPath, 'utf8');

      const markerRegex = new RegExp(
        `# >>> GitSwitch: ${profileName} >>>[\\s\\S]*?# <<< GitSwitch: ${profileName} <<<\\n?`,
        'g',
      );

      const legacyRegex = new RegExp(
        `(# gitSwitch-${profileName}[\\s\\S]*?(?=\\n# gitSwitch-|$))|(Host github-${profileName}[\\s\\S]*?(?=\\nHost |$))`,
        'g',
      );

      const newContent = content
        .replace(markerRegex, '')
        .replace(legacyRegex, '')
        .trim();

      if (newContent !== content.trim()) {
        await fs.promises.writeFile(configPath, newContent + '\n', 'utf8');
        console.log(chalk.yellow(`🧹 Removed SSH config for ${profileName}.`));
      } else {
        console.log(
          chalk.gray(`ℹ️ No SSH config entry found for ${profileName}.`),
        );
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to update SSH config:`), error);
    } finally {
      if (release) await release();
    }
  }

  async deleteSSHKeys(profileName: string): Promise<boolean> {
    const gitSwitchKey = path.join(this.sshDir, `gitswitch_${profileName}`);

    const legacyRsaKey = path.join(this.sshDir, `id_rsa_${profileName}`);

    const legacyKey = path.join(this.sshDir, profileName);

    const filesToDelete = [
      gitSwitchKey,
      `${gitSwitchKey}.pub`,

      legacyRsaKey,
      `${legacyRsaKey}.pub`,

      legacyKey,
      `${legacyKey}.pub`,
    ];

    const deleted: string[] = [];

    for (const file of filesToDelete) {
      if (fs.existsSync(file)) {
        await fs.promises.unlink(file);

        deleted.push(file);
      }
    }

    if (deleted.length) {
      console.log(chalk.yellow(`🗑️ Deleted SSH keys for ${profileName}:`));

      deleted.forEach((file) => console.log(chalk.gray(`- ${file}`)));

      return true;
    }

    console.log(chalk.gray(`ℹ️ No SSH keys found for ${profileName}.`));

    return false;
  }

  private isSshInstalled(): boolean {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(cmd, ['ssh-keygen'], { stdio: 'ignore' });
    return result.status === 0;
  }

  private async ensureSshInstalled(): Promise<void> {
    if (this.isSshInstalled()) return;

    console.log(chalk.yellow('⚠️  SSH utilities not found on this system.'));

    if (process.platform === 'win32') {
      console.log(
        chalk.cyan(
          '\nAttempting to install OpenSSH via Windows optional features...',
        ),
      );
      try {
        await execAsync(
          'powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"',
        );
        console.log(chalk.green('✅ OpenSSH installed successfully.'));
        return;
      } catch (err: any) {
        const stderr =
          err?.stderr?.toString() || err?.message || 'Unknown error';
        if (stderr.includes('Access is denied')) {
          console.error(
            chalk.red(
              '❌ Permission denied. Run your terminal as Administrator and try again.',
            ),
          );
        } else {
          console.error(
            chalk.red('❌ Failed to auto-install OpenSSH:'),
            stderr,
          );
        }
      }
    } else if (process.platform === 'linux') {
      console.log(chalk.cyan('\nTry installing manually using:'));
      console.log(chalk.gray('sudo apt install openssh-client'));
    } else if (process.platform === 'darwin') {
      console.log(
        chalk.gray('\nmacOS usually includes SSH by default. If missing, run:'),
      );
      console.log(chalk.gray('xcode-select --install'));
    }

    throw new Error(
      'SSH not installed. Please install it and rerun this command.',
    );
  }

  async testConnection(hostAlias: string): Promise<{
    connected: boolean;
    username?: string;
    message?: string;
  }> {
    try {
      const { stdout, stderr } = await execAsync(
        `ssh -T -o StrictHostKeyChecking=accept-new git@${hostAlias}`,
      );

      const output = `${stdout}\n${stderr}`.trim();

      return this.parseSshConnectionResult(output);
    } catch (error: any) {
      const output = [error?.stdout, error?.stderr, error?.message]
        .filter(Boolean)
        .join('\n');

      return this.parseSshConnectionResult(output);
    }
  }

  private parseSshConnectionResult(output: string): {
    connected: boolean;
    username?: string;
    message?: string;
  } {
    const match = output.match(
      /Hi\s+([^!]+)!\s+You've successfully authenticated/i,
    );

    if (match) {
      return {
        connected: true,
        username: match[1].trim(),
        message: output,
      };
    }

    return {
      connected: false,
      message: output,
    };
  }

  async copyPublicKeyToClipboard(keyName: string): Promise<boolean> {
    let pubPath = path.join(this.sshDir, `${keyName}.pub`);
    if (!pubPath.endsWith('.pub')) pubPath += '.pub';

    if (!(await fs.pathExists(pubPath))) return false;

    try {
      if (process.platform === 'win32') {
        await execAsync(`type "${pubPath}" | clip`);
      } else if (process.platform === 'darwin') {
        await execAsync(`pbcopy < "${pubPath}"`);
      } else {
        await execAsync(`xclip -selection clipboard < "${pubPath}"`);
      }
      return true;
    } catch (err) {
      console.error(
        chalk.red('❌ Failed to copy public key to clipboard:'),
        err,
      );
      return false;
    }
  }
}
