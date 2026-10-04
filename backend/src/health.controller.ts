import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Liveness probe for the host, and a boot smoke test for the e2e suite.
 *
 * Unauthenticated on purpose — a probe cannot hold a token. It replaces the Nest
 * scaffold's "Hello World!" route, whose controller was never registered in AppModule,
 * so the generated test asserted a route that had not existed since the first commit.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * App version policy for the mobile client: below `minSupportedVersion` the app blocks
   * with an update screen (e.g. after a breaking API change); below `latestVersion` it
   * suggests updating. Set through APP_MIN_VERSION / APP_LATEST_VERSION.
   */
  @Get('app-config')
  appConfig() {
    return {
      minSupportedVersion: this.config.get<string>('APP_MIN_VERSION') ?? '1.0.0',
      latestVersion: this.config.get<string>('APP_LATEST_VERSION') ?? '1.0.0',
      androidStoreUrl: this.config.get<string>('PLAY_STORE_URL') ?? '',
      iosStoreUrl: this.config.get<string>('APP_STORE_URL') ?? '',
    };
  }

  @Get()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // Answering 200 here would let the host keep routing traffic to an instance that
      // cannot serve a single query, which is the whole point of having a probe.
      throw new ServiceUnavailableException({ status: 'degraded', database: 'down' });
    }

    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
