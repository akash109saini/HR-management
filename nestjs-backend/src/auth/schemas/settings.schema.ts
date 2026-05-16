import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'settings', timestamps: false })
export class Settings extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop()
  value: string;

  @Prop()
  updated_at: string;

  @Prop()
  set_by: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
