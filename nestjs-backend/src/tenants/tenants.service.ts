import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './schemas/tenant.schema';
import { User } from '../employees/schemas/user.schema';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async findAll() {
    const tenants = await this.tenantModel.find().lean();
    return Promise.all(tenants.map(async (t) => ({
      ...t,
      employee_count: await this.userModel.countDocuments({ tenant_id: t.tenant_id, role: { $in: ['employee', 'hr_manager'] } }),
    })));
  }

  async findOne(tenantId: string) {
    const tenant = await this.tenantModel.findOne({ tenant_id: tenantId }).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(tenantId: string, data: Partial<Tenant>) {
    const result = await this.tenantModel.findOneAndUpdate(
      { tenant_id: tenantId },
      { $set: data },
      { new: true },
    ).lean();
    if (!result) throw new NotFoundException('Tenant not found');
    return result;
  }
}
