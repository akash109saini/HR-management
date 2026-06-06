import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'biometric_punches' })
export class BiometricPunch extends Document {
  @Prop() punch_id: string;
  @Prop() device_sn: string;
  @Prop() device_name: string;
  @Prop() tenant_id: string;
  @Prop() user_pin: string;
  @Prop() employee_id: string;
  @Prop() employee_name: string;
  @Prop() timestamp: string;
  @Prop() status: string;
  @Prop() verify_mode: string;
  @Prop() source: string;
  @Prop() matched: boolean;
  @Prop() received_at: string;
}

export const BiometricPunchSchema = SchemaFactory.createForClass(BiometricPunch);
