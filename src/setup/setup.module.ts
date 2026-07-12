import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { AuthModule } from '../auth/auth.module';
import { GithubModule } from '../github/github.module';
import { SshModule } from '../ssh/ssh.module';
import { TokenModule } from '../token/token.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [AuthModule, GithubModule, SshModule, TokenModule, AccountModule],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
