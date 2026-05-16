import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'payrolls', timestamps: false })
export class Payroll extends Document {
  @Prop({ required: true })
  payroll_id: string;

  @Prop()
  employee_id: string;

  @Prop()
  tenant_id: string;

  @Prop()
  month: string;

  @Prop()
  year: number;

  @Prop()
  basic_salary: number;

  @Prop()
  allowances: number;

  @Prop()
  deductions: number;

  @Prop()
  net_salary: number;

  @Prop({ enum: ['draft', 'processed', 'paid'], default: 'draft' })
  status: string;

  @Prop()
  payment_date: string;

  @Prop()
  created_at: string;

  // On-demand pay tracking
  @Prop({ default: 0 })
  advance_drawn: number;

  @Prop({ default: false })
  on_demand_pay_requested: boolean;
}

export const PayrollSchema = SchemaFactory.createForClass(Payroll);
