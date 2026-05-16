import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { AnnouncementsService } from './announcements.service';

@ApiTags('announcements')
@Controller('announcements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  getAll(@Req() req: any) { return this.announcementsService.getAll(req.user.tenant_id); }

  @Post()
  create(@Req() req: any, @Body() body: any) { return this.announcementsService.create({ ...body, tenant_id: req.user.tenant_id }, req.user.email); }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) { return this.announcementsService.remove(id, req.user.tenant_id); }
}
