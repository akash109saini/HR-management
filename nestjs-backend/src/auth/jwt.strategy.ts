import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../employees/schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.cookies?.access_token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'hrms_secret',
    });
  }

  async validate(payload: any) {
    const user = await this.userModel.findById(payload.sub).lean();
    if (!user) throw new UnauthorizedException();
    return {
      id: String(user._id),
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      employee_id: user.employee_id,
    };
  }
}
