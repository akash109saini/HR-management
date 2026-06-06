import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BiometricPunch } from './schemas/biometric-punch.schema';

@Injectable()
export class BiometricService {
  constructor(
    @InjectModel(BiometricPunch.name)
    private punchModel: Model<BiometricPunch>,
  ) {}

  /**
   * Normalize a biometric pin by stripping leading zeros.
   * "00000001" → "1", "1" → "1", "00000002" → "2"
   * But also try the zero-padded form for matching (both ways).
   */
  private normalizePins(rawPin: string): string[] {
    const stripped = rawPin.replace(/^0+/, '') || '0';
    const padded8 = rawPin.padStart(8, '0');
    // Return all variants to try
    return [...new Set([rawPin, stripped, padded8])];
  }

  /**
   * Fetch latest punch records from MongoDB.
   */
  async getLatestPunches(params: {
    days?: number;
    device_sn?: string;
    employee_name?: string;
    limit?: number;
  }) {
    const { days, device_sn, employee_name, limit = 200 } = params;
    const filter: any = {};

    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filter.received_at = { $gte: cutoff.toISOString() };
    }
    if (device_sn) filter.device_sn = { $regex: device_sn, $options: 'i' };
    if (employee_name) filter.employee_name = { $regex: employee_name, $options: 'i' };

    try {
      return await this.punchModel
        .find(filter)
        .sort({ received_at: -1 })
        .limit(Number(limit) || 200)
        .lean();
    } catch (error) {
      throw new InternalServerErrorException('Error fetching punch records');
    }
  }

  /**
   * Get summary stats for punch data.
   */
  async getSummary() {
    const total = await this.punchModel.countDocuments();
    const matched = await this.punchModel.countDocuments({ matched: true });
    const unmatched = total - matched;
    const devices = await this.punchModel.distinct('device_sn');

    const latest = await this.punchModel
      .findOne({})
      .sort({ received_at: -1 })
      .select('timestamp device_sn employee_name user_pin status')
      .lean();

    const last10Days: Record<string, number> = {};
    const today = new Date();
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = await this.punchModel.countDocuments({
        timestamp: { $regex: `^${dateStr}` },
      });
      last10Days[dateStr] = count;
    }

    return { total, matched, unmatched, devices, latest_punch: latest, punches_per_day: last10Days };
  }

  /**
   * Receive a punch from biometric device, match to employee, create attendance.
   * This is the LOCAL push endpoint — saves to MongoDB.
   */
  async receivePunch(
    data: {
      SerialNo: string;
      EmployeeCode: string;
      PunchDateAndTime: string;
      PunchMode?: string;
      Direction?: string;
    },
    db: any, // raw mongoose connection to query users & attendances
  ) {
    const { randomUUID } = await import('crypto');

    const rawPin = String(data.EmployeeCode || '').trim();
    const pinVariants = this.normalizePins(rawPin);
    const punchTimestamp = data.PunchDateAndTime;
    const isCheckOut = (data.Direction || 'in').toLowerCase().includes('out');
    const status = isCheckOut ? 'check_out' : 'check_in';

    // Try to match employee by biometric_pin (all variants)
    const User = db.model('User');
    let employee: any = null;
    for (const pin of pinVariants) {
      employee = await User.findOne({ biometric_pin: pin }).lean();
      if (employee) break;
    }

    const doc = new this.punchModel({
      punch_id: randomUUID(),
      device_sn: data.SerialNo,
      device_name: `Realtime Device ${data.SerialNo}`,
      tenant_id: employee?.tenant_id || null,
      user_pin: rawPin.padStart(8, '0'), // always store as 8-digit padded
      employee_id: employee?.employee_id || null,
      employee_name: employee?.name || null,
      timestamp: punchTimestamp,
      status,
      verify_mode: data.PunchMode || 'unknown',
      source: 'local_push',
      matched: !!employee,
      received_at: new Date().toISOString(),
    });

    await doc.save();

    // Auto-create or update attendance record if employee matched
    if (employee) {
      await this.upsertAttendance(
        db,
        employee,
        punchTimestamp,
        status,
        data.SerialNo,
        doc.punch_id,
      );
    }

    return {
      success: true,
      punch_id: doc.punch_id,
      matched: !!employee,
      employee_name: employee?.name || null,
    };
  }

  /**
   * Upsert attendance record from a biometric punch.
   */
  private async upsertAttendance(
    db: any,
    employee: any,
    punchTimestamp: string,
    status: string,
    deviceSn: string,
    punchId: string,
  ) {
    const { randomUUID } = await import('crypto');
    const Attendance = db.model('Attendance');

    // Parse punch time (stored as "YYYY-MM-DD HH:MM:SS" in IST)
    const punchDate = punchTimestamp.substring(0, 10);
    const clockISO = new Date(punchTimestamp.replace(' ', 'T') + '+05:30').toISOString();

    let att = await Attendance.findOne({
      employee_id: employee.employee_id,
      date: punchDate,
    });

    if (!att) {
      // Create new attendance record
      att = new Attendance({
        attendance_id: randomUUID(),
        employee_id: employee.employee_id,
        tenant_id: employee.tenant_id || null,
        date: punchDate,
        clock_in: status === 'check_in' ? clockISO : null,
        clock_out: status === 'check_out' ? clockISO : null,
        hours_worked: 0,
        status: 'present',
        source: 'biometric',
        device_sn: deviceSn,
        created_at: new Date().toISOString(),
      });
      await att.save();
    } else {
      // Update existing
      if (status === 'check_in' && !att.clock_in) {
        att.clock_in = clockISO;
      } else if (status === 'check_out') {
        // Update clock_out if this punch is later
        if (!att.clock_out || clockISO > att.clock_out) {
          att.clock_out = clockISO;
        }
      }
      // Recalculate hours
      if (att.clock_in && att.clock_out) {
        att.hours_worked = Math.abs(
          Math.round(
            (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 36000,
          ) / 100,
        );
      }
      att.source = 'biometric';
      att.device_sn = deviceSn;
      await att.save();
    }
  }

  /**
   * Re-match all unmatched punches against current employee list.
   * Call this after setting biometric_pin on employees.
   */
  async rematchUnmatched(db: any): Promise<{ fixed: number; still_unmatched: number }> {
    const User = db.model('User');
    const unmatched = await this.punchModel.find({ matched: false }).lean();
    let fixed = 0;

    for (const punch of unmatched) {
      const pinVariants = this.normalizePins(punch.user_pin);
      let employee: any = null;

      for (const pin of pinVariants) {
        employee = await User.findOne({ biometric_pin: pin }).lean();
        if (employee) break;
      }

      if (employee) {
        await this.punchModel.updateOne(
          { _id: punch._id },
          {
            $set: {
              employee_id: employee.employee_id,
              employee_name: employee.name,
              tenant_id: employee.tenant_id,
              user_pin: punch.user_pin.padStart(8, '0'),
              matched: true,
            },
          },
        );
        // Also upsert attendance
        await this.upsertAttendance(
          db,
          employee,
          punch.timestamp,
          punch.status,
          punch.device_sn,
          punch.punch_id,
        );
        fixed++;
      }
    }

    const stillUnmatched = await this.punchModel.countDocuments({ matched: false });
    return { fixed, still_unmatched: stillUnmatched };
  }
}
