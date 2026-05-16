import { Controller, Get, Post, Body, Req, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  getAll(@Req() req: any, @Query() query: any) { return this.attendanceService.getAll(req.user, query); }

  @Post('check-in')
  checkIn(@Req() req: any) { return this.attendanceService.checkIn(req.user.employee_id, req.user.tenant_id); }

  @Post('check-out')
  checkOut(@Req() req: any) { return this.attendanceService.checkOut(req.user.employee_id, req.user.tenant_id); }

  @Post('bulk')
  markBulk(@Req() req: any, @Body() body: any[]) { return this.attendanceService.markBulk(body, req.user.tenant_id); }
}
