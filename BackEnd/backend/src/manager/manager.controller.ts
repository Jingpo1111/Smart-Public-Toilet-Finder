import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ReportQueryDto, UpdateReportStatusDto } from '../reports/dto/report.dto';
import { ReportsService } from '../reports/reports.service';
import { RemoveImageQueryDto } from '../toilet-suggestions/dto/suggestion.dto';
import { ManagerUpdateToiletDto, SetCoverDto } from '../toilets/dto/admin-toilet.dto';
import { ToiletImagesService } from '../toilets/toilet-images.service';
import {
  CleaningLogQueryDto,
  CleaningScheduleQueryDto,
  CreateCleaningLogDto,
  CreateCleaningScheduleDto,
  ManagerToiletQueryDto,
  UpdateCleaningScheduleDto,
} from './dto/manager.dto';
import { ManagerService } from './manager.service';

/**
 * Facility-manager API. MANAGER users only reach WCs they are assigned to (403 otherwise);
 * ADMIN users may use these endpoints for any WC.
 */
@ApiTags('Manager')
@ApiBearerAuth()
@Roles(UserRole.MANAGER, UserRole.ADMIN)
@Controller('manager')
export class ManagerController {
  constructor(
    private readonly manager: ManagerService,
    private readonly analytics: AnalyticsService,
    private readonly reports: ReportsService,
    private readonly images: ToiletImagesService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Statistics for my assigned WCs' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.managerDashboard(user);
  }

  @Get('toilets')
  @ApiOperation({ summary: 'My assigned WCs (paginated)' })
  toilets(@CurrentUser() user: AuthUser, @Query() q: ManagerToiletQueryDto) {
    return this.manager.listToilets(user, q);
  }

  @Get('toilets/:id')
  @ApiOperation({ summary: 'Assigned WC details' })
  toilet(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.manager.getToilet(user, id);
  }

  @Patch('toilets/:id')
  @ResponseMessage('WC updated')
  @ApiOperation({
    summary: 'Update an assigned WC (description, status, access/price, facilities, opening hours)',
    description: 'Name, address, coordinates, verification and archiving are administrator-only and rejected with 400.',
  })
  updateToilet(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManagerUpdateToiletDto) {
    return this.manager.updateToilet(user, id, dto);
  }

  @Get('toilets/:id/images')
  @ApiOperation({ summary: 'Photos of an assigned WC' })
  listImages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.images.list(user, id);
  }

  @Patch('toilets/:id/cover')
  @ResponseMessage('Cover photo updated')
  @ApiOperation({ summary: 'Choose the cover photo of an assigned WC' })
  setCover(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCoverDto) {
    return this.images.setCover(user, id, dto.imageId);
  }

  @Delete('toilets/:id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Photo deleted')
  @ApiOperation({ summary: 'Delete a photo of an assigned WC' })
  deleteImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Query() q: RemoveImageQueryDto,
  ) {
    return this.images.remove(user, id, imageId, q.reason);
  }

  @Get('toilets/:id/qr')
  @ApiOperation({ summary: 'Feedback QR code (SVG and PNG data URL) linking to the public WC page' })
  qr(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.manager.feedbackQr(user, id);
  }

  // Cleaning schedules
  @Get('cleaning-schedules')
  @ApiOperation({ summary: 'Cleaning schedules of my WCs (filter by toiletId / dayOfWeek)' })
  schedules(@CurrentUser() user: AuthUser, @Query() q: CleaningScheduleQueryDto) {
    return this.manager.listSchedules(user, q);
  }

  @Get('toilets/:id/cleaning-schedules')
  @ApiOperation({ summary: 'Cleaning schedule of an assigned WC' })
  toiletSchedules(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.manager.listSchedules(user, { toiletId: id });
  }

  @Post('toilets/:id/cleaning-schedules')
  @ResponseMessage('Cleaning schedule created')
  @ApiOperation({ summary: 'Add a weekly cleaning slot' })
  createSchedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCleaningScheduleDto) {
    return this.manager.createSchedule(user, id, dto);
  }

  @Patch('cleaning-schedules/:scheduleId')
  @ResponseMessage('Cleaning schedule updated')
  @ApiOperation({ summary: 'Update a cleaning slot' })
  updateSchedule(
    @CurrentUser() user: AuthUser,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateCleaningScheduleDto,
  ) {
    return this.manager.updateSchedule(user, scheduleId, dto);
  }

  @Delete('cleaning-schedules/:scheduleId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cleaning schedule deleted')
  @ApiOperation({ summary: 'Delete a cleaning slot' })
  async deleteSchedule(@CurrentUser() user: AuthUser, @Param('scheduleId', ParseUUIDPipe) scheduleId: string) {
    await this.manager.deleteSchedule(user, scheduleId);
    return null;
  }

  // Cleaning logs
  @Get('cleaning-logs')
  @ApiOperation({ summary: 'Cleaning history of my WCs (paginated)' })
  logs(@CurrentUser() user: AuthUser, @Query() q: CleaningLogQueryDto) {
    return this.manager.listLogs(user, q);
  }

  @Get('toilets/:id/cleaning-logs')
  @ApiOperation({ summary: 'Cleaning history of an assigned WC (paginated)' })
  toiletLogs(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: CleaningLogQueryDto) {
    return this.manager.listLogs(user, { ...q, toiletId: id });
  }

  @Post('toilets/:id/cleaning-logs')
  @ResponseMessage('Cleaning logged')
  @ApiOperation({ summary: 'Log a cleaning of an assigned WC' })
  createLog(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCleaningLogDto) {
    return this.manager.createLog(user, id, dto);
  }

  // Maintenance reports
  @Get('reports')
  @ApiOperation({ summary: 'Reports for my assigned WCs (paginated)' })
  listReports(@CurrentUser() user: AuthUser, @Query() q: ReportQueryDto) {
    return this.reports.list(user, q);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Report details (assigned WCs only)' })
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(user, id);
  }

  @Patch('reports/:id/status')
  @ResponseMessage('Report status updated')
  @ApiOperation({ summary: 'Change report status (resolutionNote required for RESOLVED/REJECTED)' })
  updateReport(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReportStatusDto) {
    return this.reports.updateStatus(user, id, dto);
  }
}
