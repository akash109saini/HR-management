import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'tenants', timestamps: false })
export class Tenant extends Document {
  @Prop({ required: true, unique: true })
  tenant_id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  domain: string;

  @Prop({ enum: ['basic', 'premium', 'enterprise'], default: 'basic' })
  plan: string;

  @Prop({ enum: ['active', 'suspended', 'trial'], default: 'active' })
  status: string;

  @Prop()
  admin_email: string;

  @Prop()
  admin_name: string;

  @Prop()
  industry: string;

  @Prop({ default: 0 })
  employee_count: number;

  @Prop()
  created_at: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
