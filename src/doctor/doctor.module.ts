import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { AccountModule } from '../account/account.module';
import { GitModule } from '../git/git.module';
import { SshModule } from '../ssh/ssh.module';

@Module({
  imports: [GitModule, AccountModule, DoctorModule, SshModule],
  providers: [DoctorService],
  exports: [DoctorService],
})
export class DoctorModule {}
