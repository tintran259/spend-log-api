import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'google_id', type: 'varchar', nullable: true, unique: true })
  googleId: string | null;

  @Column({ name: 'facebook_id', type: 'varchar', nullable: true, unique: true })
  facebookId: string | null;

  @Column({ name: 'goal_source_field', nullable: true, type: 'varchar' })
  goalSourceField: 'daily' | 'monthly' | 'yearly' | null;

  @Column({ name: 'goal_source_value', nullable: true, type: 'int' })
  goalSourceValue: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
