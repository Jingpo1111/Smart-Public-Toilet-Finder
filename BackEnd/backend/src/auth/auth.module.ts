import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AccountController, AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets/options are passed explicitly per sign/verify call (separate access and refresh secrets).
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController, AccountController],
  providers: [AuthService, TokenService, PasswordService, JwtStrategy],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
