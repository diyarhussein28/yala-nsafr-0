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
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Audit } from '../audit/audit.decorator';
import { AuditService } from '../audit/audit.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { NotifyPartyDto } from './dto/notify-party.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { ListUsersQueryDto, ListDisputesQueryDto, ListTripsQueryDto } from './dto/list-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('audit-log')
  auditLog(
    @Query('page') page?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
  ) {
    return this.audit.list({ page: page ? Number(page) : 1, targetType, targetId });
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Patch('config')
  @Audit('config.update', 'config')
  updateConfig(@Body() dto: UpdateConfigDto) {
    return this.adminService.updateConfig(dto);
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  @Get('analytics')
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  @Get('search')
  search(@Query('q') q: string) {
    return this.adminService.search(q ?? '');
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserDetailForAdmin(id);
  }

  @Patch('users/:id/status')
  @Audit('user.status', 'user')
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, dto);
  }

  @Post('users/:id/verify-id/approve')
  @Audit('user.verify_id.approve', 'user')
  approveId(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ) {
    return this.adminService.approveIdVerification(id, admin.id);
  }

  @Post('users/:id/verify-id/reject')
  @Audit('user.verify_id.reject', 'user')
  rejectId(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectIdVerification(id);
  }

  @Post('users/:id/verify-driver/approve')
  @Audit('user.verify_driver.approve', 'user')
  approveDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ) {
    return this.adminService.approveDriverVerification(id, admin.id);
  }

  @Post('users/:id/verify-driver/reject')
  @Audit('user.verify_driver.reject', 'user')
  rejectDriver(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectDriverVerification(id);
  }

  // ── Trips ──────────────────────────────────────────────────────────────────
  @Get('trips')
  listTrips(@Query() query: ListTripsQueryDto) {
    return this.adminService.listTrips(query);
  }

  @Get('trips/:id')
  getTripDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getTripDetail(id);
  }

  // ── Disputes ───────────────────────────────────────────────────────────────
  @Get('disputes')
  listDisputes(@Query() query: ListDisputesQueryDto) {
    return this.adminService.listDisputes(query);
  }

  @Get('disputes/:id')
  getDisputeDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getDisputeDetail(id);
  }

  @Post('disputes/:id/assign')
  @Audit('dispute.assign', 'dispute')
  assignDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ) {
    return this.adminService.assignDispute(id, admin.id);
  }

  @Post('disputes/:id/resolve')
  @Audit('dispute.resolve', 'dispute')
  resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(id, admin.id, dto);
  }

  @Post('disputes/:id/notify')
  @Audit('dispute.notify', 'dispute')
  notifyParty(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Body() dto: NotifyPartyDto,
  ) {
    return this.adminService.notifyParty(id, admin.id, dto);
  }
}
