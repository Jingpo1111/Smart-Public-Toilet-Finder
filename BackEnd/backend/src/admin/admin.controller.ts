import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { AnalyticsQueryDto } from '../analytics/dto/analytics-query.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { ApiEnvelope, ApiPaginatedEnvelope } from '../common/decorators/api-envelope.decorator';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ReportQueryDto, UpdateReportStatusDto } from '../reports/dto/report.dto';
import { ReportsService } from '../reports/reports.service';
import { AdminReviewQueryDto, ModerateReviewDto } from '../reviews/dto/review.dto';
import { ReviewsService } from '../reviews/reviews.service';
import { AdminSuggestionQueryDto, RemoveImageQueryDto, ReviewSuggestionDto } from '../toilet-suggestions/dto/suggestion.dto';
import { ToiletSuggestionsService } from '../toilet-suggestions/toilet-suggestions.service';
import {
  AdminCreateToiletDto,
  AdminToiletQueryDto,
  AdminUpdateToiletDto,
  ArchiveToiletQueryDto,
  SetCoverDto,
} from '../toilets/dto/admin-toilet.dto';
import { AdminToiletResponse, ToiletSummaryResponse } from '../toilets/dto/toilet.response';
import { ToiletImagesService } from '../toilets/toilet-images.service';
import { ToiletsService } from '../toilets/toilets.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminUserQueryDto,
  AssignmentQueryDto,
  AuditLogQueryDto,
  ChangeRoleDto,
  ChangeUserStatusDto,
  CreateAssignmentDto,
} from './dto/admin.dto';

/** Administrator API. Every route requires the CURRENT database role ADMIN. */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly users: AdminUsersService,
    private readonly suggestions: ToiletSuggestionsService,
    private readonly toilets: ToiletsService,
    private readonly images: ToiletImagesService,
    private readonly reports: ReportsService,
    private readonly reviews: ReviewsService,
  ) {}

  // ───────────── Statistics ─────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard statistics, recent pending submissions and unresolved reports' })
  dashboard() {
    return this.analytics.adminDashboard();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Analytics: monthly registrations/submissions, district distribution, report/rating breakdowns' })
  analyticsData(@Query() q: AnalyticsQueryDto) {
    return this.analytics.analytics(q.months);
  }

  // ───────────── Users ─────────────

  @Get('users')
  @ApiOperation({ summary: 'Search users (paginated)' })
  listUsers(@Query() q: AdminUserQueryDto) {
    return this.users.list(q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'User details with manager assignments' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Patch('users/:id/role')
  @ResponseMessage('Role updated')
  @ApiOperation({ summary: 'Change a user role (not your own; the last admin cannot be demoted)' })
  changeRole(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) {
    return this.users.changeRole(admin, id, dto.role);
  }

  @Patch('users/:id/status')
  @ResponseMessage('Account status updated')
  @ApiOperation({ summary: 'Activate or deactivate an account (deactivation revokes all sessions)' })
  changeStatus(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeUserStatusDto) {
    return this.users.changeStatus(admin, id, dto.isActive);
  }

  // ───────────── Suggestions ─────────────

  @Get('suggestions')
  @ApiOperation({ summary: 'Review queue: search/filter submissions (paginated)' })
  listSuggestions(@Query() q: AdminSuggestionQueryDto) {
    return this.suggestions.adminList(q);
  }

  @Get('suggestions/:id')
  @ApiOperation({
    summary: 'Submission details: contributor, private photos (signed URLs), coordinates, duplicate warnings, history',
  })
  getSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.suggestions.adminGet(id);
  }

  @Patch('suggestions/:id/status')
  @ResponseMessage('Submission reviewed')
  @ApiOperation({
    summary: 'Approve or reject a PENDING submission',
    description:
      'APPROVED: optional corrections/publishImageIds/coverImageId; creates a verified WC atomically and returns { suggestion, toilet }. ' +
      'REJECTED: rejectionReason required. Returns 409 if the submission was already processed (e.g. by another admin), ' +
      'with details.status and details.publishedToiletId. 403 when reviewing your own submission.',
  })
  reviewSuggestion(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewSuggestionDto) {
    return this.suggestions.review(admin, id, dto);
  }

  @Delete('suggestions/:id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Photo removed')
  @ApiOperation({ summary: 'Moderation: remove an inappropriate submission photo' })
  removeSuggestionImage(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Query() q: RemoveImageQueryDto,
  ) {
    return this.suggestions.adminRemoveImage(admin, id, imageId, q.reason);
  }

  // ───────────── Toilets ─────────────

  @Get('toilets')
  @ApiPaginatedEnvelope(ToiletSummaryResponse)
  @ApiOperation({ summary: 'WC inventory including unverified/archived records (paginated)' })
  listToilets(@Query() q: AdminToiletQueryDto) {
    return this.toilets.adminList(q);
  }

  @Post('toilets')
  @ApiEnvelope(AdminToiletResponse)
  @ResponseMessage('Verified WC created')
  @ApiOperation({ summary: 'Create a verified WC (administrators only)' })
  createToilet(@CurrentUser() admin: AuthUser, @Body() dto: AdminCreateToiletDto) {
    return this.toilets.adminCreate(admin, dto);
  }

  @Get('toilets/:id')
  @ApiEnvelope(AdminToiletResponse)
  @ApiOperation({ summary: 'WC details in any state' })
  getToilet(@Param('id', ParseUUIDPipe) id: string) {
    return this.toilets.getForManagement(id);
  }

  @Patch('toilets/:id')
  @ApiEnvelope(AdminToiletResponse)
  @ResponseMessage('WC updated')
  @ApiOperation({ summary: 'Update any WC field, facilities and opening hours (null clears optional fields)' })
  updateToilet(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateToiletDto) {
    return this.toilets.update(admin, id, dto);
  }

  @Delete('toilets/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('WC archived')
  @ApiOperation({ summary: 'Archive a WC (soft delete; hidden from public endpoints). Optional ?reason=' })
  archiveToilet(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ArchiveToiletQueryDto) {
    return this.toilets.archive(admin, id, q.reason);
  }

  @Post('toilets/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('WC restored')
  @ApiOperation({ summary: 'Restore an archived WC' })
  restoreToilet(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.toilets.restore(admin, id);
  }

  @Post('toilets/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Verification recorded')
  @ApiOperation({ summary: 'Record an on-site re-verification (updates lastVerifiedAt)' })
  verifyToilet(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.toilets.verify(admin, id);
  }

  @Get('toilets/:id/images')
  @ApiOperation({ summary: 'Photos of a WC' })
  toiletImages(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.images.list(admin, id);
  }

  @Patch('toilets/:id/cover')
  @ResponseMessage('Cover photo updated')
  @ApiOperation({ summary: 'Choose the cover photo' })
  setCover(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCoverDto) {
    return this.images.setCover(admin, id, dto.imageId);
  }

  @Delete('toilets/:id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Photo deleted')
  @ApiOperation({ summary: 'Delete or moderate a WC photo' })
  deleteImage(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Query() q: RemoveImageQueryDto,
  ) {
    return this.images.remove(admin, id, imageId, q.reason);
  }

  // ───────────── Manager assignments ─────────────

  @Get('manager-assignments')
  @ApiOperation({ summary: 'List manager assignments (paginated)' })
  listAssignments(@Query() q: AssignmentQueryDto) {
    return this.users.listAssignments(q);
  }

  @Post('manager-assignments')
  @ResponseMessage('Manager assigned')
  @ApiOperation({ summary: 'Assign a MANAGER to a WC (409 if already assigned)' })
  assign(@CurrentUser() admin: AuthUser, @Body() dto: CreateAssignmentDto) {
    return this.users.createAssignment(admin, dto);
  }

  @Delete('manager-assignments/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Assignment removed')
  @ApiOperation({ summary: 'Remove a manager assignment' })
  async unassign(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.deleteAssignment(admin, id);
    return null;
  }

  // ───────────── Reports ─────────────

  @Get('reports')
  @ApiOperation({ summary: 'All maintenance reports (paginated, filterable)' })
  listReports(@CurrentUser() admin: AuthUser, @Query() q: ReportQueryDto) {
    return this.reports.list(admin, q);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Report details including reporter contact' })
  getReport(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(admin, id);
  }

  @Patch('reports/:id/status')
  @ResponseMessage('Report status updated')
  @ApiOperation({ summary: 'Change report status' })
  updateReport(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReportStatusDto) {
    return this.reports.updateStatus(admin, id, dto);
  }

  // ───────────── Review moderation ─────────────

  @Get('reviews')
  @ApiOperation({ summary: 'All reviews including hidden ones (paginated)' })
  listReviews(@Query() q: AdminReviewQueryDto) {
    return this.reviews.adminList(q);
  }

  @Patch('reviews/:id/moderation')
  @ResponseMessage('Review moderated')
  @ApiOperation({ summary: 'Hide or un-hide a review (hidden reviews do not count in averages)' })
  moderate(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderate(admin, id, dto);
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review deleted')
  @ApiOperation({ summary: 'Delete a review' })
  async deleteReview(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.reviews.adminDelete(admin, id);
    return null;
  }

  // ───────────── Audit ─────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'Audit trail (paginated)' })
  auditLogs(@Query() q: AuditLogQueryDto) {
    return this.users.auditLogs(q);
  }
}
