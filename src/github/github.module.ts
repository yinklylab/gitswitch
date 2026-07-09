import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { TokenModule } from '../token/token.module';

@Module({
  imports: [TokenModule],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
