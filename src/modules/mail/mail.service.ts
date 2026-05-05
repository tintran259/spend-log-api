import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { OtpPurpose } from '../auth/entities/otp-code.entity';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error('MAIL_USER and MAIL_APP_PASSWORD are required');

    this.from = `Spend Log <${user}>`;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    // Verify SMTP connection at startup
    this.transporter.verify().then(() => {
      this.logger.log('SMTP connection verified ✓');
    }).catch((err: Error) => {
      this.logger.error(`SMTP connection failed: ${err.message}`);
    });
  }

  async sendOtp(to: string, otp: string, purpose: OtpPurpose): Promise<void> {
    const isVerify = purpose === OtpPurpose.VERIFY_EMAIL;
    const subject = isVerify
      ? '🔐 Mã xác thực tài khoản Spend Log'
      : '🔑 Đặt lại mật khẩu Spend Log';

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: buildOtpEmail(otp, purpose),
      });
    } catch (err) {
      this.logger.error('Failed to send OTP email', err);
      throw new InternalServerErrorException('Không thể gửi email, vui lòng thử lại.');
    }
  }
}

// ─── Template ────────────────────────────────────────────────────────────────

function buildOtpEmail(otp: string, purpose: OtpPurpose): string {
  const isVerify = purpose === OtpPurpose.VERIFY_EMAIL;

  const title    = isVerify ? 'Xác thực email của bạn' : 'Đặt lại mật khẩu';
  const subtitle = isVerify
    ? 'Bạn vừa đăng ký tài khoản Spend Log. Nhập mã bên dưới để hoàn tất.'
    : 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.';

  const digits = otp.split('').map(d => `
    <td style="width:48px;height:56px;background:#F5F3FF;border:2px solid #DDD6FE;
               border-radius:12px;text-align:center;vertical-align:middle;
               font-size:28px;font-weight:800;color:#7C3AED;
               font-family:'Courier New',monospace;letter-spacing:0;">
      ${d}
    </td>
    <td style="width:8px;"></td>`).join('');

  const badgeColor = isVerify ? '#7C3AED' : '#DC2626';
  const badgeBg    = isVerify ? '#EDE9FE' : '#FEE2E2';
  const badgeText  = isVerify ? 'Xác thực tài khoản' : 'Đặt lại mật khẩu';
  const badgeIcon  = isVerify ? '✦' : '🔑';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F5F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3FF;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);border-radius:20px;padding:16px 28px;">
                <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">✦ Spend Log</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <tr>
          <td style="background:#fff;border-radius:24px;box-shadow:0 4px 32px rgba(109,40,217,0.10);overflow:hidden;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:linear-gradient(90deg,#7C3AED,#8B5CF6,#6D28D9);height:4px;"></td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:40px 40px 32px;">

                <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr>
                  <td style="background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;
                             letter-spacing:0.5px;padding:6px 14px;border-radius:100px;">
                    ${badgeIcon} ${badgeText.toUpperCase()}
                  </td>
                </tr></table>

                <p style="margin:0 0 10px;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.5px;">${title}</p>
                <p style="margin:0 0 36px;font-size:15px;color:#6B7280;line-height:1.6;">${subtitle}</p>

                <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                  <tr>${digits}</tr>
                </table>

                <p style="text-align:center;margin:0 0 36px;font-size:13px;color:#9CA3AF;">
                  ⏱ Mã có hiệu lực trong <strong style="color:#374151;">5 phút</strong>
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr><td style="border-top:1px solid #F3F4F6;"></td></tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
                      <strong>⚠️ Lưu ý bảo mật:</strong> Spend Log sẽ không bao giờ hỏi mã OTP qua điện thoại hay bất kỳ kênh nào. Không chia sẻ mã này với ai.
                    </p>
                  </td>
                </tr></table>

              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#FAFAFA;border-top:1px solid #F3F4F6;padding:24px 40px;">
                <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                  Bạn nhận được email này vì có yêu cầu liên quan đến tài khoản Spend Log.<br/>
                  Nếu không phải bạn, hãy bỏ qua email này — tài khoản vẫn an toàn.
                </p>
              </td>
            </tr></table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding-top:28px;">
            <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">© 2026 Spend Log · All rights reserved</p>
            <p style="margin:0;font-size:12px;color:#C4B5FD;">Ghi lại khoảnh khắc. Kiểm soát chi tiêu.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
