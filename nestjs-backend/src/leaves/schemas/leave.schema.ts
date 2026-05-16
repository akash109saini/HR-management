import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'leaves', timestamps: false })
export class Leave extends Document {
  @Prop({ required: true })
  leave_id: string;

  @Prop({ required: true })
  employee_id: string;

  @Prop()
  tenant_id: string;

  @Prop()
  employee_name: string;

  @Prop()
  leave_type: string;

  @Prop()
  start_date: string;

  @Prop()
  end_date: string;

  @Prop()
  days: number;

  @Prop()
  reason: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop()
  applied_at: string;

  @Prop()
  actioned_at: string;

  @Prop()
  actioned_by: string;

  // WhatsApp request tracking
  @Prop()
  whatsapp_request_id: string;
}

export const LeaveSchema = SchemaFactory.createForClass(Leave);
