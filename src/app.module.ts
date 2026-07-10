import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TokenModule } from './token/token.module';
import { GithubModule } from './github/github.module';
import { SshModule } from './ssh/ssh.module';
import { CliModule } from './cli/cli.module';
import { GitModule } from './git/git.module';
import { AccountModule } from './account/account.module';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [TokenModule, GithubModule, SshModule, CliModule, GitModule, AccountModule, DoctorModule, AuthModule],
  providers: [AppService],
})
export class AppModule {}
