import { Module } from '@nestjs/common';
import { CliService } from './cli.service';
import { SshModule } from '../ssh/ssh.module';
import { GithubModule } from '../github/github.module';
import { TokenModule } from '../token/token.module';
import { GitModule } from '../git/git.module';
import { AccountModule } from '../account/account.module';
import { DoctorModule } from '../doctor/doctor.module';

@Module({
  imports: [
    SshModule,
    GithubModule,
    TokenModule,
    GitModule,
    AccountModule,
    DoctorModule,
  ],
  providers: [CliService],
})
export class CliModule {}
