import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { StorageService, Visibility } from './storage.service';

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * The client-declared mime type is only a first gate. The file's own leading bytes must
 * match a real JPEG, PNG or WebP before it is stored, so a script or HTML page renamed
 * and relabelled as an image is refused outright.
 */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

@Controller()
export class UploadController {
  constructor(private readonly storage: StorageService) {}

  /**
   * ?visibility=private for identity documents and dispute evidence: the response's `ref`
   * is what gets submitted; `url` is a short-lived preview link. Public (default) is for
   * profile and car photos.
   */
  @Post('upload/photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
          return cb(new BadRequestException('الصورة يجب أن تكون jpeg أو png أو webp'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
    @Query('visibility') visibility?: string,
  ) {
    if (!file) throw new BadRequestException('الصورة مطلوبة');
    const actual = sniffImageType(file.buffer);
    if (!actual) throw new BadRequestException('الملف ليس صورة صالحة');

    const mode: Visibility = visibility === 'private' ? 'private' : 'public';
    const { stored, url } = await this.storage.put(user.id, file.buffer, ALLOWED_IMAGE_TYPES[actual], actual, mode);
    return { url, ref: stored, visibility: mode };
  }

  /** Signed links for private files on local storage. No auth header: the signature is the credential. */
  @Get('files/:key')
  serveSigned(
    @Param('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const path = this.storage.resolveSignedLocal(decodeURIComponent(key), Number(exp), String(sig ?? ''));
    if (!path) throw new NotFoundException();
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }
}
