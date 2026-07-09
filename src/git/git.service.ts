import { Injectable } from '@nestjs/common';
import simpleGit, { SimpleGit } from 'simple-git';
import chalk from 'chalk';

@Injectable()
export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }


  async isGitRepository(): Promise<boolean> {
    return await this.git.checkIsRepo();
  }


  async getCurrentBranch(): Promise<string | null> {
    const isRepo = await this.isGitRepository();

    if (!isRepo) {
      console.log(
        chalk.yellow('⚠️ Current directory is not a Git repository.')
      );
      return null;
    }

    const branch = await this.git.branch();

    return branch.current;
  }


  async getRemote(): Promise<string | null> {
    const isRepo = await this.isGitRepository();

    if (!isRepo) return null;


    const remotes = await this.git.getRemotes(true);

    const origin = remotes.find(
      remote => remote.name === 'origin'
    );


    return origin?.refs.fetch ?? null;
  }


  async setRemote(remoteUrl: string): Promise<void> {

    const existing = await this.getRemote();


    if (existing) {

      await this.git.remote([
        'set-url',
        'origin',
        remoteUrl,
      ]);

    } else {

      await this.git.addRemote(
        'origin',
        remoteUrl
      );
    }


    console.log(
      chalk.green(
        `✅ Remote updated: ${remoteUrl}`
      )
    );
  }


  async push(branch?: string): Promise<void> {

    const targetBranch =
      branch ||
      await this.getCurrentBranch();

    if (!targetBranch) {
      throw new Error(
        'Unable to determine branch'
      );
    }

    console.log(
      chalk.cyan(
        `🚀 Pushing branch ${targetBranch}...`
      )
    );

    await this.git.push(
      'origin',
      targetBranch
    );

    console.log(
      chalk.green(
        '✅ Push completed successfully'
      )
    );
  }

  async clone(
    repoUrl: string,
    directory?: string,
  ): Promise<void> {

    console.log(
      chalk.cyan(
        '📦 Cloning repository...'
      )
    );


    if (directory) {

      await this.git.clone(
        repoUrl,
        directory
      );

    } else {

      await this.git.clone(
        repoUrl
      );

    }

    console.log(
      chalk.green(
        '✅ Repository cloned'
      )
    );
  }

  async getRepositoryName(): Promise<string | null> {

    const isRepo =
      await this.isGitRepository();


    if (!isRepo) {
      return null;
    }


    const root =
      await this.git.revparse([
        '--show-toplevel',
      ]);


    return root
      .split(/[\\/]/)
      .pop() ?? null;
  }

  convertRemoteUrl(
    remoteUrl: string,
    hostAlias: string,
  ): string {

    let converted = remoteUrl;


    // HTTPS
    // https://github.com/user/project

    if (
      remoteUrl.startsWith(
        'https://github.com/'
      )
    ) {

      const repoPath =
        remoteUrl.replace(
          'https://github.com/',
          '',
        );


      converted =
        `git@${hostAlias}:${repoPath}`;

    }



    // Default SSH
    // git@github.com:user/project.git

    else if (
      remoteUrl.startsWith(
        'git@github.com:'
      )
    ) {

      converted =
        remoteUrl.replace(
          'git@github.com:',
          `git@${hostAlias}:`,
        );

    }



    // Existing alias
    // git@github-old:user/project.git

    else if (
      remoteUrl.startsWith(
        'git@'
      )
    ) {

      const repoPath =
        remoteUrl.split(':')[1];


      converted =
        `git@${hostAlias}:${repoPath}`;

    }


    else {

      throw new Error(
        `Unsupported GitHub URL: ${remoteUrl}`
      );

    }

    if (
      !converted.endsWith('.git')
    ) {

      converted += '.git';

    }

    return converted;
  }
}