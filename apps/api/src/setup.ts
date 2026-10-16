import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorFilter } from './errors';
import { requestContext } from './security';
export function setup(app: INestApplication, openApi = true) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestContext);
  app.use('/api/v1/media', json({ limit: '8mb' }));
  app.use(json({ limit: '2mb' }));
  app.useGlobalFilters(new ErrorFilter());
  if (openApi) {
    const cfg = new DocumentBuilder()
      .setTitle('Karyanesia API')
      .setVersion('0.0.1')
      .addCookieAuth('karyanesia_session')
      .build();
    const doc = SwaggerModule.createDocument(app, cfg);
    SwaggerModule.setup('api/docs', app, doc);
  }
}
