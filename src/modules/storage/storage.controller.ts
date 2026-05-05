import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { StorageService } from './storage.service';
import { GetUploadUrlDto } from './dto/get-upload-url.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  getUploadUrl(@Body() dto: GetUploadUrlDto) {
    const params = this.storageService.getUploadParams(dto.folder);
    return { data: params, message: 'success' };
  }
}
