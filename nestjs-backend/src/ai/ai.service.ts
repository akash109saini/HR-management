import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../employees/schemas/user.schema';
import { Leave } from '../leaves/schemas/leave.schema';
import { Attendance } from '../attendance/schemas/attendance.schema';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llmKey = process.env.EMERGENT_LLM_KEY || '';
  private readonly aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001/api/ai';

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
  ) {}

  // Delegate AI calls to Python FastAPI AI service
  private async callAIService(endpoint: string, data: any) {
    try {
      const response = await axios.post(`${this.aiServiceUrl}${endpoint}`, data, {
        headers: { 'x-internal-key': process.env.JWT_SECRET || '' },
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      this.logger.error(`AI service call failed: ${err.message}`);
      return { error: 'AI service unavailable', fallback: true };
    }
  }

  async chat(message: string, user: any, sessionId?: string) {
    // Build context from user data
    const emp = await this.userModel.findOne({ employee_id: user.employee_id }).lean();
    const context = emp ? `Employee: ${emp.name}, Role: ${emp.designation}, Dept: ${emp.department}` : '';
    return this.callAIService('/chat', { message, session_id: sessionId || user.id, user_context: context, employee_id: user.employee_id, tenant_id: user.tenant_id });
  }

  async predictAttritionRisk(employeeId: string, tenantId: string) {
    const emp = await this.userModel.findOne({ employee_id: employeeId, tenant_id: tenantId }).lean();
    if (!emp) return { error: 'Employee not found' };
    const leaves = await this.leaveModel.countDocuments({ employee_id: employeeId, tenant_id: tenantId });
    const attendance = await this.attendanceModel.find({ employee_id: employeeId, tenant_id: tenantId }).sort({ date: -1 }).limit(30).lean();
    return this.callAIService('/attrition-risk', { employee: emp, leave_count: leaves, recent_attendance: attendance });
  }

  async analyzeSentiment(text: string, context?: string) {
    return this.callAIService('/sentiment', { text, context });
  }

  async parseResume(resumeText: string, jobDescription?: string, blindHiring = true) {
    return this.callAIService('/parse-resume', { resume_text: resumeText, job_description: jobDescription, blind_hiring: blindHiring });
  }

  async suggestCareerPath(employeeId: string, tenantId: string) {
    const emp = await this.userModel.findOne({ employee_id: employeeId, tenant_id: tenantId }).lean();
    if (!emp) return { error: 'Employee not found' };
    return this.callAIService('/career-path', { employee: emp });
  }

  getSetupGuide() {
    return {
      status: this.llmKey ? 'configured' : 'not_configured',
      model: 'gpt-4.1-mini (via Emergent LLM)',
      features: [
        'HR Chatbot - Natural language HR queries',
        'Attrition Risk Prediction - AI analysis of engagement patterns',
        'Sentiment Analysis - Analyze feedback & survey responses',
        'Resume Parser - Blind hiring with bias removal',
        'Career Path Suggestions - AI-driven L&D recommendations',
      ],
      python_ai_service: `Running at ${this.aiServiceUrl}`,
    };
  }
}
