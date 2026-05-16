import { Controller, Get, Post, Body, Query, Res, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('webhook')
  @ApiOperation({ summary: 'Meta webhook verification' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
    @Res() res: Response,
  ) {
    const result = this.whatsappService.verifyWebhook(mode, challenge, verifyToken);
    if (result) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive incoming WhatsApp messages' })
  async receiveMessage(@Body() body: any) {
    this.logger.log('Received WhatsApp webhook event');
    await this.whatsappService.handleIncomingMessage(body);
    return 'EVENT_RECEIVED';
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a WhatsApp message (test endpoint)' })
  async sendMessage(@Body() body: { to: string; message: string }) {
    await this.whatsappService.sendMessage(body.to, body.message);
    return { message: 'Message sent (or logged if credentials not configured)' };
  }

  @Get('setup-guide')
  @ApiOperation({ summary: 'Get WhatsApp setup instructions' })
  getSetupGuide() {
    return {
      status: process.env.WHATSAPP_TOKEN ? 'configured' : 'not_configured',
      setup_steps: [
        '1. Go to https://developers.facebook.com/apps',
        '2. Create a New App → Choose Business type',
        '3. Add WhatsApp product to your app',
        '4. In WhatsApp > Getting Started, copy the Access Token',
        '5. Copy the Phone Number ID',
        '6. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
        '7. Configure webhook URL: https://your-domain.com/api/whatsapp/webhook',
        '8. Set WHATSAPP_VERIFY_TOKEN to match your webhook verify token',
        'Free tier: 1,000 conversations/month on Meta Cloud API',
      ],
    };
  }
}
