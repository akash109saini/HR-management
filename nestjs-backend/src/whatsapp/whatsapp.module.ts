/**
 * WhatsApp Module - Meta Business Cloud API Integration
 * Handles incoming messages and sends automated responses
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { User, UserSchema } from '../employees/schemas/user.schema';
import { Leave, LeaveSchema } from '../leaves/schemas/leave.schema';
import { Payroll, PayrollSchema } from '../payroll/schemas/payroll.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Leave.name, schema: LeaveSchema },
      { name: Payroll.name, schema: PayrollSchema },
    ]),
    AuthModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
