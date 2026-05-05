import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../modules/user/entities/user.entity';
import { OtpCode } from '../modules/auth/entities/otp-code.entity';
import { Expense } from '../modules/expense/entities/expense.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'spendlog',
      entities: [User, OtpCode, Expense],
      synchronize: process.env.NODE_ENV === 'development',
      extra: {
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 3_000,
      },
    }),
  ],
})
export class DatabaseModule {}
