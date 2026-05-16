import { Controller, Post, Put, Get, Delete, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password (or master password)' })
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password' })
  async changePassword(@Req() req: any, @Body() body: { current_password: string; new_password: string }) {
    return this.authService.changePassword(req.user.id, body.current_password, body.new_password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  async me(@Req() req: any) {
    return req.user;
  }

  // Master Password endpoints
  @Get('master-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  async getMasterPasswordStatus() {
    return this.authService.getMasterPasswordStatus();
  }

  @Post('master-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  async setMasterPassword(@Req() req: any, @Body() body: { new_password: string; confirm_password: string }) {
    return this.authService.setMasterPassword(body.new_password, body.confirm_password, req.user.email);
  }

  @Put('master-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  async changeMasterPassword(@Body() body: { current_master_password: string; new_password: string; confirm_password: string }) {
    return this.authService.changeMasterPassword(body.current_master_password, body.new_password, body.confirm_password);
  }

  @Delete('master-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  async disableMasterPassword() {
    return this.authService.changeMasterPassword('', '', '');
  }
}
