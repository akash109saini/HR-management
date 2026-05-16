import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { BlockchainService } from './blockchain.service';

@ApiTags('blockchain')
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('setup-guide')
  @ApiOperation({ summary: 'Get Alchemy/Blockchain setup instructions' })
  getSetupGuide() {
    return this.blockchainService.getSetupGuide();
  }

  @Post('credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Store employee credential on blockchain' })
  async storeCredential(@Req() req: any, @Body() body: any) {
    return this.blockchainService.storeCredential(
      body.employee_id || req.user.employee_id,
      req.user.tenant_id,
      body,
    );
  }

  @Get('credentials/verify/:id')
  @ApiOperation({ summary: 'Verify credential authenticity (public endpoint)' })
  verify(@Param('id') id: string) {
    return this.blockchainService.verifyCredential(id);
  }

  @Get('credentials/employee/:employeeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all credentials for an employee' })
  getCredentials(@Param('employeeId') empId: string) {
    return this.blockchainService.getEmployeeCredentials(empId);
  }
}
