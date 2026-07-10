import { Module } from '@nestjs/common';
import { CliService } from './cli.service';
import { SshModule } from '../ssh/ssh.module';
import { GithubModule } from '../github/github.module';
import { TokenModule } from '../token/token.module';
import { GitModule } from '../git/git.module';
import { AccountModule } from '../account/account.module';
import { DoctorModule } from '../doctor/doctor.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SshModule,
    GithubModule,
    TokenModule,
    GitModule,
    AccountModule,
    DoctorModule,
    AuthModule,
  ],
  providers: [CliService],
})
export class CliModule {}
