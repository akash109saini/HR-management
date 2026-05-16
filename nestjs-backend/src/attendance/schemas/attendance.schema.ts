import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'attendances', timestamps: false })
export class Attendance extends Document {
  @Prop({ required: true })
  attendance_id: string;

  @Prop({ required: true })
  employee_id: string;

  @Prop()
  tenant_id: string;

  @Prop()
  date: string;

  @Prop()
  check_in: string;

  @Prop()
  check_out: string;

  @Prop({ enum: ['present', 'absent', 'late', 'half_day', 'work_from_home'], default: 'present' })
  status: string;

  @Prop()
  hours_worked: number;

  @Prop()
  overtime_hours: number;

  @Prop()
  notes: string;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);
