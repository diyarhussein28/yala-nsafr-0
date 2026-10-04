import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { SettleWithdrawalDto } from './dto/settle-withdrawal.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  // ── Driver endpoints ─────────────────────────────────────────────────────────

  @Get('drivers/earnings/summary')
  getSummary(@CurrentUser() user: User) {
    return this.earningsService.getSummary(user.id);
  }

  @Get('drivers/earnings/trips')
  getTripBreakdown(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.earningsService.getTripBreakdown(user.id, page);
  }

  @Get('drivers/earnings/ledger')
  getLedger(@CurrentUser() user: User) {
    return this.earningsService.getLedger(user.id);
  }

  /** Kashier checkout for the commission owed on cash trips → { paymentId, sessionUrl } */
  @Post('drivers/earnings/commission/checkout')
  payCommission(@CurrentUser() user: User) {
    return this.earningsService.payOutstandingCommission(user);
  }

  @Post('drivers/earnings/commission/payments/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmCommission(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.earningsService.confirmCommissionPayment(id, user);
  }

  @Get('drivers/withdrawals')
  getWithdrawals(@CurrentUser() user: User) {
    return this.earningsService.getWithdrawals(user.id);
  }

  @Post('drivers/withdrawals')
  requestWithdrawal(
    @CurrentUser() user: User,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.earningsService.requestWithdrawal(
      user,
      dto.amount,
      dto.payoutMethod,
      dto.payoutAccount,
      dto.payoutName,
      dto.payoutBank,
    );
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  @Get('admin/withdrawals')
  @UseGuards(AdminGuard)
  getPendingWithdrawals() {
    return this.earningsService.getPendingWithdrawals();
  }

  @Get('admin/earnings/commission')
  @UseGuards(AdminGuard)
  getAdminCommissionSummary() {
    return this.earningsService.getAdminCommissionSummary();
  }

  @Get('admin/drivers/:id/ledger')
  @UseGuards(AdminGuard)
  async getDriverLedger(@Param('id', ParseUUIDPipe) id: string) {
    const [entries, balance] = await Promise.all([
      this.earningsService.getLedger(id),
      this.earningsService.getSummary(id),
    ]);
    return { entries, balance };
  }

  @Post('admin/drivers/:id/ledger')
  @UseGuards(AdminGuard)
  addLedgerEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    return this.earningsService.addLedgerEntry(id, admin, dto.type, dto.amount, dto.note);
  }

  @Patch('admin/withdrawals/:id')
  @UseGuards(AdminGuard)
  settleWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleWithdrawalDto,
  ) {
    return this.earningsService.settleWithdrawal(id, dto.action, dto.adminNote);
  }
}
