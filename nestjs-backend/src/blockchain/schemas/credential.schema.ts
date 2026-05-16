import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'credentials', timestamps: false })
export class Credential extends Document {
  @Prop({ required: true })
  credential_id: string;

  @Prop({ required: true })
  employee_id: string;

  @Prop()
  tenant_id: string;

  @Prop({ required: true })
  type: string; // 'education', 'certification', 'employment'

  @Prop({ required: true })
  title: string;

  @Prop()
  issuer: string;

  @Prop()
  issue_date: string;

  @Prop()
  expiry_date: string;

  // Blockchain record
  @Prop()
  tx_hash: string;

  @Prop()
  block_number: number;

  @Prop()
  contract_address: string;

  @Prop({ enum: ['pending', 'on_chain', 'verified', 'mock'], default: 'pending' })
  blockchain_status: string;

  @Prop()
  hash: string; // SHA-256 hash of credential data

  @Prop()
  created_at: string;

  @Prop()
  verified_at: string;
}

export const CredentialSchema = SchemaFactory.createForClass(Credential);
