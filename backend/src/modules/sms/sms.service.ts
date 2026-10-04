import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound SMS through the provider in SMS_PROVIDER (stub | twilio | vonage). Shared by
 * OTP login and safety alerts. The stub only logs — production refuses to boot with it.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  get provider(): string {
    return this.config.get<string>('SMS_PROVIDER') ?? 'stub';
  }

  get isStub(): boolean {
    return this.provider === 'stub';
  }

  async send(to: string, message: string): Promise<void> {
    switch (this.provider) {
      case 'stub':
        this.logger.log(`[SMS STUB] ${to} → ${message}`);
        return;
      case 'twilio':
        return this.sendViaTwilio(to, message);
      case 'vonage':
        return this.sendViaVonage(to, message);
      default:
        throw new Error(`Unknown SMS_PROVIDER: "${this.provider}"`);
    }
  }

  // ── Twilio ──────────────────────────────────────────────────────────────────

  private async sendViaTwilio(to: string, body: string): Promise<void> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = new URLSearchParams({ From: from, To: to, Body: body });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const error = (await res.json()) as { message?: string; code?: number };
      throw new Error(`Twilio error ${res.status} (code ${error.code ?? '?'}): ${error.message ?? 'unknown'}`);
    }

    const data = (await res.json()) as { sid: string; status: string };
    this.logger.log(`Twilio SMS sent to ${to} — SID: ${data.sid}, status: ${data.status}`);
  }

  // ── Vonage (formerly Nexmo) ─────────────────────────────────────────────────

  private async sendViaVonage(to: string, text: string): Promise<void> {
    const apiKey = this.config.get<string>('VONAGE_API_KEY');
    const apiSecret = this.config.get<string>('VONAGE_API_SECRET');
    const from = this.config.get<string>('VONAGE_FROM') ?? 'YalaNsafr';

    if (!apiKey || !apiSecret) {
      throw new Error('Vonage credentials not configured (VONAGE_API_KEY / VONAGE_API_SECRET)');
    }

    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, from, to, text }),
    });

    if (!res.ok) {
      throw new Error(`Vonage HTTP error: ${res.status}`);
    }

    const data = (await res.json()) as { messages: Array<{ status: string; 'message-id'?: string; 'error-text'?: string }> };
    const msg = data.messages[0];

    if (msg?.status !== '0') {
      throw new Error(`Vonage rejected message: ${msg?.['error-text'] ?? 'unknown error'}`);
    }

    this.logger.log(`Vonage SMS sent to ${to} — ID: ${msg?.['message-id']}`);
  }
}
