import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { AccountModule } from '../account/account.module';
import { GitModule } from '../git/git.module';

@Module({
  imports: [
    GitModule,
    AccountModule,
    DoctorModule,
  ],
  providers: [DoctorService],
  exports: [DoctorService],
})
export class DoctorModule {}
