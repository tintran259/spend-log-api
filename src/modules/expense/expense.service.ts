import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { GetExpensesDto } from './dto/get-expenses.dto';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) {}

  async create(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<{ data: Expense; message: string }> {
    const expense = this.expenseRepository.create({ userId, ...dto });
    const saved = await this.expenseRepository.save(expense);
    return { data: saved, message: 'success' };
  }

  async findAll(
    userId: string,
    dto: GetExpensesDto,
  ): Promise<{
    data: { items: Expense[]; total: number; page: number; limit: number };
    message: string;
  }> {
    const { page = 1, limit = 20, date, month, year } = dto;

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId })
      .orderBy('expense.expenseDate', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC');

    if (date) {
      qb.andWhere('expense.expenseDate = :date', { date });
    } else if (month && year) {
      // Date-range condition — uses idx_expenses_user_date (B-tree index)
      // EXTRACT() prevents index usage; date comparison does not.
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth  = month === 12 ? 1 : month + 1;
      const nextYear   = month === 12 ? year + 1 : year;
      const monthEnd   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      qb.andWhere('expense.expenseDate >= :monthStart', { monthStart })
        .andWhere('expense.expenseDate <  :monthEnd',   { monthEnd });
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data: { items, total, page, limit }, message: 'success' };
  }

  async getAvailableMonths(
    userId: string,
  ): Promise<{ data: { year: number; month: number; count: number }[]; message: string }> {
    const rows = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('EXTRACT(YEAR  FROM expense.expenseDate)::int', 'year')
      .addSelect('EXTRACT(MONTH FROM expense.expenseDate)::int', 'month')
      .addSelect('COUNT(*)::int', 'count')
      .where('expense.userId = :userId', { userId })
      .groupBy('EXTRACT(YEAR FROM expense.expenseDate), EXTRACT(MONTH FROM expense.expenseDate)')
      .orderBy('year',  'DESC')
      .addOrderBy('month', 'DESC')
      .getRawMany<{ year: number; month: number; count: number }>();

    return {
      data: rows.map(r => ({
        year:  r.year  != null ? Number(r.year)  : 0,
        month: r.month != null ? Number(r.month) : 0,
        count: r.count != null ? Number(r.count) : 0,
      })),
      message: 'success',
    };
  }

  async findOne(
    userId: string,
    id: string,
  ): Promise<{ data: Expense; message: string }> {
    const expense = await this.expenseRepository.findOne({ where: { id, userId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return { data: expense, message: 'success' };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<{ data: Expense; message: string }> {
    const expense = await this.expenseRepository.findOne({ where: { id, userId } });
    if (!expense) throw new NotFoundException('Expense not found');
    Object.assign(expense, dto);
    const saved = await this.expenseRepository.save(expense);
    return { data: saved, message: 'success' };
  }

  // Atomic single-query delete — no extra findOne round trip
  async remove(userId: string, id: string): Promise<{ message: string }> {
    const result = await this.expenseRepository.delete({ id, userId });
    if (result.affected === 0) throw new NotFoundException('Expense not found');
    return { message: 'success' };
  }
}
