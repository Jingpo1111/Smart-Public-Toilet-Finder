import { Global, Module } from '@nestjs/common';
import { ManagerAccessService } from './manager-access.service';

@Global()
@Module({
  providers: [ManagerAccessService],
  exports: [ManagerAccessService],
})
export class ManagerAccessModule {}
