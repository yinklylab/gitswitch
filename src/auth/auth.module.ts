import { Module } from '@nestjs/common';
import { GithubAuthService } from './github-auth.service';

@Module({
  providers: [GithubAuthService],
  exports: [GithubAuthService],
})
export class AuthModule {}
