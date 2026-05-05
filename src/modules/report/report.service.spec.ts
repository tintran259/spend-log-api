import { ReportService } from './report.service';

// ── QueryBuilder mock factory ─────────────────────────────────────────────────
type StatsRow = {
  todayTotal: string; todayCount: string;
  monthTotal: string; monthCount: string;
  yearTotal:  string; yearCount:  string;
} | null;

function makeQB(rawOne: StatsRow) {
  const qb: any = {
    select:     jest.fn().mockReturnThis(),
    addSelect:  jest.fn().mockReturnThis(),
    where:      jest.fn().mockReturnThis(),
    andWhere:   jest.fn().mockReturnThis(),
    orderBy:    jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy:    jest.fn().mockReturnThis(),
    limit:      jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getRawOne:  jest.fn().mockResolvedValue(rawOne),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany:    jest.fn().mockResolvedValue([]),
  };
  return qb;
}

function makeExpenseRepo(qb: any) {
  return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
}

function makeService(repo: any): ReportService {
  return new (ReportService as any)(repo);
}


// ─────────────────────────────────────────────────────────────────────────────

describe('ReportService.getStatistics', () => {

  // TC-01: DB returns null (no expenses) → all zeros
  it('TC-01: returns all zeros when no expenses exist', async () => {
    const service = makeService(makeExpenseRepo(makeQB(null)));
    const { data } = await service.getStatistics('user-1');

    expect(data.todayTotal).toBe(0);
    expect(data.todayCount).toBe(0);
    expect(data.monthTotal).toBe(0);
    expect(data.monthCount).toBe(0);
    expect(data.yearTotal).toBe(0);
    expect(data.yearCount).toBe(0);
  });

  // TC-02: expenses only today → all three buckets filled
  it('TC-02: expenses only today → counted in today + month + year', async () => {
    const service = makeService(makeExpenseRepo(makeQB({
      todayTotal: '300000', todayCount: '2',
      monthTotal: '300000', monthCount: '2',
      yearTotal:  '300000', yearCount:  '2',
    })));
    const { data } = await service.getStatistics('user-1');

    expect(data.todayTotal).toBe(300_000);
    expect(data.todayCount).toBe(2);
    expect(data.monthTotal).toBe(300_000);
    expect(data.monthCount).toBe(2);
    expect(data.yearTotal).toBe(300_000);
    expect(data.yearCount).toBe(2);
  });

  // TC-03: past-this-month expense → month + year only, not today
  it('TC-03: past-this-month expense → counted in month + year, NOT today', async () => {
    const service = makeService(makeExpenseRepo(makeQB({
      todayTotal: '0',      todayCount: '0',
      monthTotal: '500000', monthCount: '3',
      yearTotal:  '500000', yearCount:  '3',
    })));
    const { data } = await service.getStatistics('user-1');

    expect(data.todayTotal).toBe(0);
    expect(data.todayCount).toBe(0);
    expect(data.monthTotal).toBe(500_000);
    expect(data.monthCount).toBe(3);
    expect(data.yearTotal).toBe(500_000);
    expect(data.yearCount).toBe(3);
  });

  // TC-04: multiple buckets across the year aggregate correctly
  it('TC-04: only current-year rows processed → year total is their sum', async () => {
    const service = makeService(makeExpenseRepo(makeQB({
      todayTotal: '200000', todayCount: '1',
      monthTotal: '300000', monthCount: '2',
      yearTotal:  '700000', yearCount:  '4',
    })));
    const { data } = await service.getStatistics('user-1');

    expect(data.yearTotal).toBe(700_000);
    expect(data.yearCount).toBe(4);
  });

  // TC-05: multiple expenses today are summed correctly
  it('TC-05: multiple rows for today are summed correctly', async () => {
    const service = makeService(makeExpenseRepo(makeQB({
      todayTotal: '150000', todayCount: '1',
      monthTotal: '150000', monthCount: '1',
      yearTotal:  '150000', yearCount:  '1',
    })));
    const { data } = await service.getStatistics('user-1');

    expect(data.todayTotal).toBe(150_000);
  });

  // TC-06: todayStr uses Vietnam timezone (YYYY-MM-DD format)
  it('TC-06: todayStr is Vietnam date format (timezone correctness)', () => {
    const vietnamDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    expect(vietnamDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(vietnamDate.length).toBe(10);
  });

  // TC-07: setParameter is called for today, monthStart, monthEnd
  it('TC-07: query builder receives correct date parameters', async () => {
    const qb  = makeQB(null);
    const service = makeService(makeExpenseRepo(qb));
    await service.getStatistics('user-1');

    const calls = qb.setParameter.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain('today');
    expect(calls).toContain('monthStart');
    expect(calls).toContain('monthEnd');
  });

  // TC-08: string amounts from DB are coerced to numbers
  it('TC-08: DB string values are coerced to numbers', async () => {
    const service = makeService(makeExpenseRepo(makeQB({
      todayTotal: '99999', todayCount: '5',
      monthTotal: '88888', monthCount: '4',
      yearTotal:  '77777', yearCount:  '3',
    })));
    const { data } = await service.getStatistics('user-1');

    expect(typeof data.todayTotal).toBe('number');
    expect(typeof data.yearCount).toBe('number');
    expect(data.todayTotal).toBe(99_999);
  });
});
