import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';

interface CachedUser {
  sub: string;
  email: string;
  expiresAt: number;
}

const USER_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cache = new Map<string, CachedUser>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not defined');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const now = Date.now();
    const cached = this.cache.get(payload.sub);

    if (cached && cached.expiresAt > now) {
      return { sub: cached.sub, email: cached.email };
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'email'],
    });

    if (!user) throw new UnauthorizedException();

    this.cache.set(payload.sub, { sub: user.id, email: user.email, expiresAt: now + USER_CACHE_TTL_MS });

    if (this.cache.size % 100 === 0) {
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(key);
      }
    }

    return { sub: user.id, email: user.email };
  }
}
