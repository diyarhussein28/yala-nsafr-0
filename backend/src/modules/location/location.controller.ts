import { Controller, Post, Get, Param, Body, Request, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LocationService } from './location.service';
import { PostLocationDto } from './dto/post-location.dto';

@Controller('trips/:tripId/location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  /** Driver posts their current position */
  @Post()
  record(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: PostLocationDto,
    @Request() req: any,
  ) {
    return this.locationService.recordLocation(tripId, req.user.id, dto);
  }

  /** Driver or confirmed passenger fetches the latest position */
  @Get('latest')
  latest(@Param('tripId', ParseUUIDPipe) tripId: string, @Request() req: any) {
    return this.locationService.getLatestLocation(tripId, req.user.id);
  }
}
