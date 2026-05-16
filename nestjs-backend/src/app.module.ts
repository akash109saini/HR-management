import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { TenantsModule } from './tenants/tenants.module';
import { LeavesModule } from './leaves/leaves.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PayrollModule } from './payroll/payroll.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URL || 'mongodb://localhost:27017', {
      dbName: process.env.DB_DATABASE || 'test_database',
    }),
    AuthModule,
    EmployeesModule,
    TenantsModule,
    LeavesModule,
    AttendanceModule,
    PayrollModule,
    AnnouncementsModule,
    DashboardModule,
    WhatsappModule,
    BlockchainModule,
    AiModule,
  ],
})
export class AppModule {}
