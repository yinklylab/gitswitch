import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TokenModule } from './token/token.module';
import { GithubModule } from './github/github.module';
import { SshModule } from './ssh/ssh.module';
import { CliModule } from './cli/cli.module';
import { GitModule } from './git/git.module';

@Module({
  imports: [TokenModule, GithubModule, SshModule, CliModule, GitModule],
  providers: [AppService],
})
export class AppModule {}
