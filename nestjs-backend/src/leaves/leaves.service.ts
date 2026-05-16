import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Leave } from './schemas/leave.schema';
import { User } from '../employees/schemas/user.schema';

@Injectable()
export class LeavesService {
  constructor(
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getLeaves(user: any) {
    const query: any = { tenant_id: user.tenant_id };
    if (user.role === 'employee') query.employee_id = user.employee_id;
    return this.leaveModel.find(query).sort({ applied_at: -1 }).lean();
  }

  async applyLeave(user: any, data: any) {
    const emp = await this.userModel.findOne({ employee_id: user.employee_id }).lean();
    const leave = new this.leaveModel({
      leave_id: uuidv4(),
      employee_id: user.employee_id,
      tenant_id: user.tenant_id,
      employee_name: emp?.name || user.email,
      leave_type: data.leave_type,
      start_date: data.start_date,
      end_date: data.end_date,
      days: data.days || 1,
      reason: data.reason,
      status: 'pending',
      applied_at: new Date().toISOString(),
    });
    await leave.save();
    return leave.toObject();
  }

  async actionLeave(leaveId: string, action: 'approved' | 'rejected', actioner: any) {
    const leave = await this.leaveModel.findOne({ leave_id: leaveId });
    if (!leave) throw new NotFoundException('Leave not found');
    if (leave.tenant_id !== actioner.tenant_id && actioner.role !== 'super_admin') {
      throw new ForbiddenException('Not authorized');
    }
    leave.status = action;
    leave.actioned_at = new Date().toISOString();
    leave.actioned_by = actioner.email;
    await leave.save();
    return leave.toObject();
  }

  async getLeaveBalance(employeeId: string, tenantId: string) {
    const approvedLeaves = await this.leaveModel.find({
      employee_id: employeeId,
      tenant_id: tenantId,
      status: 'approved',
    }).lean();
    const taken: Record<string, number> = {};
    approvedLeaves.forEach(l => {
      taken[l.leave_type] = (taken[l.leave_type] || 0) + (l.days || 1);
    });
    const allowances = { annual: 21, sick: 10, casual: 7, maternity: 90 };
    return Object.entries(allowances).map(([type, total]) => ({
      type,
      total,
      taken: taken[type] || 0,
      remaining: total - (taken[type] || 0),
    }));
  }
}
