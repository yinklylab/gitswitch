#!/usr/bin/env node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

function logSilent(msg: any) {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'gitswitch-install.log'),
      `[${new Date().toISOString()}] ${msg}\n`,
    );
  } catch {
    //
  }
}

(function disableNpmNoise() {
  try {
    execSync('npm config set disable-opencollective true', { stdio: 'ignore' });
    execSync('npm config set fund false', { stdio: 'ignore' });

    if (process.platform === 'win32') {
      execSync('setx DISABLE_OPENCOLLECTIVE true', { stdio: 'ignore' });
    } else {
      const shellRc = process.env.SHELL?.includes('zsh')
        ? '.zshrc'
        : process.env.SHELL?.includes('bash')
          ? '.bashrc'
          : null;

      if (shellRc) {
        const rcPath = path.join(os.homedir(), shellRc);
        const line = '\nexport DISABLE_OPENCOLLECTIVE=true\n';
        const existing = fs.existsSync(rcPath)
          ? fs.readFileSync(rcPath, 'utf8')
          : '';

        if (!existing.includes('DISABLE_OPENCOLLECTIVE=true')) {
          fs.appendFileSync(rcPath, line);
        }
      }
    }
  } catch (err) {
    logSilent(`Failed to disable npm noise: ${err}`);
  }
})();

function getGlobalBin(): string {
  try {
    const prefix = execSync('npm prefix -g').toString().trim();
    return path.join(prefix, 'bin');
  } catch {
    //
  }

  try {
    return execSync('npm bin -g', { stdio: 'pipe' }).toString().trim();
  } catch {
    //
  }

  logSilent('Unable to determine global npm bin directory.');

  return '';
}

function ensureInPath(binName: string) {
  const isInPath = process.env.PATH?.split(path.delimiter).some((p) =>
    fs.existsSync(path.join(p, binName)),
  );

  if (isInPath) return;

  const npmGlobalBin = getGlobalBin();
  if (!npmGlobalBin) return;

  const shell = process.env.SHELL || '';
  const isWSL = os.release().toLowerCase().includes('microsoft');

  try {
    if (process.platform === 'win32' && !isWSL) {
      const currentPath = execSync('echo %PATH%', { shell: 'cmd.exe' })
        .toString()
        .trim();

      if (!currentPath.includes(npmGlobalBin)) {
        execSync(`setx PATH "${currentPath};${npmGlobalBin}"`, {
          stdio: 'ignore',
          shell: 'cmd.exe',
        });
        logSilent('Updated PATH for Windows.');
      }
    } else if (shell.includes('zsh')) {
      const rcPath = path.join(os.homedir(), '.zshrc');
      const exportLine = `export PATH="$PATH:${npmGlobalBin}"`;
      const content = fs.existsSync(rcPath)
        ? fs.readFileSync(rcPath, 'utf8')
        : '';

      if (!content.includes(npmGlobalBin)) {
        fs.appendFileSync(rcPath, `\n${exportLine}\n`);
        logSilent('Added npm global bin to .zshrc.');
      }
    } else if (shell.includes('bash') || isWSL) {
      const rcPath = path.join(os.homedir(), '.bashrc');
      const exportLine = `export PATH="$PATH:${npmGlobalBin}"`;
      const content = fs.existsSync(rcPath)
        ? fs.readFileSync(rcPath, 'utf8')
        : '';

      if (!content.includes(npmGlobalBin)) {
        fs.appendFileSync(rcPath, `\n${exportLine}\n`);
        logSilent('Added npm global bin to .bashrc.');
      }
    }
  } catch (err) {
    logSilent(`ensureInPath failed: ${err}`);
  }
}

(function main() {
  try {
    ensureInPath('gitswitch');
  } catch (err) {
    logSilent(`main failed: ${err}`);
  }
})();
