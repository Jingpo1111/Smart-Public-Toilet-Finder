import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get my profile (same as GET /auth/me)' })
  profile(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch('profile')
  @ResponseMessage('Profile updated successfully')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'Accepts fullName, phone and preferredLanguage only. Sending role or any other property returns 400.',
  })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard counters: my submissions/reports by status, reviews, favorites, unread notifications' })
  summary(@CurrentUser() user: AuthUser) {
    return this.users.summary(user.id);
  }
}
