import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { setup } from './setup';
import { CONFIG, Config } from './config';
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  setup(app);
  app.enableShutdownHooks();
  await app.listen(app.get<Config>(CONFIG).PORT, '0.0.0.0');
}
main().catch(() => {
  console.error('API startup failed. Check configuration and database connectivity.');
  process.exitCode = 1;
});
