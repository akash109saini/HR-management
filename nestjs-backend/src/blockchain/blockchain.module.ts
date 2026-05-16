/**
 * Blockchain Module - Ethereum Sepolia Testnet
 * Stores employee credentials/certifications as immutable records
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';
import { Credential, CredentialSchema } from './schemas/credential.schema';
import { User, UserSchema } from '../employees/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Credential.name, schema: CredentialSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
  ],
  controllers: [BlockchainController],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
