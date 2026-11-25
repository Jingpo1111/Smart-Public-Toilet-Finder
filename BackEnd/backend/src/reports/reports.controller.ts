import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateReportDto, MyReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Maintenance reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('toilets/:id/reports')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Thank you. Your report has been submitted.')
  @ApiOperation({
    summary: 'Report a problem at a verified WC',
    description: 'Upload optional photos first with POST /uploads/reports and pass their IDs as imageIds.',
  })
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReportDto) {
    return this.reports.create(user, id, dto);
  }

  @Get('me/reports')
  @ApiOperation({ summary: 'My reports with status, resolution and history (paginated)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: MyReportQueryDto) {
    return this.reports.listMine(user, q);
  }

  @Get('me/reports/:id')
  @ApiOperation({ summary: 'One of my reports' })
  mineOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.getMine(user, id);
  }
}
