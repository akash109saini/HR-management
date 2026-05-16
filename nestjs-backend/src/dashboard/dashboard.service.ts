import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../employees/schemas/user.schema';
import { Leave } from '../leaves/schemas/leave.schema';
import { Attendance } from '../attendance/schemas/attendance.schema';
import { Tenant } from '../tenants/schemas/tenant.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
  ) {}

  async getHRDashboard(tenantId: string) {
    const today = new Date().toISOString().split('T')[0];
    const [totalEmp, todayPresent, pendingLeaves] = await Promise.all([
      this.userModel.countDocuments({ tenant_id: tenantId, role: 'employee', status: 'active' }),
      this.attendanceModel.countDocuments({ tenant_id: tenantId, date: today, status: { $in: ['present', 'late', 'work_from_home'] } }),
      this.leaveModel.countDocuments({ tenant_id: tenantId, status: 'pending' }),
    ]);
    return { total_employees: totalEmp, today_present: todayPresent, pending_leaves: pendingLeaves };
  }

  async getSuperAdminDashboard() {
    const [totalTenants, activeTenants, totalEmployees] = await Promise.all([
      this.tenantModel.countDocuments(),
      this.tenantModel.countDocuments({ status: 'active' }),
      this.userModel.countDocuments({ role: { $in: ['employee', 'hr_manager'] } }),
    ]);
    const tenants = await this.tenantModel.find().lean();
    return { total_tenants: totalTenants, active_tenants: activeTenants, total_employees: totalEmployees, tenants };
  }
}
