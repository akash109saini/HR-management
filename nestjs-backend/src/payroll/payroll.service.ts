import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Payroll } from './schemas/payroll.schema';
import { User } from '../employees/schemas/user.schema';

@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(Payroll.name) private payrollModel: Model<Payroll>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getPayroll(user: any) {
    const query: any = { tenant_id: user.tenant_id };
    if (user.role === 'employee') query.employee_id = user.employee_id;
    return this.payrollModel.find(query).sort({ year: -1, month: -1 }).lean();
  }

  async generatePayroll(tenantId: string, month: string, year: number) {
    const employees = await this.userModel.find({ tenant_id: tenantId, role: 'employee', status: 'active' }).lean();
    const results: any[] = [];
    for (const emp of employees) {
      const existing = await this.payrollModel.findOne({ employee_id: emp.employee_id, month, year });
      if (!existing) {
        const basic = emp.salary || 50000;
        const allowances = basic * 0.2;
        const deductions = basic * 0.1;
        const payroll = new this.payrollModel({
          payroll_id: uuidv4(),
          employee_id: emp.employee_id,
          tenant_id: tenantId,
          month,
          year,
          basic_salary: basic,
          allowances: Math.round(allowances),
          deductions: Math.round(deductions),
          net_salary: Math.round(basic + allowances - deductions),
          status: 'draft',
          created_at: new Date().toISOString(),
        });
        await payroll.save();
        results.push(payroll.toObject());
      }
    }
    return results;
  }

  async requestOnDemandPay(employeeId: string, tenantId: string, amount: number) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const payroll = await this.payrollModel.findOne({ employee_id: employeeId, tenant_id: tenantId, month, year: now.getFullYear() });
    if (!payroll) throw new NotFoundException('Payroll record not found for this month');
    const maxAdvance = payroll.net_salary * 0.5;
    if (amount > maxAdvance) throw new Error(`Max on-demand amount is ${maxAdvance} (50% of net salary)`);
    payroll.advance_drawn = (payroll.advance_drawn || 0) + amount;
    payroll.on_demand_pay_requested = true;
    await payroll.save();
    return { message: `On-demand pay of ${amount} requested successfully`, payroll: payroll.toObject() };
  }
}
