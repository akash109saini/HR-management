import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../employees/schemas/user.schema';
import { Leave } from '../leaves/schemas/leave.schema';
import { Attendance } from '../attendance/schemas/attendance.schema';
import { Announcement } from '../announcements/schemas/announcement.schema';
import { Payroll } from '../payroll/schemas/payroll.schema';
import { Credential } from '../blockchain/schemas/credential.schema';
import { Vectrion } from '@vectrion/core';
import { MultimodalGoogleProviderAdapter } from './custom-google-adapter';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// ─── Vectrion Structured Output Schemas ─────────────────────────────────────

const AttritionRiskSchema = z.object({
  risk_score: z.number().int().min(0).max(100),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  key_factors: z.array(z.string()),
  recommendations: z.array(z.string()),
  summary: z.string(),
});

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  score: z.number().min(-1.0).max(1.0),
  confidence: z.number().min(0.0).max(1.0),
  emotions: z.array(z.string()),
  key_themes: z.array(z.string()),
  summary: z.string(),
  action_needed: z.boolean(),
  recommended_action: z.string(),
});

const ResumeParserSchema = z.object({
  candidate_id: z.string(),
  blind_mode: z.boolean(),
  skills: z.array(z.string()),
  experience_years: z.number().nullable().optional(),
  education: z.array(z.object({
    degree: z.string(),
    field: z.string(),
    year: z.string()
  })),
  work_history: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string(),
    achievements: z.array(z.string())
  })),
  strengths: z.array(z.string()),
  job_fit_score: z.number().nullable().optional(),
  job_fit_reasons: z.array(z.string()),
  red_flags: z.array(z.string()),
  recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no']),
  summary: z.string()
});

const CareerPathSchema = z.object({
  current_role: z.string(),
  suggested_next_roles: z.array(z.string()),
  timeline: z.string(),
  required_skills: z.array(z.string()),
  recommended_courses: z.array(z.object({
    name: z.string(),
    platform: z.string(),
    duration: z.string(),
    priority: z.enum(['high', 'medium', 'low'])
  })),
  certifications: z.array(z.string()),
  mentorship_suggestions: z.array(z.string()),
  strengths_to_leverage: z.array(z.string()),
  gaps_to_address: z.array(z.string()),
  career_summary: z.string()
});

function robustParseJSON<T>(text: string, schema: z.Schema<T>): T {
  const cleaned = text.trim();
  
  // Try extracting from ```json ... ``` code block first
  const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = cleaned.match(codeBlockRegex);
  let jsonStr = '';
  if (match && match[1]) {
    jsonStr = match[1].trim();
  } else {
    // Fallback to finding first { and last }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON object found in response text. Raw text: "${text}"`);
    }
    jsonStr = cleaned.substring(start, end + 1);
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (err) {
    throw new Error(`Failed to parse JSON string: "${jsonStr}". Error: ${err.message}. Raw text: "${text}"`);
  }
}

class ModelFallbackRouter {
  async routeAndExecute(ctx: any, providers: Map<string, any>, options?: any) {
    const originalModel = ctx.request.model;
    // Fallback chain: try each model in sequence until one works
    // All are separate free-tier quotas (20 req/day per model)
    const modelsToTry: string[] = [];
    if (!modelsToTry.includes(originalModel)) {
      modelsToTry.push(originalModel);
    }
    const fallbacks = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-flash-latest',
    ];
    for (const m of fallbacks) {
      if (!modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }

    let lastError: any;
    for (const model of modelsToTry) {
      ctx.request.model = model;
      for (const [id, provider] of providers.entries()) {
        try {
          const startTime = Date.now();
          const response = await provider.execute(ctx, options);
          response.latencyMs = Date.now() - startTime;
          console.log(`[Vectrion Router] Successfully served with model: ${model}`);
          return response;
        } catch (err) {
          lastError = err;
          console.warn(`[Vectrion Router] Model ${model} on provider ${id} failed: ${err.message?.substring(0, 120)}. Trying next fallback...`);
        }
      }
    }
    throw lastError;
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly vectrionClient: Vectrion;
  private readonly chatHistories = new Map<string, string[]>();

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(Announcement.name) private announcementModel: Model<Announcement>,
    @InjectModel(Payroll.name) private payrollModel: Model<Payroll>,
    @InjectModel(Credential.name) private credentialModel: Model<Credential>,
  ) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not defined in the environment variables.');
    }
    this.vectrionClient = new Vectrion({
      providers: [new MultimodalGoogleProviderAdapter({ apiKey })],
      router: new ModelFallbackRouter() as any,
    });
  }

  async chat(message: string, user: any, sessionId?: string, files?: any[]) {
    try {
      const emp = (await this.userModel.findOne({ employee_id: user.employee_id || user.id }).lean()) as any;
      const empId = user.employee_id || user.id;

      // Calculate leave balances
      const allowances = { annual: 21, sick: 10, casual: 7 };
      const approvedLeaves = await this.leaveModel.find({
        employee_id: empId,
        status: 'approved'
      }).lean();
      
      const taken: Record<string, number> = {};
      for (const lv of approvedLeaves) {
        const lt = lv.leave_type || '';
        taken[lt] = (taken[lt] || 0) + (lv.days || 1);
      }
      
      const leaveBalance = {
        annual: allowances.annual - (taken['annual'] || 0),
        sick: allowances.sick - (taken['sick'] || 0),
        casual: allowances.casual - (taken['casual'] || 0),
      };

      const leaves = await this.leaveModel.find({ employee_id: empId }).sort({ start_date: -1 }).limit(10).lean();
      const attendance = await this.attendanceModel.find({ employee_id: empId }).sort({ date: -1 }).limit(10).lean();
      const payroll = await this.payrollModel.find({ employee_id: empId }).sort({ year: -1, month: -1 }).limit(3).lean();
      const credentials = await this.credentialModel.find({ employee_id: empId }).lean();

      // Load active tenant announcements
      const announcements = await this.announcementModel.find({ tenant_id: user.tenant_id, is_active: true }).lean();

      // Setup HR/Admin context if applicable
      const isHrOrAdmin = ['super_admin', 'hr_manager'].includes(user.role);
      let employeesDirectory: any[] = [];
      let targetEmployeeContext = '';

      if (isHrOrAdmin) {
        const allEmployees = await this.userModel.find({ tenant_id: user.tenant_id }).lean();
        employeesDirectory = allEmployees.map((e: any) => ({
          employee_id: e.employee_id,
          name: e.name,
          department: e.department,
          designation: e.designation,
          status: e.status
        }));

        // Search message for mentioned employee name or ID
        let targetEmp: any = null;
        const messageLower = message.toLowerCase();
        for (const empDoc of allEmployees) {
          const nameLower = empDoc.name.toLowerCase();
          const idLower = empDoc.employee_id.toLowerCase();
          const nameParts = nameLower.split(' ').filter(part => part.length > 2 && !['department', 'manager', 'employee', 'admin', 'user'].includes(part));
          const matchesNamePart = nameParts.some(part => messageLower.includes(part));
          
          if (messageLower.includes(idLower) || messageLower.includes(nameLower) || (nameParts.length > 0 && matchesNamePart)) {
            targetEmp = empDoc;
            break;
          }
        }

        if (targetEmp) {
          const targetLeaves = await this.leaveModel.find({ employee_id: targetEmp.employee_id }).sort({ start_date: -1 }).limit(10).lean();
          const targetAttendance = await this.attendanceModel.find({ employee_id: targetEmp.employee_id }).sort({ date: -1 }).limit(10).lean();
          const targetPayroll = await this.payrollModel.find({ employee_id: targetEmp.employee_id }).sort({ year: -1, month: -1 }).limit(3).lean();
          const targetCredentials = await this.credentialModel.find({ employee_id: targetEmp.employee_id }).lean();

          targetEmployeeContext = `
TARGET EMPLOYEE CONTEXT (The user is asking about this employee):
- Employee ID: ${targetEmp.employee_id}
- Name: ${targetEmp.name}
- Department: ${targetEmp.department || 'N/A'}
- Designation: ${targetEmp.designation || 'N/A'}
- Joined: ${targetEmp.date_of_joining || 'N/A'}
- Status: ${targetEmp.status}
- Salary: ₹${targetEmp.salary || 'N/A'}
- Attrition Risk Score: ${targetEmp.attrition_risk_score}
- Leave Balance: (Annual=21, Sick=10, Casual=7)
- Leaves: ${JSON.stringify(targetLeaves.map((l: any) => ({ type: l.leave_type, days: l.days, status: l.status, dates: `${l.start_date} to ${l.end_date}` })))}
- Recent Attendance (last 30 records): ${JSON.stringify(targetAttendance.map((a: any) => ({ date: a.date, status: a.status, in: a.check_in, out: a.check_out })))}
- Recent Payroll: ${JSON.stringify(targetPayroll.map((p: any) => ({ month: p.month, year: p.year, basic: p.basic_salary, allowances: p.allowances, deductions: p.deductions, net: p.net_salary, status: p.status })))}
- Blockchain Credentials: ${JSON.stringify(targetCredentials.map((c: any) => ({ title: c.title, type: c.type, issuer: c.issuer, blockchain_status: c.blockchain_status, tx_hash: c.tx_hash })))}
`;
        }
      }

      // Compile database context info
      let contextInfo = `
LOGGED-IN USER CONTEXT:
- Name: ${emp ? emp.name : 'Unknown'}
- Employee ID: ${empId}
- Role: ${user.role}
- Department: ${emp ? emp.department : 'N/A'}
- Designation: ${emp ? emp.designation : 'N/A'}
- Shift: ${emp ? emp.shift : 'N/A'}
- Salary: ₹${emp ? emp.salary : 'N/A'}
- Status: ${emp ? emp.status : 'N/A'}
- Leave Balances: Annual=${leaveBalance.annual}, Sick=${leaveBalance.sick}, Casual=${leaveBalance.casual} days remaining
- My Leave Applications: ${JSON.stringify(leaves.map((l: any) => ({ type: l.leave_type, days: l.days, status: l.status, dates: `${l.start_date} to ${l.end_date}`, reason: l.reason })))}
- My Recent Attendance (last 30 records): ${JSON.stringify(attendance.map((a: any) => ({ date: a.date, status: a.status, in: a.check_in, out: a.check_out })))}
- My Recent Payroll: ${JSON.stringify(payroll.map((p: any) => ({ month: p.month, year: p.year, basic: p.basic_salary, allowances: p.allowances, deductions: p.deductions, net: p.net_salary, status: p.status })))}
- My Blockchain Credentials: ${JSON.stringify(credentials.map((c: any) => ({ title: c.title, type: c.type, issuer: c.issuer, blockchain_status: c.blockchain_status, tx_hash: c.tx_hash })))}
`;

      if (announcements.length > 0) {
        contextInfo += `
COMPANY ANNOUNCEMENTS:
${JSON.stringify(announcements.map(a => ({ title: a.title, content: a.content, category: a.category, date: a.created_at, author: a.author })))}
`;
      }

      if (isHrOrAdmin) {
        contextInfo += `
COMPANY EMPLOYEES DIRECTORY:
${JSON.stringify(employeesDirectory)}
`;
        if (targetEmployeeContext) {
          contextInfo += targetEmployeeContext;
        }
      }

      const systemInstruction = `You are the AI HR Assistant. You must answer the user's questions directly and concisely using the provided database context.
Do NOT repeat the instructions or context. Do NOT echo the prompt. Keep the answer short, crisp, and to the point. Use markdown tables for lists.

DATABASE CONTEXT:
${contextInfo}`;

      const sId = sessionId || `chat_${user.employee_id || user.id}_${Date.now()}`;
      const history = this.chatHistories.get(sId) || [];
      
      let promptWithFiles = message;
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.data && file.type) {
            promptWithFiles += `\n<file mime="${file.type}" data="${file.data}"/>`;
          }
        }
      }

      let fullPrompt = `INSTRUCTIONS:\n${systemInstruction}\n\n`;
      if (history.length > 0) {
        fullPrompt += `Conversation History:\n`;
        for (const line of history) {
          fullPrompt += `${line}\n`;
        }
        fullPrompt += `\n`;
      }
      fullPrompt += `User: ${promptWithFiles}\nDirect Answer (short, crisp and direct):`;

      const result = await this.vectrionClient.generate({
        model: 'gemini-2.5-flash',
        prompt: fullPrompt,
      });

      let responseText = result.data.trim();
      if (responseText.startsWith('Assistant:')) {
        responseText = responseText.substring('Assistant:'.length).trim();
      }
      if (responseText.startsWith('Direct Answer (short, crisp and direct):')) {
        responseText = responseText.substring('Direct Answer (short, crisp and direct):'.length).trim();
      }
      
      history.push(`User: ${message}${files && files.length > 0 ? ' (with attached files)' : ''}`);
      history.push(`Assistant: ${responseText}`);
      this.chatHistories.set(sId, history);

      return {
        response: responseText,
        session_id: sId,
        model: 'gemini-2.5-flash',
        provider: 'Google Gemini (Vectrion)',
      };
    } catch (err) {
      this.logger.error(`Vectrion Chat failed: ${err.message}`, err.stack);
      throw new HttpException(`Vectrion generation failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async predictAttritionRisk(employeeId: string, tenantId: string) {
    try {
      const emp = (await this.userModel.findOne({ employee_id: employeeId }).lean()) as any;
      if (!emp) {
        throw new HttpException('Employee not found', HttpStatus.NOT_FOUND);
      }
      
      const leaves = await this.leaveModel.countDocuments({ employee_id: employeeId });
      const attendance = await this.attendanceModel.find({ employee_id: employeeId }).sort({ date: -1 }).limit(60).lean();

      const absentCount = attendance.filter((a: any) => a.status === 'absent').length;
      const lateCount = attendance.filter((a: any) => ['half day', 'late'].includes(a.status)).length;

      const prompt = `You are an expert HR analytics AI. Analyze the attrition risk for this employee.

Employee Profile:
- Name: ${emp.name}
- Designation: ${emp.designation || 'N/A'}
- Department: ${emp.department || 'N/A'}
- Joined: ${emp.joining_date || emp.date_of_joining || 'N/A'}
- Status: ${emp.status || 'active'}
- Salary: ₹${emp.salary || 'N/A'}

Behavioral Metrics (last 60 days):
- Total leave applications: ${leaves}
- Absent days: ${absentCount}
- Late / half-day arrivals: ${lateCount}
- Attendance records analyzed: ${attendance.length}

You must return a structured JSON object matching this schema exactly:
{
  "risk_score": <integer 0-100>,
  "risk_level": "low" | "medium" | "high" | "critical",
  "key_factors": ["string", "string", ...],
  "recommendations": ["string", "string", ...],
  "summary": "string"
}
Ensure all keys are present and types match exactly.

IMPORTANT: Do not output any markdown formatting, bullet points, introductions, explanations, or reasoning. Output ONLY the JSON block. Ensure that all string values in the JSON object use only single quotes for internal quotes, or escape any internal double quotes with a backslash (\\"). Never output raw unescaped double quotes inside a string value. Any text other than the JSON block is invalid and will crash the system.`;

      const result = await this.vectrionClient.generate({
        model: 'gemini-2.5-flash',
        prompt: prompt,
        schema: AttritionRiskSchema as any,
      });

      const parsedData = result.data;

      if (parsedData && parsedData.risk_score !== undefined) {
        await this.userModel.updateOne(
          { employee_id: employeeId },
          { $set: { attrition_risk_score: parsedData.risk_score } }
        );
      }

      return {
        ...parsedData,
        employee_id: employeeId,
        employee_name: emp.name,
        analyzed_at: new Date().toISOString(),
        model: 'gemini-2.5-flash',
      };
    } catch (err) {
      this.logger.error(`Vectrion Attrition Risk Analysis failed: ${err.message}`);
      throw new HttpException(`Vectrion Attrition Analysis failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async analyzeSentiment(text: string, context?: string) {
    try {
      const prompt = `Analyze the sentiment of this employee text.
Context: ${context || 'HR feedback'}
Text: "${text}"

You must return a structured JSON object matching this schema exactly:
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": <float -1.0 to 1.0>,
  "confidence": <float 0.0 to 1.0>,
  "emotions": ["string", "string", ...],
  "key_themes": ["string", "string", ...],
  "summary": "string",
  "action_needed": <boolean>,
  "recommended_action": "string"
}
Ensure all keys are present and types match exactly.

IMPORTANT: Do not output any markdown formatting, bullet points, introductions, explanations, or reasoning. Output ONLY the JSON block. Ensure that all string values in the JSON object use only single quotes for internal quotes, or escape any internal double quotes with a backslash (\\"). Never output raw unescaped double quotes inside a string value. Any text other than the JSON block is invalid and will crash the system.`;

      const result = await this.vectrionClient.generate({
        model: 'gemini-2.5-flash',
        prompt: prompt,
        schema: SentimentSchema as any,
      });

      const parsedData = result.data;

      return {
        ...parsedData,
        analyzed_at: new Date().toISOString(),
        model: 'gemini-2.5-flash',
      };
    } catch (err) {
      this.logger.error(`Vectrion Sentiment Analysis failed: ${err.message}`);
      throw new HttpException(`Vectrion Sentiment Analysis failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async parseResume(resumeText: string, jobDescription?: string, blindHiring = true) {
    try {
      const blindInstructions = blindHiring
        ? `BLIND HIRING MODE: Remove all PII — replace candidate name with "Candidate A", remove photos, age, gender, marital status, nationality, and address. Keep all skills, experience, education, and achievements.`
        : '';

      const jobContext = jobDescription ? `\n\nJob Description:\n${jobDescription}` : '';
      const candId = `CAND-${uuidv4().substring(0, 8).toUpperCase()}`;

      const prompt = `Parse this resume and extract structured information. ${blindInstructions}${jobContext}

Resume:
${resumeText}

You must return a structured JSON object matching this schema exactly:
{
  "candidate_id": "${candId}",
  "blind_mode": ${blindHiring},
  "skills": ["string", "string", ...],
  "experience_years": <number or null>,
  "education": [{"degree": "string", "field": "string", "year": "string"}],
  "work_history": [{"title": "string", "company": "string", "duration": "string", "achievements": ["string", ...]}],
  "strengths": ["string", "string", ...],
  "job_fit_score": <number 0-100 or null>,
  "job_fit_reasons": ["string", "string", ...],
  "red_flags": ["string", ...],
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "summary": "string"
}
Ensure all keys are present and types match exactly.

IMPORTANT: Do not output any markdown formatting, bullet points, introductions, explanations, or reasoning. Output ONLY the JSON block. Ensure that all string values in the JSON object use only single quotes for internal quotes, or escape any internal double quotes with a backslash (\\"). Never output raw unescaped double quotes inside a string value. Any text other than the JSON block is invalid and will crash the system.`;

      const result = await this.vectrionClient.generate({
        model: 'gemini-2.5-flash',
        prompt: prompt,
        schema: ResumeParserSchema as any,
      });

      const parsedData = result.data;

      return {
        ...parsedData,
        candidate_id: candId,
        blind_mode: blindHiring,
        parsed_at: new Date().toISOString(),
        model: 'gemini-2.5-flash',
      };
    } catch (err) {
      this.logger.error(`Vectrion Resume Parsing failed: ${err.message}`);
      throw new HttpException(`Vectrion Resume Parsing failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async suggestCareerPath(employeeId: string, tenantId: string) {
    try {
      const emp = (await this.userModel.findOne({ employee_id: employeeId }).lean()) as any;
      if (!emp) {
        throw new HttpException('Employee not found', HttpStatus.NOT_FOUND);
      }

      const prompt = `Suggest a personalized career development path for this employee.

Profile:
- Name: ${emp.name}
- Current Role: ${emp.designation || 'N/A'}
- Department: ${emp.department || 'N/A'}
- Joined: ${emp.joining_date || emp.date_of_joining || 'N/A'}

You must return a structured JSON object matching this schema exactly:
{
  "current_role": "string",
  "suggested_next_roles": ["string", "string", ...],
  "timeline": "string",
  "required_skills": ["string", "string", ...],
  "recommended_courses": [{"name": "string", "platform": "string", "duration": "string", "priority": "high" | "medium" | "low"}],
  "certifications": ["string", "string", ...],
  "mentorship_suggestions": ["string", ...],
  "strengths_to_leverage": ["string", ...],
  "gaps_to_address": ["string", ...],
  "career_summary": "string"
}
Ensure all keys are present and types match exactly.

IMPORTANT: Do not output any markdown formatting, bullet points, introductions, explanations, or reasoning. Output ONLY the JSON block. Ensure that all string values in the JSON object use only single quotes for internal quotes, or escape any internal double quotes with a backslash (\\"). Never output raw unescaped double quotes inside a string value. Any text other than the JSON block is invalid and will crash the system.`;

      const result = await this.vectrionClient.generate({
        model: 'gemini-2.5-flash',
        prompt: prompt,
        schema: CareerPathSchema as any,
      });

      const parsedData = result.data;

      return {
        ...parsedData,
        employee_id: employeeId,
        generated_at: new Date().toISOString(),
        model: 'gemini-2.5-flash',
      };
    } catch (err) {
      this.logger.error(`Vectrion Career Path Suggestions failed: ${err.message}`);
      throw new HttpException(`Vectrion Career Path Suggestions failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  getSetupGuide() {
    return {
      status: process.env.GEMINI_API_KEY ? 'configured' : 'not_configured',
      model: 'gemini-2.5-flash (via Vectrion)',
      features: [
        'HR Chatbot - Natural language HR queries',
        'Attrition Risk Prediction - AI analysis of engagement patterns',
        'Sentiment Analysis - Analyze feedback & survey responses',
        'Resume Parser - Blind hiring with bias removal',
        'Career Path Suggestions - AI-driven L&D recommendations',
      ],
      backend_server: 'Running NestJS with Vectrion infrastructure SDK',
    };
  }
}
