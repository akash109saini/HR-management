import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BiometricController } from './biometric.controller';
import { BiometricService } from './biometric.service';
import { BiometricPunch, BiometricPunchSchema } from './schemas/biometric-punch.schema';
import { User, UserSchema } from '../employees/schemas/user.schema';
import { Attendance, AttendanceSchema } from '../attendance/schemas/attendance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BiometricPunch.name, schema: BiometricPunchSchema },
      { name: User.name, schema: UserSchema },
      { name: Attendance.name, schema: AttendanceSchema },
    ]),
  ],
  controllers: [BiometricController],
  providers: [BiometricService],
  exports: [BiometricService],
})
export class BiometricModule {}
