/**
 * AI Module - HR Intelligence Engine
 * Uses emergentintegrations LLM for:
 * - HR Chatbot (employee Q&A)
 * - Sentiment Analysis
 * - Attrition Risk Prediction
 * - Resume Parsing (Blind Hiring)
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { User, UserSchema } from '../employees/schemas/user.schema';
import { Leave, LeaveSchema } from '../leaves/schemas/leave.schema';
import { Attendance, AttendanceSchema } from '../attendance/schemas/attendance.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Leave.name, schema: LeaveSchema },
      { name: Attendance.name, schema: AttendanceSchema },
    ]),
    AuthModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
