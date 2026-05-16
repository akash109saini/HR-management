import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'announcements', timestamps: false })
export class Announcement extends Document {
  @Prop({ required: true })
  announcement_id: string;

  @Prop()
  tenant_id: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  content: string;

  @Prop({ enum: ['general', 'hr', 'urgent', 'event'], default: 'general' })
  category: string;

  @Prop()
  author: string;

  @Prop()
  created_at: string;

  @Prop({ default: true })
  is_active: boolean;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
