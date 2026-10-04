import { Global, Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadModule {}
