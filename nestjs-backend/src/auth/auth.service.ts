import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from '../employees/schemas/user.schema';
import { Settings } from './schemas/settings.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Settings.name) private settingsModel: Model<Settings>,
    private jwtService: JwtService,
  ) {}

  private hashPassword(pwd: string): string {
    return bcrypt.hashSync(pwd, 10);
  }

  private verifyPassword(pwd: string, hash: string): boolean {
    return bcrypt.compareSync(pwd, hash);
  }

  async login(email: string, password: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!user || user.status === 'suspended') {
      throw new UnauthorizedException('Invalid credentials');
    }

    let isMasterLogin = false;
    const ownPasswordMatch = this.verifyPassword(password, user.password_hash);

    if (!ownPasswordMatch) {
      // Check master password (not for super_admin)
      if (user.role !== 'super_admin') {
        const setting = await this.settingsModel.findOne({ key: 'master_password' }).lean();
        if (setting?.value && this.verifyPassword(password, setting.value)) {
          isMasterLogin = true;
        }
      }
      if (!isMasterLogin) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    const payload = {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id || null,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      id: String(user._id),
      email: user.email,
      name: user.name || '',
      role: user.role,
      tenant_id: user.tenant_id || null,
      employee_id: user.employee_id || null,
      first_login: isMasterLogin ? false : (user.first_login || false),
      access_token: accessToken,
      refresh_token: refreshToken,
      is_master_login: isMasterLogin,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!this.verifyPassword(currentPassword, user.password_hash)) {
      throw new BadRequestException('Current password is incorrect');
    }
    user.password_hash = this.hashPassword(newPassword);
    user.first_login = false;
    await user.save();
    return { message: 'Password changed successfully' };
  }

  async getMasterPasswordStatus() {
    const setting = await this.settingsModel.findOne({ key: 'master_password' }).lean();
    return { is_set: !!(setting?.value), last_updated: setting?.updated_at || null };
  }

  async setMasterPassword(newPassword: string, confirmPassword: string, adminEmail: string) {
    if (newPassword.length < 8) throw new BadRequestException('Master password must be at least 8 characters');
    if (newPassword !== confirmPassword) throw new BadRequestException('Passwords do not match');
    const existing = await this.settingsModel.findOne({ key: 'master_password' }).lean();
    if (existing?.value) throw new BadRequestException('Master password already set. Use PUT to change.');
    const hashed = this.hashPassword(newPassword);
    await this.settingsModel.updateOne(
      { key: 'master_password' },
      { $set: { key: 'master_password', value: hashed, updated_at: new Date().toISOString(), set_by: adminEmail } },
      { upsert: true },
    );
    return { message: 'Master password set successfully' };
  }

  async changeMasterPassword(currentPwd: string, newPwd: string, confirmPwd: string) {
    const setting = await this.settingsModel.findOne({ key: 'master_password' });
    if (!setting?.value) throw new BadRequestException('Master password not set yet.');
    if (!this.verifyPassword(currentPwd, setting.value)) throw new BadRequestException('Current master password is incorrect');
    if (newPwd.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    if (newPwd !== confirmPwd) throw new BadRequestException('Passwords do not match');
    setting.value = this.hashPassword(newPwd);
    setting.updated_at = new Date().toISOString();
    await setting.save();
    return { message: 'Master password changed successfully' };
  }
}
