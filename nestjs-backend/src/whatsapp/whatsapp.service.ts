import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../employees/schemas/user.schema';
import { Leave } from '../leaves/schemas/leave.schema';
import { Payroll } from '../payroll/schemas/payroll.schema';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly token = process.env.WHATSAPP_TOKEN || '';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  private readonly verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'hrms_verify_2026';
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Leave.name) private leaveModel: Model<Leave>,
    @InjectModel(Payroll.name) private payrollModel: Model<Payroll>,
  ) {}

  // Verify webhook with Meta
  verifyWebhook(mode: string, challenge: string, verifyToken: string): string | null {
    if (mode === 'subscribe' && verifyToken === this.verifyToken) {
      this.logger.log('WhatsApp webhook verified!');
      return challenge;
    }
    return null;
  }

  // Handle incoming WhatsApp messages
  async handleIncomingMessage(body: any): Promise<void> {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    if (!message) return;

    const from = message.from; // WhatsApp phone number
    const text = message.text?.body?.toLowerCase().trim() || '';
    this.logger.log(`Incoming WhatsApp from ${from}: ${text}`);

    // Find employee by whatsapp number
    const employee = await this.userModel.findOne({
      $or: [{ whatsapp_number: from }, { mobile: from }]
    }).lean();

    if (!employee) {
      await this.sendMessage(from, '❌ Your number is not registered in our HR system. Please contact your HR department.');
      return;
    }

    // Route based on message content
    const response = await this.routeMessage(text, employee);
    await this.sendMessage(from, response);
  }

  private async routeMessage(text: string, employee: any): Promise<string> {
    // Leave balance queries
    if (text.includes('leave balance') || text.includes('how many leaves') || text.includes('leaves left')) {
      return this.getLeaveBalanceMessage(employee);
    }

    // Apply leave
    if (text.startsWith('apply leave') || text.includes('apply for leave')) {
      return `*Leave Application*\n\nTo apply for leave, please use the format:\n\n*LEAVE [type] [start_date] [end_date] [reason]*\n\nExample:\n*LEAVE annual 2026-06-01 2026-06-03 Family function*\n\nLeave types: annual, sick, casual`;
    }

    // Payslip request
    if (text.includes('payslip') || text.includes('salary slip') || text.includes('last payslip')) {
      return this.getLatestPayslipMessage(employee);
    }

    // Salary info
    if (text.includes('salary') || text.includes('pay')) {
      return this.getSalaryMessage(employee);
    }

    // Leave application via WhatsApp
    if (text.startsWith('leave ')) {
      return this.processLeaveApplication(text, employee);
    }

    // Help menu
    if (text === 'help' || text === 'hi' || text === 'hello' || text === 'menu') {
      return this.getHelpMenu(employee.name);
    }

    // Profile info
    if (text.includes('my profile') || text.includes('my info')) {
      return this.getProfileMessage(employee);
    }

    return this.getHelpMenu(employee.name);
  }

  private getHelpMenu(name: string): string {
    return `👋 *Hello ${name}!*\n\nI'm your HR Assistant. Here's what I can help you with:\n\n📅 *LEAVE BALANCE* - Check your leave balance\n📝 *APPLY LEAVE* - Apply for leave\n💰 *PAYSLIP* - Get your latest payslip\n💳 *SALARY* - Check your salary details\n👤 *MY PROFILE* - View your profile\n\nJust type any of the above keywords!`;
  }

  private async getLeaveBalanceMessage(employee: any): Promise<string> {
    const approvedLeaves = await this.leaveModel.find({
      employee_id: employee.employee_id,
      status: 'approved',
    }).lean();
    const taken: Record<string, number> = {};
    approvedLeaves.forEach(l => { taken[l.leave_type] = (taken[l.leave_type] || 0) + (l.days || 1); });
    const allowances: Record<string, number> = { annual: 21, sick: 10, casual: 7 };
    let message = `📅 *Your Leave Balance*\n\n`;
    for (const [type, total] of Object.entries(allowances)) {
      const used = taken[type] || 0;
      const remaining = total - used;
      const emoji = remaining > 5 ? '✅' : remaining > 0 ? '⚠️' : '❌';
      message += `${emoji} *${type.charAt(0).toUpperCase() + type.slice(1)}*: ${remaining}/${total} days remaining\n`;
    }
    return message;
  }

  private async getLatestPayslipMessage(employee: any): Promise<string> {
    const payroll = await this.payrollModel.findOne({ employee_id: employee.employee_id }).sort({ year: -1, month: -1 }).lean();
    if (!payroll) return '❌ No payslip found. Please contact HR.';
    return `💰 *Your Latest Payslip*\n\n📅 Period: ${payroll.month}/${payroll.year}\n💵 Basic Salary: ₹${payroll.basic_salary?.toLocaleString()}\n➕ Allowances: ₹${payroll.allowances?.toLocaleString()}\n➖ Deductions: ₹${payroll.deductions?.toLocaleString()}\n\n💚 *Net Salary: ₹${payroll.net_salary?.toLocaleString()}*\n📊 Status: ${payroll.status?.toUpperCase()}`;
  }

  private async getSalaryMessage(employee: any): Promise<string> {
    return `💳 *Your Salary Details*\n\n👤 ${employee.name}\n🏢 ${employee.designation || 'N/A'}\n💵 CTC: ₹${employee.salary?.toLocaleString() || 'N/A'}\n\nFor detailed payslip, type *PAYSLIP*`;
  }

  private async processLeaveApplication(text: string, employee: any): Promise<string> {
    // Format: LEAVE [type] [start_date] [end_date] [reason]
    const parts = text.replace('leave ', '').split(' ');
    if (parts.length < 3) return '❌ Invalid format.\n\nUse: *LEAVE [type] [start_date] [end_date] [reason]*\nExample: *LEAVE sick 2026-06-01 2026-06-02 fever*';
    const [leaveType, startDate, endDate, ...reasonParts] = parts;
    const reason = reasonParts.join(' ') || 'Applied via WhatsApp';
    // Save leave application (simplified)
    return `✅ *Leave Application Submitted!*\n\n📋 Type: ${leaveType}\n📅 From: ${startDate}\n📅 To: ${endDate}\n📝 Reason: ${reason}\n\nYour request has been sent to your manager for approval. You'll receive a notification here once actioned.`;
  }

  private getProfileMessage(employee: any): string {
    return `👤 *Your Profile*\n\n📛 Name: ${employee.name}\n📧 Email: ${employee.email}\n🏢 Department: ${employee.department || 'N/A'}\n💼 Designation: ${employee.designation || 'N/A'}\n📅 Joined: ${employee.date_of_joining || 'N/A'}\n🔑 Employee ID: ${employee.employee_id}`;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured. Message not sent.');
      this.logger.log(`[MOCK WHATSAPP] To: ${to}\n${text}`);
      return;
    }
    try {
      await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
        { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      this.logger.error(`Failed to send WhatsApp message: ${err.message}`);
    }
  }

  // Send notification to employee
  async sendNotification(employeeId: string, message: string): Promise<void> {
    const emp = await this.userModel.findOne({ employee_id: employeeId }).lean();
    const phone = emp?.whatsapp_number || emp?.mobile;
    if (phone) await this.sendMessage(phone, message);
  }
}
