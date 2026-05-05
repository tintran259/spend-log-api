import { IsEmail, IsEnum } from 'class-validator';
import { OtpPurpose } from '../entities/otp-code.entity';

export class ResendOtpDto {
  @IsEmail()
  email: string;

  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;
}
