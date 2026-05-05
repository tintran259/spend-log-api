import { IsIn, IsOptional } from 'class-validator';

const ALLOWED_FOLDERS = ['expenses'] as const;
type AllowedFolder = typeof ALLOWED_FOLDERS[number];

export class GetUploadUrlDto {
  @IsOptional()
  @IsIn(ALLOWED_FOLDERS)
  folder?: AllowedFolder = 'expenses';
}
