import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('status')
  getStatus(@CurrentUser() user: User) {
    return this.subscriptionsService.getStatus(user.id);
  }

  /** Opens a Kashier checkout for one subscription period → { paymentId, sessionUrl } */
  @Post('checkout')
  createCheckout(@CurrentUser() user: User) {
    return this.subscriptionsService.createCheckout(user);
  }

  /** The app calls this after checkout; the server checks with Kashier before applying. */
  @Post('payments/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.subscriptionsService.confirmPayment(id, user);
  }
}
