import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async getAll(@Req() req: any) {
    const tenantId = req.user.tenant_id;
    return this.employeesService.findAllByTenant(tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'hr_manager')
  async create(@Body() body: any, @Req() req: any) {
    return this.employeesService.create({ ...body, tenant_id: req.user.tenant_id });
  }

  @Get('profile')
  async getMyProfile(@Req() req: any) {
    return this.employeesService.getProfile(req.user.id);
  }

  @Get(':employee_id')
  async getOne(@Param('employee_id') id: string, @Req() req: any) {
    return this.employeesService.findOne(id, req.user.tenant_id);
  }

  @Put(':employee_id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'hr_manager')
  async update(@Param('employee_id') id: string, @Body() body: any, @Req() req: any) {
    return this.employeesService.update(id, req.user.tenant_id, body);
  }

  @Post(':employee_id/reset-password')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'hr_manager')
  async resetPassword(@Param('employee_id') id: string, @Req() req: any) {
    return this.employeesService.resetPassword(id, req.user.tenant_id);
  }
}
