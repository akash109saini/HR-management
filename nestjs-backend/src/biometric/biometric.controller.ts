import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BiometricService } from './biometric.service';

@ApiTags('biometric')
@Controller('biometric')
export class BiometricController {
  constructor(
    private readonly biometricService: BiometricService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private get validToken(): string {
    return process.env.BIOMETRIC_AUTH_TOKEN || 'realtime_t304f_auth_token_2026';
  }

  /**
   * GET /api/biometric/punches
   * Fetch latest punch records (no auth required for local use)
   */
  @Get('punches')
  @ApiOperation({ summary: 'Fetch latest biometric punches from local DB' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of past days (default: 30)' })
  @ApiQuery({ name: 'device_sn', required: false })
  @ApiQuery({ name: 'employee_name', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max records (default: 200)' })
  async getPunches(@Query() query: any) {
    const punches = await this.biometricService.getLatestPunches({
      days: query.days ? parseInt(query.days) : 30,
      device_sn: query.device_sn,
      employee_name: query.employee_name,
      limit: query.limit ? parseInt(query.limit) : 200,
    });
    return { success: true, count: punches.length, source: 'mongodb_local', punches };
  }

  /**
   * GET /api/biometric/summary
   * Summary stats: total punches, matched, devices, punches per day
   */
  @Get('summary')
  @ApiOperation({ summary: 'Get biometric punch summary stats' })
  async getSummary() {
    const summary = await this.biometricService.getSummary();
    return { success: true, ...summary };
  }

  /**
   * POST /api/biometric/push
   * Receive punch from biometric device. Matches employee, creates attendance.
   * Auth: x-biometric-token header OR Authorization: Bearer <token>
   */
  @Post('push')
  @ApiOperation({ summary: 'Receive punch from biometric device (local webhook)' })
  async receivePunch(
    @Headers('x-biometric-token') xToken: string,
    @Headers('authorization') authHeader: string,
    @Body() body: any,
  ) {
    // Accept both header formats
    let token = xToken;
    if (!token && authHeader) {
      token = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7)
        : authHeader;
    }

    if (!token || token.trim() !== this.validToken) {
      throw new UnauthorizedException('Invalid or missing biometric auth token');
    }

    // Accept both single record and array
    const records: any[] = Array.isArray(body) ? body : [body];
    const results: any[] = [];

    for (const record of records) {
      if (record.SerialNo && record.EmployeeCode && record.PunchDateAndTime) {
        try {
          const result = await this.biometricService.receivePunch(record, this.connection);
          results.push(result);
        } catch (err) {
          results.push({ success: false, error: String(err.message), record });
        }
      }
    }

    return {
      success: true,
      processed_records: results.filter((r) => r.success).length,
      failed_records: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * POST /api/biometric/rematch
   * Re-match all unmatched punches against current employee biometric pins.
   * Call after setting biometric_pin on employees.
   */
  @Post('rematch')
  @ApiOperation({ summary: 'Re-match unmatched punches to employees and create attendance records' })
  async rematchUnmatched(
    @Headers('x-biometric-token') xToken: string,
    @Headers('authorization') authHeader: string,
  ) {
    let token = xToken;
    if (!token && authHeader) {
      token = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7)
        : authHeader;
    }

    if (!token || token.trim() !== this.validToken) {
      throw new UnauthorizedException('Invalid or missing biometric auth token');
    }

    try {
      const result = await this.biometricService.rematchUnmatched(this.connection);
      return {
        success: true,
        message: `Re-matched ${result.fixed} punch(es). Still unmatched: ${result.still_unmatched}`,
        ...result,
      };
    } catch (err) {
      throw new InternalServerErrorException(err.message);
    }
  }
}
