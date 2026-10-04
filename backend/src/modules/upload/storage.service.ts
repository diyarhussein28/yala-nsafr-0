import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdirSync, promises as fs } from 'fs';
import { join, normalize } from 'path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Stored instead of a URL for private files. Format: private:<ownerId>/<uuid>.<ext> */
export const PRIVATE_PREFIX = 'private:';
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export type Visibility = 'public' | 'private';

/**
 * File storage for uploads.
 *
 * Public files (profile and car photos) get a plain URL. Private files — national ID and
 * licence photos, dispute evidence — are stored under a reference, never a URL, and are
 * only ever handed out as short-lived signed links to the owner or an admin. They used
 * to be served from the public /uploads folder like everything else.
 *
 * STORAGE_DRIVER=local (default) keeps files on this server's disk, which only works with
 * a single instance. STORAGE_DRIVER=s3 uses any S3-compatible bucket (AWS, Cloudflare R2,
 * MinIO...) so the API can run on several instances.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private get driver(): 'local' | 's3' {
    return this.config.get<string>('STORAGE_DRIVER') === 's3' ? 's3' : 'local';
  }
  private get appUrl() {
    return this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
  }
  private get bucket() {
    return this.config.get<string>('S3_BUCKET') ?? '';
  }
  // Derived from the JWT secret so no extra secret has to be provisioned; the "files:"
  // label keeps these signatures from being valid for anything else.
  private get signingKey() {
    return createHmac('sha256', this.config.get<string>('JWT_SECRET') ?? 'dev').update('files:v1').digest();
  }

  static get uploadsDir() {
    return join(process.cwd(), 'uploads');
  }
  static get privateDir() {
    return join(process.cwd(), 'uploads-private');
  }

  onModuleInit() {
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'auto',
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle: !!this.config.get<string>('S3_ENDPOINT'),
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID') ?? '',
          secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
        },
      });
      this.logger.log(`Uploads stored in S3 bucket ${this.bucket}`);
    } else {
      mkdirSync(StorageService.uploadsDir, { recursive: true });
      mkdirSync(StorageService.privateDir, { recursive: true });
    }
  }

  /** Stores a file. Returns what to persist (`stored`) and a URL to show right away. */
  async put(
    ownerId: string,
    buffer: Buffer,
    ext: string,
    mime: string,
    visibility: Visibility,
  ): Promise<{ stored: string; url: string }> {
    const name = `${randomUUID()}${ext}`;

    if (visibility === 'public') {
      if (this.s3) {
        const key = `public/${name}`;
        await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mime }));
        const base = this.config.get<string>('S3_PUBLIC_BASE_URL') ?? '';
        const url = `${base.replace(/\/$/, '')}/${key}`;
        return { stored: url, url };
      }
      await fs.writeFile(join(StorageService.uploadsDir, name), buffer);
      const url = `${this.appUrl}/uploads/${name}`;
      return { stored: url, url };
    }

    const key = `${ownerId}/${name}`;
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: `private/${key}`, Body: buffer, ContentType: mime }),
      );
    } else {
      mkdirSync(join(StorageService.privateDir, ownerId), { recursive: true });
      await fs.writeFile(join(StorageService.privateDir, key), buffer);
    }
    const stored = `${PRIVATE_PREFIX}${key}`;
    return { stored, url: (await this.viewUrl(stored)) as string };
  }

  /**
   * A file reference a user submits must be something they uploaded here: their own
   * private reference, or (where allowed) one of our public upload URLs. Arbitrary URLs —
   * or someone else's ID photo reference — are refused.
   */
  assertAcceptable(value: string, userId: string, opts: { requirePrivate?: boolean } = {}): void {
    if (StorageService.isPrivate(value)) {
      if (!StorageService.ownedBy(value, userId)) throw new BadRequestException('ملف غير صالح');
      return;
    }
    if (opts.requirePrivate) {
      throw new BadRequestException('يجب رفع المستند عبر التطبيق');
    }
    const publicBases = [
      `${this.appUrl}/uploads/`,
      this.config.get<string>('S3_PUBLIC_BASE_URL') ? `${this.config.get<string>('S3_PUBLIC_BASE_URL')!.replace(/\/$/, '')}/public/` : null,
    ].filter(Boolean) as string[];
    if (!publicBases.some((base) => value.startsWith(base))) {
      throw new BadRequestException('رابط الصورة غير صالح');
    }
  }

  static isPrivate(value: string | null | undefined): boolean {
    return !!value && value.startsWith(PRIVATE_PREFIX);
  }

  /** Whether a stored private reference was uploaded by this user. */
  static ownedBy(value: string, userId: string): boolean {
    return value.startsWith(`${PRIVATE_PREFIX}${userId}/`);
  }

  /**
   * Turns a stored value into something a client can load: private references become
   * signed links that expire, anything else is returned as is.
   */
  async viewUrl(value: string | null | undefined): Promise<string | null> {
    if (!value) return null;
    if (!StorageService.isPrivate(value)) return value;
    const key = value.slice(PRIVATE_PREFIX.length);
    if (this.s3) {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: `private/${key}` }), {
        expiresIn: SIGNED_URL_TTL_SECONDS,
      });
    }
    const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
    const sig = this.sign(key, exp);
    return `${this.appUrl}/api/v1/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
  }

  async viewUrls(values: string[] | null | undefined): Promise<string[]> {
    return Promise.all((values ?? []).map(async (v) => (await this.viewUrl(v)) ?? v));
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', this.signingKey).update(`${key}:${exp}`).digest('hex');
  }

  /** Resolves a signed local link to a file path, or null when invalid or expired. */
  resolveSignedLocal(key: string, exp: number, sig: string): string | null {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
    const expected = Buffer.from(this.sign(key, exp), 'hex');
    let given: Buffer;
    try {
      given = Buffer.from(sig, 'hex');
    } catch {
      return null;
    }
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    // Keys look like <uuid>/<uuid>.<ext>; anything else (.., absolute paths) is refused
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return null;
    const path = normalize(join(StorageService.privateDir, key));
    return path.startsWith(StorageService.privateDir) ? path : null;
  }
}
