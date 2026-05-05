import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum OtpPurpose {
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

@Entity('otp_codes')
@Index('idx_otp_email', ['email'])
@Index('idx_otp_expired_at', ['expiredAt'])
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  otp: string;

  @Column({ type: 'enum', enum: OtpPurpose, default: OtpPurpose.VERIFY_EMAIL })
  purpose: OtpPurpose;

  @Column({ name: 'expired_at' })
  expiredAt: Date;

  @Column({ name: 'is_used', default: false })
  isUsed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
