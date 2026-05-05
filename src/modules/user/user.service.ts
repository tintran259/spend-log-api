import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { SetGoalDto } from './dto/set-goal.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getGoal(userId: string): Promise<{ sourceField: string; sourceValue: number } | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.goalSourceField || user.goalSourceValue == null) return null;

    return {
      sourceField: user.goalSourceField,
      sourceValue: user.goalSourceValue,
    };
  }

  async setGoal(
    userId: string,
    dto: SetGoalDto,
  ): Promise<{ sourceField: string; sourceValue: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.goalSourceField = dto.sourceField;
    user.goalSourceValue = dto.sourceValue;
    await this.userRepository.save(user);

    return { sourceField: dto.sourceField, sourceValue: dto.sourceValue };
  }
}
