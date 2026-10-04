import { Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Trip, TripStatus } from '../../database/entities/trip.entity';
import { formatCairoDate, formatCairoTime } from '../../common/time/cairo';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Public pages behind shared links (served outside the /api/v1 prefix):
 *
 *  - /t/:id — a shared trip. Link previews in WhatsApp/Messenger show the route, date and
 *    price; the page opens the app when installed (Android App Links / iOS Universal
 *    Links, or the yalansafr:// scheme) and otherwise points to the stores. Shared links
 *    used to go to a domain that served nothing.
 *  - /.well-known/assetlinks.json and apple-app-site-association — the verification
 *    files that let Android and iOS open these links directly in the app.
 */
@Controller()
export class ShareController {
  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    private readonly config: ConfigService,
  ) {}

  @Get('t/:id')
  @Header('Cache-Control', 'public, max-age=300')
  async trip(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const trip = await this.tripRepo.findOne({ where: { id }, relations: { driver: true } });
    if (!trip) throw new NotFoundException();

    const appUrl = this.config.get<string>('APP_URL') ?? '';
    const play = this.config.get<string>('PLAY_STORE_URL') ?? '';
    const appStore = this.config.get<string>('APP_STORE_URL') ?? '';
    const pkg = this.config.get<string>('ANDROID_PACKAGE') ?? 'com.yalansafr.yala_nsafr';
    const route = `${trip.originCity} ← ${trip.destinationCity}`;
    const when = `${formatCairoDate(trip.departureTime)} · ${formatCairoTime(trip.departureTime)}`;
    const price = `${Number(trip.pricePerSeat).toFixed(0)} ج.م للمقعد`;
    const open = trip.status === TripStatus.SCHEDULED && trip.availableSeats > 0;
    const seats = open ? `${trip.availableSeats} مقاعد متاحة` : 'لم تعد متاحة للحجز';
    const description = `${when} — ${price} — ${seats}`;
    const deepLink = `yalansafr://app/trips/${trip.id}`;
    const intent = `intent://app/trips/${trip.id}#Intent;scheme=yalansafr;package=${pkg};${
      play ? `S.browser_fallback_url=${encodeURIComponent(play)};` : ''
    }end`;

    res.type('html').send(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(route)} — يلا نسافر</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="يلا نسافر">
<meta property="og:title" content="${esc(route)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(`${appUrl}/t/${trip.id}`)}">
<meta name="twitter:card" content="summary">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Cairo,system-ui,sans-serif;background:#f4f6f5;color:#111827}
.hero{background:linear-gradient(135deg,#0b7a62,#07513f);color:#fff;padding:36px 20px 72px;text-align:center}
.hero b{font-size:15px;opacity:.85}.card{max-width:460px;margin:-48px auto 24px;background:#fff;border-radius:20px;box-shadow:0 12px 32px rgba(16,24,40,.12);padding:22px}
h1{margin:6px 0 2px;font-size:24px}.muted{color:#5b6472}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eef1f0}
.row:last-of-type{border:0}.price{color:#0b7a62;font-weight:800}.btn{display:block;text-align:center;padding:14px;border-radius:14px;font-weight:800;text-decoration:none;margin-top:12px}
.primary{background:#0b7a62;color:#fff}.ghost{border:1px solid #d5dbd8;color:#0b7a62}.closed{background:#fdecec;color:#b91c1c;padding:10px;border-radius:12px;text-align:center;font-weight:700}
</style></head><body>
<div class="hero"><b>يلا نسافر</b><h1>${esc(route)}</h1><div>${esc(when)}</div></div>
<div class="card">
${open ? '' : '<div class="closed">هذه الرحلة لم تعد متاحة للحجز</div>'}
<div class="row"><span class="muted">من</span><strong>${esc(trip.originAddress || trip.originCity)}</strong></div>
<div class="row"><span class="muted">إلى</span><strong>${esc(trip.destinationAddress || trip.destinationCity)}</strong></div>
<div class="row"><span class="muted">السعر</span><strong class="price">${esc(price)}</strong></div>
<div class="row"><span class="muted">المقاعد</span><strong>${esc(seats)}</strong></div>
<div class="row"><span class="muted">السائق</span><strong>${esc(trip.driver?.fullName ?? '')}${trip.driver?.driverVerified ? ' ✓' : ''}</strong></div>
<a class="btn primary" id="open" href="${esc(deepLink)}">افتح الرحلة في التطبيق</a>
${play ? `<a class="btn ghost" href="${esc(play)}">حمّل التطبيق من Google Play</a>` : ''}
${appStore ? `<a class="btn ghost" href="${esc(appStore)}">حمّل التطبيق من App Store</a>` : ''}
</div>
<script>if(/android/i.test(navigator.userAgent)){document.getElementById('open').href=${JSON.stringify(intent)}}</script>
</body></html>`);
  }

  @Get('.well-known/assetlinks.json')
  assetLinks() {
    const fingerprints = (this.config.get<string>('ANDROID_SHA256_CERT_FINGERPRINTS') ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    return fingerprints.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: this.config.get<string>('ANDROID_PACKAGE') ?? 'com.yalansafr.yala_nsafr',
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];
  }

  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAssociation() {
    const team = this.config.get<string>('IOS_TEAM_ID');
    const bundle = this.config.get<string>('IOS_BUNDLE_ID') ?? 'com.yalansafr.yalaNsafr';
    return { applinks: { apps: [], details: team ? [{ appID: `${team}.${bundle}`, paths: ['/t/*'] }] : [] } };
  }
}
