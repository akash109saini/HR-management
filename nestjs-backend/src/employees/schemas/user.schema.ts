import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'users', timestamps: false })
export class User extends Document {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  password_hash: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['super_admin', 'hr_manager', 'employee'], default: 'employee' })
  role: string;

  @Prop()
  tenant_id: string;

  @Prop()
  employee_id: string;

  @Prop()
  mobile: string;

  @Prop({ enum: ['active', 'suspended', 'terminated'], default: 'active' })
  status: string;

  @Prop({ default: false })
  first_login: boolean;

  @Prop()
  department: string;

  @Prop()
  designation: string;

  @Prop()
  date_of_joining: string;

  @Prop()
  salary: number;

  @Prop()
  avatar: string;

  @Prop()
  created_at: string;

  @Prop()
  updated_at: string;

  // Blockchain credential hash
  @Prop()
  credential_hash: string;

  // WhatsApp number for notifications
  @Prop()
  whatsapp_number: string;

  // AI-computed attrition risk score 0-100
  @Prop({ default: 0 })
  attrition_risk_score: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ tenant_id: 1 });
UserSchema.index({ employee_id: 1 });
