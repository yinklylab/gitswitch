import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { TokenModule } from '../token/token.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [TokenModule, AccountModule],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
