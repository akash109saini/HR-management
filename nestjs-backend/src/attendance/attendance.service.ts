import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Attendance } from './schemas/attendance.schema';

@Injectable()
export class AttendanceService {
  constructor(@InjectModel(Attendance.name) private attendanceModel: Model<Attendance>) {}

  async getAll(user: any, params: any = {}) {
    const query: any = { tenant_id: user.tenant_id };
    if (user.role === 'employee') query.employee_id = user.employee_id;
    if (params.employee_id) query.employee_id = params.employee_id;
    if (params.month) query.date = { $regex: `^${params.month}` };
    return this.attendanceModel.find(query).sort({ date: -1 }).lean();
  }

  async checkIn(employeeId: string, tenantId: string) {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.attendanceModel.findOne({ employee_id: employeeId, date: today });
    if (existing) {
      existing.check_in = new Date().toISOString();
      await existing.save();
      return existing.toObject();
    }
    const att = new this.attendanceModel({
      attendance_id: uuidv4(),
      employee_id: employeeId,
      tenant_id: tenantId,
      date: today,
      check_in: new Date().toISOString(),
      status: 'present',
    });
    await att.save();
    return att.toObject();
  }

  async checkOut(employeeId: string, tenantId: string) {
    const today = new Date().toISOString().split('T')[0];
    const att = await this.attendanceModel.findOne({ employee_id: employeeId, date: today });
    if (!att) return null;
    att.check_out = new Date().toISOString();
    if (att.check_in) {
      const diff = (new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 3600000;
      att.hours_worked = Math.round(diff * 100) / 100;
    }
    await att.save();
    return att.toObject();
  }

  async markBulk(data: any[], tenantId: string) {
    const results: any[] = [];
    for (const item of data) {
      const existing = await this.attendanceModel.findOne({ employee_id: item.employee_id, date: item.date });
      if (existing) {
        Object.assign(existing, item);
        await existing.save();
        results.push(existing.toObject());
      } else {
        const att = new this.attendanceModel({ ...item, attendance_id: uuidv4(), tenant_id: tenantId });
        await att.save();
        results.push(att.toObject());
      }
    }
    return results;
  }
}
