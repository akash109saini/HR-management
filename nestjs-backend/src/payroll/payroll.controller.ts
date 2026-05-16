import { Controller, Get, Post, Body, Req, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@Controller('payroll')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  getPayroll(@Req() req: any) { return this.payrollService.getPayroll(req.user); }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'hr_manager')
  generate(@Req() req: any, @Body() body: { month: string; year: number }) {
    return this.payrollService.generatePayroll(req.user.tenant_id, body.month, body.year);
  }

  @Post('on-demand')
  requestOnDemandPay(@Req() req: any, @Body() body: { amount: number }) {
    return this.payrollService.requestOnDemandPay(req.user.employee_id, req.user.tenant_id, body.amount);
  }
}
