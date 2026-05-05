import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expense/entities/expense.entity';
import { GetMonthlyReportDto } from './dto/get-monthly-report.dto';

export interface DailyGroup {
  date: string;
  total: number;
  count: number;
}

export interface MonthlyReport {
  month: number;
  year: number;
  totalAmount: number;
  totalCount: number;
  previousMonthTotal: number;
  topExpense: Expense | null;
  dailyGroups: DailyGroup[];
}

export interface ReportStatistics {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  monthCount: number;
  yearTotal: number;
  yearCount: number;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) { }

  async getMonthlyReport(
    userId: string,
    dto: GetMonthlyReportDto,
  ): Promise<{ data: MonthlyReport; message: string }> {
    const { month, year } = dto;

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;

    // Single query: daily aggregates for the month (uses idx_expenses_user_date)
    const [dailyRows, prevRow, topExpense] = await Promise.all([
      this.expenseRepository
        .createQueryBuilder('expense')
        .select('expense.expenseDate', 'date')
        .addSelect('SUM(expense.amount)', 'total')
        .addSelect('COUNT(*)', 'cnt')
        .where('expense.userId = :userId', { userId })
        .andWhere('expense.expenseDate >= :monthStart', { monthStart })
        .andWhere('expense.expenseDate < :monthEnd', { monthEnd })
        .groupBy('expense.expenseDate')
        .orderBy('expense.expenseDate', 'DESC')
        .getRawMany<{ date: string; total: string; cnt: string }>(),

      // Previous month total — single aggregate, no full scan
      this.expenseRepository
        .createQueryBuilder('expense')
        .select('SUM(expense.amount)', 'total')
        .where('expense.userId = :userId', { userId })
        .andWhere('expense.expenseDate >= :prevStart', { prevStart })
        .andWhere('expense.expenseDate < :monthStart', { monthStart })
        .getRawOne<{ total: string | null }>(),

      // Top expense — ORDER BY + LIMIT 1, no full scan
      this.expenseRepository
        .createQueryBuilder('expense')
        .where('expense.userId = :userId', { userId })
        .andWhere('expense.expenseDate >= :monthStart', { monthStart })
        .andWhere('expense.expenseDate < :monthEnd', { monthEnd })
        .orderBy('expense.amount', 'DESC')
        .limit(1)
        .getOne(),
    ]);

    const dailyGroups: DailyGroup[] = dailyRows.map(r => {
      const d = new Date(r.date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: dateStr, total: Number(r.total), count: Number(r.cnt) };
    });

    const totalAmount = dailyGroups.reduce((s, g) => s + g.total, 0);
    const totalCount = dailyGroups.reduce((s, g) => s + g.count, 0);

    return {
      data: {
        month,
        year,
        totalAmount,
        totalCount,
        previousMonthTotal: Number(prevRow?.total ?? 0),
        topExpense: topExpense ?? null,
        dailyGroups,
      },
      message: 'success',
    };
  }

  async getStatistics(
    userId: string,
  ): Promise<{ data: ReportStatistics; message: string }> {
    const now = new Date();
    const todayStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [yearStr, monthStr] = todayStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Single query — 3 conditional aggregates, 1 DB round trip
    const row = await this.expenseRepository
      .createQueryBuilder('expense')
      .select(`SUM(CASE WHEN expense.expenseDate = :today  THEN expense.amount ELSE 0 END)`, 'todayTotal')
      .addSelect(`COUNT(CASE WHEN expense.expenseDate = :today  THEN 1 END)`, 'todayCount')
      .addSelect(`SUM(CASE WHEN expense.expenseDate >= :monthStart AND expense.expenseDate < :monthEnd THEN expense.amount ELSE 0 END)`, 'monthTotal')
      .addSelect(`COUNT(CASE WHEN expense.expenseDate >= :monthStart AND expense.expenseDate < :monthEnd THEN 1 END)`, 'monthCount')
      .addSelect('SUM(expense.amount)', 'yearTotal')
      .addSelect('COUNT(*)', 'yearCount')
      .where('expense.userId = :userId', { userId })
      .andWhere('expense.expenseDate >= :yearStart', { yearStart })
      .andWhere('expense.expenseDate <  :yearEnd', { yearEnd })
      .setParameter('today', todayStr)
      .setParameter('monthStart', monthStart)
      .setParameter('monthEnd', monthEnd)
      .getRawOne<{
        todayTotal: string; todayCount: string;
        monthTotal: string; monthCount: string;
        yearTotal: string; yearCount: string;
      }>();

    return {
      data: {
        todayTotal: Number(row?.todayTotal ?? 0),
        todayCount: Number(row?.todayCount ?? 0),
        monthTotal: Number(row?.monthTotal ?? 0),
        monthCount: Number(row?.monthCount ?? 0),
        yearTotal: Number(row?.yearTotal ?? 0),
        yearCount: Number(row?.yearCount ?? 0),
      },
      message: 'success',
    };
  }
}
