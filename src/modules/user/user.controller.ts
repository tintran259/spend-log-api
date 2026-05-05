import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { SetGoalDto } from './dto/set-goal.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('goal')
  async getGoal(@CurrentUser() user: { sub: string }) {
    const goal = await this.userService.getGoal(user.sub);
    return { data: goal, message: 'success' };
  }

  @Post('goal')
  async setGoal(
    @CurrentUser() user: { sub: string },
    @Body() dto: SetGoalDto,
  ) {
    const goal = await this.userService.setGoal(user.sub, dto);
    return { data: goal, message: 'success' };
  }
}
