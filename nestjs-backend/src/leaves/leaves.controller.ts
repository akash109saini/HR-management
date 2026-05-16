import { Controller, Get, Post, Put, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { LeavesService } from './leaves.service';

@ApiTags('leaves')
@Controller('leaves')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get()
  getAll(@Req() req: any) { return this.leavesService.getLeaves(req.user); }

  @Post()
  apply(@Req() req: any, @Body() body: any) { return this.leavesService.applyLeave(req.user, body); }

  @Put(':leaveId/approve')
  approve(@Param('leaveId') id: string, @Req() req: any) { return this.leavesService.actionLeave(id, 'approved', req.user); }

  @Put(':leaveId/reject')
  reject(@Param('leaveId') id: string, @Req() req: any) { return this.leavesService.actionLeave(id, 'rejected', req.user); }

  @Get('balance')
  balance(@Req() req: any) { return this.leavesService.getLeaveBalance(req.user.employee_id, req.user.tenant_id); }
}
