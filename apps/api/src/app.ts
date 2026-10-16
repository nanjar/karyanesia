import 'reflect-metadata';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Database } from './database';
import { CONFIG, readConfig } from './config';
import { AuthController } from './auth';
import { OrganizationController } from './organization';
import { OnboardingAssignmentsController } from './onboarding-assignments';
import { OnboardingPathsController } from './onboarding-paths';
import { PracticeRequestsController } from './practice-requests';
import { PracticeAssessmentsController } from './practice-assessments';
import { PracticeRubricsController } from './practice-rubrics';
import { SopTemplatesController } from './sop-templates';
import { LearningController } from './learning';
import { StaffImportsController } from './staff-imports';
import { OriginGuard, SessionGuard } from './security';
@Controller('health')
class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', version: '0.0.1' };
  }
}
@Module({
  controllers: [
    AuthController,
    OrganizationController,
    StaffImportsController,
    LearningController,
    SopTemplatesController,
    PracticeRubricsController,
    PracticeAssessmentsController,
    PracticeRequestsController,
    OnboardingPathsController,
    OnboardingAssignmentsController,
    HealthController,
  ],
  providers: [
    { provide: CONFIG, useFactory: readConfig },
    Database,
    SessionGuard,
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule {}
