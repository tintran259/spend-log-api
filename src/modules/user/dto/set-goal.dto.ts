import { IsIn, IsInt, Min } from 'class-validator';

export class SetGoalDto {
  @IsIn(['daily', 'monthly', 'yearly'])
  sourceField: 'daily' | 'monthly' | 'yearly';

  @IsInt()
  @Min(1)
  sourceValue: number;
}
