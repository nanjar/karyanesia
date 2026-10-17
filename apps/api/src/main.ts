import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { setup } from './setup';
import { CONFIG, Config } from './config';
import { Database } from './database';
import { demoOptions, seedDemo } from './demo-seed';
import { writeFile, chmod } from 'node:fs/promises';
async function main() {
  demoOptions();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  try {
    const demo = await seedDemo(app.get(Database), app.get<Config>(CONFIG));
    if (demo.status !== 'disabled') {
      await writeFile('/tmp/karyanesia-demo-access.json', JSON.stringify(demo.access, null, 2), {
        mode: 0o600,
      });
      await chmod('/tmp/karyanesia-demo-access.json', 0o600);
      console.log('Demo data ready. Access details: /tmp/karyanesia-demo-access.json (private).');
    }
    setup(app);
    app.enableShutdownHooks();
    await app.listen(app.get<Config>(CONFIG).PORT, '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }
}
main().catch(() => {
  console.error('API startup failed. Check configuration and database connectivity.');
  process.exitCode = 1;
});
