import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EmployeesService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async findAllByTenant(tenantId: string, includeHR = true) {
    const query: any = { tenant_id: tenantId };
    if (!includeHR) query.role = 'employee';
    return this.userModel.find(query, { password_hash: 0 }).lean();
  }

  async findOne(employeeId: string, tenantId?: string) {
    const query: any = { employee_id: employeeId };
    if (tenantId) query.tenant_id = tenantId;
    const emp = await this.userModel.findOne(query, { password_hash: 0 }).lean();
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async create(data: Partial<User> & { password?: string }) {
    const password = data.password || data.mobile || 'changeme123';
    const emp = new this.userModel({
      ...data,
      password_hash: bcrypt.hashSync(password, 10),
      first_login: true,
      status: data.status || 'active',
      created_at: new Date().toISOString(),
    });
    await emp.save();
    const obj = emp.toObject() as any;
    delete obj.password_hash;
    return obj;
  }

  async update(employeeId: string, tenantId: string, data: Partial<User>) {
    const result = await this.userModel.findOneAndUpdate(
      { employee_id: employeeId, tenant_id: tenantId },
      { $set: { ...data, updated_at: new Date().toISOString() } },
      { new: true, projection: { password_hash: 0 } },
    ).lean();
    if (!result) throw new NotFoundException('Employee not found');
    return result;
  }

  async resetPassword(employeeId: string, tenantId: string) {
    const emp = await this.userModel.findOne({ employee_id: employeeId, tenant_id: tenantId });
    if (!emp) throw new NotFoundException('Employee not found');
    const newPassword = emp.mobile || '123456';
    emp.password_hash = bcrypt.hashSync(newPassword, 10);
    emp.first_login = true;
    await emp.save();
    return { message: 'Password reset successfully', new_password: newPassword, employee_id: employeeId };
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId, { password_hash: 0 }).lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
