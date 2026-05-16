import { Controller, Post, Get, Body, Req, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt.guard';
import { AiService } from './ai.service';

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI HR Chatbot - ask HR questions' })
  async chat(@Req() req: any, @Body() body: { message: string; session_id?: string }) {
    return this.aiService.chat(body.message, req.user, body.session_id);
  }

  @Get('attrition-risk/:employeeId')
  @ApiOperation({ summary: 'Predict attrition risk for an employee' })
  async getAttritionRisk(@Param('employeeId') empId: string, @Req() req: any) {
    return this.aiService.predictAttritionRisk(empId, req.user.tenant_id);
  }

  @Post('analyze-sentiment')
  @ApiOperation({ summary: 'Analyze sentiment of text (for surveys/feedback)' })
  async analyzeSentiment(@Body() body: { text: string; context?: string }) {
    return this.aiService.analyzeSentiment(body.text, body.context);
  }

  @Post('parse-resume')
  @ApiOperation({ summary: 'AI resume parser with blind hiring (removes PII)' })
  async parseResume(@Body() body: { resume_text: string; job_description?: string; blind_hiring?: boolean }) {
    return this.aiService.parseResume(body.resume_text, body.job_description, body.blind_hiring !== false);
  }

  @Get('career-path/:employeeId')
  @ApiOperation({ summary: 'AI career path suggestions based on profile' })
  async suggestCareerPath(@Param('employeeId') empId: string, @Req() req: any) {
    return this.aiService.suggestCareerPath(empId, req.user.tenant_id);
  }

  @Get('setup-guide')
  @ApiOperation({ summary: 'AI setup guide' })
  getSetupGuide() {
    return this.aiService.getSetupGuide();
  }
}
