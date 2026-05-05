import { IsString } from 'class-validator';

export class FacebookAuthDto {
  @IsString()
  accessToken: string;
}
