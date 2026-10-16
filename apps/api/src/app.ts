import 'reflect-metadata';
import { VideoProgressController } from './video-progress';
import { OperationsHealthController } from './operations-health';
import { LifecycleController } from './lifecycle';
import { MediaController } from './media';
import { CompetenciesController, CorrectionsController } from './competencies';
import { ReportsController } from './reports';
import { NotificationsController } from './notifications';
import { SopExecutionController, IssuesController } from './operations';
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
import { SopSchedulesController, SopInstancesController } from './sop-schedules';
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
    SopExecutionController,
    IssuesController,
    NotificationsController,
    CompetenciesController,
    CorrectionsController,
    ReportsController,
    MediaController,
    VideoProgressController,
    LifecycleController,
    OperationsHealthController,
    SopSchedulesController,
    SopInstancesController,
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
