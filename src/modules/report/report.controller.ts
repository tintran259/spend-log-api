import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { GetMonthlyReportDto } from './dto/get-monthly-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('statistics')
  getStatistics(@CurrentUser() user: JwtPayload) {
    return this.reportService.getStatistics(user.sub);
  }

  @Get('monthly')
  getMonthlyReport(
    @CurrentUser() user: JwtPayload,
    @Query() dto: GetMonthlyReportDto,
  ) {
    return this.reportService.getMonthlyReport(user.sub, dto);
  }
}
