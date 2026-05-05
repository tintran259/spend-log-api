import { IsString, IsInt, Min, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'amount must be greater than 0' })
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString({}, { message: 'expenseDate must be a valid date (YYYY-MM-DD)' })
  expenseDate?: string;
}
