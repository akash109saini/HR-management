import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Announcement } from './schemas/announcement.schema';

@Injectable()
export class AnnouncementsService {
  constructor(@InjectModel(Announcement.name) private announcementModel: Model<Announcement>) {}

  async getAll(tenantId: string) {
    return this.announcementModel.find({ tenant_id: tenantId, is_active: true }).sort({ created_at: -1 }).lean();
  }

  async create(data: any, author: string) {
    const ann = new this.announcementModel({
      ...data,
      announcement_id: uuidv4(),
      author,
      created_at: new Date().toISOString(),
      is_active: true,
    });
    await ann.save();
    return ann.toObject();
  }

  async remove(id: string, tenantId: string) {
    await this.announcementModel.findOneAndUpdate({ announcement_id: id, tenant_id: tenantId }, { $set: { is_active: false } });
    return { message: 'Deleted' };
  }
}
