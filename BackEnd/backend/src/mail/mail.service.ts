import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * SMTP mail delivery. When SMTP is not configured, `isConfigured()` is false and callers must
 * NOT claim that an e-mail was sent (password reset returns 503 in that case).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.smtp.configured;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const smtp = this.config.smtp;
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
        requireTLS: !smtp.secure && this.config.isProduction,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) throw new Error('SMTP is not configured');
    await this.getTransporter().sendMail({ from: this.config.smtp.from, ...message });
    this.logger.log(`E-mail "${message.subject}" accepted by SMTP server`);
  }

  async sendPasswordReset(to: string, fullName: string, link: string, expiresMinutes: number, lang: 'EN' | 'KM') {
    const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const en = {
      subject: 'Reset your ToiletGo KH password',
      text: `Hello ${fullName},\n\nWe received a request to reset your ToiletGo KH password.\nOpen this link within ${expiresMinutes} minutes to choose a new password:\n${link}\n\nIf you did not request this, you can ignore this e-mail.`,
    };
    const km = {
      subject: 'កំណត់ពាក្យសម្ងាត់ ToiletGo KH ឡើងវិញ',
      text: `សួស្តី ${fullName},\n\nយើងបានទទួលសំណើកំណត់ពាក្យសម្ងាត់ ToiletGo KH របស់អ្នកឡើងវិញ។\nសូមបើកតំណនេះក្នុងរយៈពេល ${expiresMinutes} នាទី ដើម្បីជ្រើសរើសពាក្យសម្ងាត់ថ្មី៖\n${link}\n\nប្រសិនបើអ្នកមិនបានស្នើសុំទេ សូមមិនអើពើអ៊ីមែលនេះ។`,
    };
    const body = lang === 'KM' ? `${km.text}\n\n---\n\n${en.text}` : en.text;
    await this.send({
      to,
      subject: lang === 'KM' ? km.subject : en.subject,
      text: body,
      html: `<pre style="font-family:Inter,'Noto Sans Khmer',sans-serif;white-space:pre-wrap">${escape(body)}</pre>`,
    });
  }
}
