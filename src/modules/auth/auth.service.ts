import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OtpCode, OtpPurpose } from './entities/otp-code.entity';
import { User } from '../user/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { FacebookAuthDto } from './dto/facebook-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const BCRYPT_ROUNDS = 10;
const OTP_EXPIRES_MIN = 5;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) { }

  // ─── Register ────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });

    // Already verified → hard conflict
    if (existing?.isEmailVerified) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const otp = this.generateOtp();
    const expiredAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);

    // Send email FIRST — if this throws, nothing is written to DB
    await this.mailService.sendOtp(dto.email, otp, OtpPurpose.VERIFY_EMAIL);

    // Mail sent successfully → persist user + OTP atomically
    await this.dataSource.transaction(async (manager) => {
      if (existing) {
        // Unverified user retrying registration — update credentials
        existing.password = hashed;
        existing.name = dto.name;
        await manager.save(User, existing);
      } else {
        await manager.save(User, manager.create(User, {
          email: dto.email,
          password: hashed,
          name: dto.name,
          isEmailVerified: false,
        }));
      }

      // Invalidate previous unused OTPs for this email
      await manager.update(OtpCode,
        { email: dto.email, purpose: OtpPurpose.VERIFY_EMAIL, isUsed: false },
        { isUsed: true },
      );

      await manager.save(OtpCode, manager.create(OtpCode, {
        email: dto.email,
        otp,
        purpose: OtpPurpose.VERIFY_EMAIL,
        expiredAt,
      }));
    });

    return { message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.' };
  }

  // ─── Login ───────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'password', 'isEmailVerified'],
    });

    if (!user || !user.password) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Tài khoản chưa được xác thực. Vui lòng kiểm tra email.');
    }

    return { data: await this.generateTokens(user.id, user.email), message: 'Đăng nhập thành công' };
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────
  async verifyEmail(dto: VerifyEmailDto): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    await this.consumeOtp(dto.email, dto.otp, OtpPurpose.VERIFY_EMAIL);

    user.isEmailVerified = true;
    await this.userRepository.save(user);

    return { data: await this.generateTokens(user.id, user.email), message: 'Xác thực email thành công' };
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    await this.sendOtp(dto.email, dto.purpose);
    return { message: 'Đã gửi lại mã OTP' };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (user) await this.sendOtp(dto.email, OtpPurpose.RESET_PASSWORD);
    return { message: 'Nếu email tồn tại, mã OTP đã được gửi.' };
  }

  // ─── Verify Reset OTP ─────────────────────────────────────────────────────
  async verifyResetOtp(dto: VerifyResetOtpDto): Promise<{ data: { resetToken: string }; message: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    await this.consumeOtp(dto.email, dto.otp, OtpPurpose.RESET_PASSWORD);

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, purpose: 'RESET_PASSWORD' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '10m' },
    );

    return { data: { resetToken }, message: 'Xác thực OTP thành công' };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify(dto.resetToken, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    if (payload.purpose !== 'RESET_PASSWORD') throw new UnauthorizedException('Token không hợp lệ');

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepository.save(user);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────
  async googleAuth(dto: GoogleAuthDto): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const googleUser = await this.verifyGoogleToken(dto.idToken);

    let user = await this.userRepository.findOne({ where: { googleId: googleUser.sub } });

    if (!user) {
      user = await this.userRepository.findOne({ where: { email: googleUser.email } }) ?? null;
      if (user) {
        user.googleId = googleUser.sub;
        user.isEmailVerified = true;
        if (!user.name) user.name = googleUser.name;
        await this.userRepository.save(user);
      } else {
        user = await this.userRepository.save(
          this.userRepository.create({
            email: googleUser.email,
            name: googleUser.name,
            googleId: googleUser.sub,
            isEmailVerified: true,
          }),
        );
      }
    }

    return { data: await this.generateTokens(user.id, user.email), message: 'Đăng nhập thành công' };
  }

  // ─── Google OAuth (backend-driven code flow) ─────────────────────────────
  async googleOAuthCallback(code: string): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const redirectUri = `${process.env.APP_URL}/api/v1/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as { id_token?: string; error?: string; error_description?: string };
    if (tokenData.error || !tokenData.id_token) {
      console.error('[Google OAuth] Token exchange failed:', tokenData.error, tokenData.error_description);
      throw new UnauthorizedException('Không thể lấy token từ Google');
    }
    return this.googleAuth({ idToken: tokenData.id_token });
  }

  // ─── Facebook OAuth ───────────────────────────────────────────────────────
  async facebookAuth(dto: FacebookAuthDto): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const fbUser = await this.verifyFacebookToken(dto.accessToken);

    let user = await this.userRepository.findOne({ where: { facebookId: fbUser.id } });

    if (!user) {
      if (fbUser.email) {
        user = await this.userRepository.findOne({ where: { email: fbUser.email } }) ?? null;
        if (user) {
          user.facebookId = fbUser.id;
          user.isEmailVerified = true;
          if (!user.name) user.name = fbUser.name;
          await this.userRepository.save(user);
        }
      }

      if (!user) {
        if (!fbUser.email) throw new BadRequestException('Tài khoản Facebook không có email, vui lòng cấp quyền email.');
        user = await this.userRepository.save(
          this.userRepository.create({
            email: fbUser.email,
            name: fbUser.name,
            facebookId: fbUser.id,
            isEmailVerified: true,
          }),
        );
      }
    }

    return { data: await this.generateTokens(user.id, user.email), message: 'Đăng nhập thành công' };
  }

  // ─── Facebook OAuth (backend-driven code flow) ───────────────────────────
  async facebookOAuthCallback(code: string): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    const redirectUri = `${process.env.APP_URL}/api/v1/auth/facebook/callback`;
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID ?? '',
      client_secret: process.env.FACEBOOK_APP_SECRET ?? '',
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${params}`);
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string; type: string; code: number } };
    if (tokenData.error || !tokenData.access_token) {
      console.error('[Facebook OAuth] Token exchange failed:', JSON.stringify(tokenData.error));
      throw new UnauthorizedException('Không thể lấy token từ Facebook');
    }
    return this.facebookAuth({ accessToken: tokenData.access_token });
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────
  async refreshToken(dto: RefreshTokenDto): Promise<{ data: { accessToken: string; refreshToken: string }; message: string }> {
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string }>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();

      return { data: await this.generateTokens(user.id, user.email), message: 'Token đã được làm mới' };
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  // ─── Logout ──────────────────────────────────────────────────────────────
  async logout(userId: string): Promise<{ message: string }> {
    // Mark all OTPs for this user as used (defensive cleanup)
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user) {
      await this.otpRepository.update(
        { email: user.email, isUsed: false },
        { isUsed: true },
      );
    }
    // Access tokens are stateless JWT — they expire in 15m naturally.
    // The frontend must delete both tokens on receiving this response.
    return { message: 'Đăng xuất thành công' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const otp = this.generateOtp();
    const expiredAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);

    // Send email first — if it fails, DB is untouched
    await this.mailService.sendOtp(email, otp, purpose);

    // Invalidate previous unused OTPs for this email+purpose
    await this.otpRepository.update({ email, purpose, isUsed: false }, { isUsed: true });
    // Delete all expired records for this email (lazy cleanup — no cron needed)
    await this.otpRepository
      .createQueryBuilder()
      .delete()
      .where('email = :email AND expired_at < :now', { email, now: new Date() })
      .execute();

    await this.otpRepository.save(this.otpRepository.create({ email, otp, purpose, expiredAt }));
  }

  private async consumeOtp(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
    const record = await this.otpRepository.findOne({
      where: { email, otp, purpose, isUsed: false },
      order: { createdAt: 'DESC' },
    });

    if (!record) throw new BadRequestException('Mã OTP không hợp lệ');
    if (new Date() > record.expiredAt) throw new BadRequestException('Mã OTP đã hết hạn');

    record.isUsed = true;
    await this.otpRepository.save(record);
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyGoogleToken(idToken: string): Promise<{ sub: string; email: string; name: string }> {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) throw new UnauthorizedException('Google token không hợp lệ');
    const data = await res.json() as { sub?: string; email?: string; name?: string; error?: string };
    if (data.error || !data.sub || !data.email) throw new UnauthorizedException('Google token không hợp lệ');
    return { sub: data.sub, email: data.email, name: data.name ?? data.email };
  }

  private async verifyFacebookToken(accessToken: string): Promise<{ id: string; email?: string; name: string }> {
    const res = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`);
    if (!res.ok) throw new UnauthorizedException('Facebook token không hợp lệ');
    const data = await res.json() as { id?: string; name?: string; email?: string; error?: unknown };
    if (data.error || !data.id) throw new UnauthorizedException('Facebook token không hợp lệ');
    return { id: data.id, email: data.email, name: data.name ?? 'Facebook User' };
  }
}
