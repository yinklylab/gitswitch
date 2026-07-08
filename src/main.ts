#!/usr/bin/env node
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CliService } from './cli/cli.service';
import chalk from 'chalk';
import { Command } from 'commander';
import pkg from '../package.json';

const program = new Command();
const CLI_NAME = 'gitswitch';
const APP_VERSION = pkg.version;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const cliService = app.get(CliService);

  try {
    program
      .name(CLI_NAME)
      .description(
        'A CLI tool to manage and switch between multiple GitHub accounts.',
      )
      .version(APP_VERSION, '-v, --version');


    program
      .command('current')
      .description('Show active GitSwitch account')
      .action(async () => {
        await cliService.currentAccount();
      });


    program
      .command('setup')
      .description('Run GitHub account setup wizard')
      .action(async () => {
        await cliService.runSetup();
      });


    program
      .command('list')
      .description('List all configured GitHub accounts')
      .action(async () => {
        await cliService.listAccounts();
      });


    program
      .command('use <account>')
      .description('Switch the active GitHub account')
      .action(async (account: string) => {
        await cliService.switchAccount(account);
      });


    program
      .command('delete <account>')
      .description('Delete a specific GitHub account configuration')
      .action(async (account: string) => {
        await cliService.deleteAccount(account);
      });


    program
      .command('verify <username> [token]')
      .description('Verify a GitHub username or token')
      .action(async (username: string, token: string) => {
        await cliService.verifyAccount(username, token);
      });


    program
      .command('guide')
      .description(
        'Show GitSwitch workflow guide'
      )
      .action(async () => {
        await cliService.showGuide();
      });

    program
      .command('remote <account>')
      .description(
        'Switch repository remote to a GitSwitch account'
      )
      .action(
        async (account: string) => {

          await cliService.switchRemote(
            account
          );

        }
      );

    program
      .command('push <account>')
      .description(
        'Push repository using a GitSwitch account'
      )
      .action(
        async (account: string) => {

          await cliService.pushWithAccount(
            account
          );

        }
      );


    // 👇 DEFAULT COMMAND MUST BE LAST
    program
      .action(async () => {
        await cliService.showMainMenu();
      });


    await program.parseAsync(process.argv);

  } catch (err: any) {

    console.error(
      chalk.red(`\n❌ Error: ${err.message}`)
    );


    if (process.env.DEBUG) {
      console.error(
        chalk.gray(err.stack)
      );
    }


    process.exitCode = 1;

  } finally {

    await app.close();

  }
}

bootstrap();