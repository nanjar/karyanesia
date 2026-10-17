import { randomUUID } from 'node:crypto';
import type { Database, Executor } from './database';
import type { Config } from './config';
import type { ApiRequest, Role } from './types';
import { decryptSecret, encryptSecret, hashPassword, newMfaSecret, verifyPassword } from './crypto';
import { LearningController } from './learning';
import { PracticeRubricsController } from './practice-rubrics';
import { OnboardingPathsController } from './onboarding-paths';
import { OnboardingAssignmentsController } from './onboarding-assignments';
import { SopTemplatesController } from './sop-templates';
import { SopSchedulesController } from './sop-schedules';

const tenantCode = 'karyanesia-demo';
const marker = 'demo.seed.v1';
export function demoOptions(env: NodeJS.ProcessEnv = process.env) {
  const flag = env.DEMO ?? 'false';
  if (!['true', 'false'].includes(flag)) throw Error('DEMO must be true or false.');
  if (flag === 'false') return { enabled: false as const };
  if (env.NODE_ENV !== 'development') throw Error('DEMO=true requires NODE_ENV=development.');
  const password = env.DEMO_PASSWORD ?? '';
  if (password.length < 12 || password.length > 128)
    throw Error('DEMO_PASSWORD must contain 12–128 characters.');
  return { enabled: true as const, password };
}
export interface DemoAccess {
  tenant_code: string;
  password: string;
  accounts: { employee_number: string; role: Role; mfa_enrollment_uri?: string }[];
}
// Use the same validation, versioning, snapshots and audit paths as the application.
// A single outer transaction makes partial fixture creation impossible.
export async function seedDemo(
  db: Pick<Database, 'transaction'>,
  cfg: Pick<Config, 'MFA_ENCRYPTION_KEY'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: 'disabled' } | { status: 'created' | 'existing'; access: DemoAccess }> {
  const options = demoOptions(env);
  if (!options.enabled) return { status: 'disabled' };
  return db.transaction(async (tx: Executor) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('karyanesia-demo-seed-v1'))");
    const existing = (await tx.query('SELECT id FROM tenants WHERE code=$1', [tenantCode])).rows[0];
    const access: DemoAccess = {
      tenant_code: tenantCode,
      password: options.password,
      accounts: [],
    };
    const enroll = (employee: string, secret: string) =>
      `otpauth://totp/${encodeURIComponent('Karyanesia:' + tenantCode + ':' + employee)}?secret=${secret}&issuer=Karyanesia&algorithm=SHA1&digits=6&period=30`;
    if (existing) {
      const owned = await tx.query('SELECT 1 FROM audit_events WHERE tenant_id=$1 AND action=$2', [
        existing.id,
        marker,
      ]);
      if (!owned.rows.length)
        throw Error('Reserved demo tenant code already belongs to another tenant.');
      const accounts = (
        await tx.query(
          'SELECT m.employee_number,m.role,u.password_hash,u.mfa_secret FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.employee_number=ANY($2::text[]) ORDER BY m.employee_number',
          [
            existing.id,
            [
              'DEMO-OWNER',
              'DEMO-ADMIN',
              'DEMO-HR',
              'DEMO-OPS',
              'DEMO-SPV',
              'DEMO-STAFF-01',
              'DEMO-STAFF-02',
            ],
          ],
        )
      ).rows;
      if (accounts.length !== 7)
        throw Error('Demo accounts changed; refusing to overwrite user data.');
      for (const a of accounts) {
        if (!(await verifyPassword(options.password, a.password_hash)))
          throw Error(
            'DEMO_PASSWORD differs from an existing demo account; no passwords were reset.',
          );
        access.accounts.push({
          employee_number: a.employee_number,
          role: a.role,
          ...(a.mfa_secret
            ? {
                mfa_enrollment_uri: enroll(
                  a.employee_number,
                  decryptSecret(a.mfa_secret, cfg.MFA_ENCRYPTION_KEY),
                ),
              }
            : {}),
        });
      }
      return { status: 'existing', access };
    }
    const tenant = randomUUID(),
      owner = randomUUID(),
      ownerUser = randomUUID();
    const branches = [randomUUID(), randomUUID()],
      job = randomUUID(),
      supervisor = randomUUID();
    const hash = await hashPassword(options.password);
    await tx.query('INSERT INTO tenants(id,code,name) VALUES($1,$2,$3)', [
      tenant,
      tenantCode,
      'Karyanesia Retail Demo — Data Fiktif',
    ]);
    for (const [i, branch] of branches.entries())
      await tx.query(
        'INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,$3,$4,$5)',
        [
          branch,
          tenant,
          'DEMO-' + (i + 1),
          ['Toko Demo Jakarta', 'Toko Demo Bandung'][i],
          'Asia/Jakarta',
        ],
      );
    await tx.query('INSERT INTO jobs(id,tenant_id,code,name) VALUES($1,$2,$3,$4)', [
      job,
      tenant,
      'DEMO-CREW',
      'Kru Toko Demo',
    ]);
    const roles: [Role, string, string, string, number][] = [
      ['OWNER', 'DEMO-OWNER', owner, ownerUser, 0],
      ['ADMIN', 'DEMO-ADMIN', randomUUID(), randomUUID(), 0],
      ['HR', 'DEMO-HR', randomUUID(), randomUUID(), 0],
      ['OPERATIONS', 'DEMO-OPS', randomUUID(), randomUUID(), 0],
      ['SUPERVISOR', 'DEMO-SPV', supervisor, randomUUID(), 0],
      ['STAFF', 'DEMO-STAFF-01', randomUUID(), randomUUID(), 0],
      ['STAFF', 'DEMO-STAFF-02', randomUUID(), randomUUID(), 1],
    ];
    for (const [role, employee, member, user, branchIndex] of roles) {
      const secret = ['OWNER', 'ADMIN'].includes(role) ? newMfaSecret() : null;
      await tx.query(
        'INSERT INTO users(id,full_name,password_hash,mfa_secret) VALUES($1,$2,$3,$4)',
        [
          user,
          employee + ' (Fiktif)',
          hash,
          secret ? encryptSecret(secret, cfg.MFA_ENCRYPTION_KEY) : null,
        ],
      );
      await tx.query(
        'INSERT INTO memberships(id,tenant_id,user_id,employee_number,branch_id,job_id,role,assessor,supervisor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          member,
          tenant,
          user,
          employee,
          branches[branchIndex],
          job,
          role,
          ['OWNER', 'ADMIN', 'SUPERVISOR'].includes(role),
          role === 'STAFF' ? supervisor : null,
        ],
      );
      if (['HR', 'OPERATIONS', 'SUPERVISOR'].includes(role))
        for (const branch of branches)
          await tx.query(
            'INSERT INTO branch_grants(tenant_id,membership_id,branch_id) VALUES($1,$2,$3)',
            [tenant, member, branch],
          );
      access.accounts.push({
        employee_number: employee,
        role,
        ...(secret ? { mfa_enrollment_uri: enroll(employee, secret) } : {}),
      });
    }
    const req = {
      actor: {
        id: owner,
        tenant_id: tenant,
        user_id: ownerUser,
        role: 'OWNER',
        full_name: 'Demo Owner',
        employee_number: 'DEMO-OWNER',
        tenant_name: 'Karyanesia Demo',
        branch_id: branches[0],
        scopes: branches,
        assessor: true,
      },
      correlationId: randomUUID(),
    } as ApiRequest;
    // Nested application transactions share this transaction rather than issuing BEGIN/COMMIT.
    const scoped = {
      query: tx.query.bind(tx),
      transaction: (fn: (executor: Executor) => Promise<unknown>) => fn(tx),
    } as Database;
    const learning = new LearningController(scoped),
      rubrics = new PracticeRubricsController(scoped);
    const paths = new OnboardingPathsController(scoped),
      assignments = new OnboardingAssignmentsController(scoped);
    const templates = new SopTemplatesController(scoped),
      schedules = new SopSchedulesController(scoped);
    const module = await learning.create(req, {
      title: 'Demo: Orientasi Kru Toko',
      objective: 'Mengenal alur pelatihan dan SOP demo.',
      transcript:
        'DATA FIKTIF. Baca instruksi, jawab kuis, lalu minta supervisor menilai praktik. Video YouTube hanya contoh pemutar, bukan materi SOP perusahaan.',
      video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      video_duration_seconds: 120,
      pass_score: 80,
      questions: [
        {
          prompt: 'Siapa yang menyetujui praktik kerja?',
          options: ['Supervisor berwenang', 'Diri sendiri'],
          correct: 0,
        },
        {
          prompt: 'Apa yang dilakukan saat menemukan kendala?',
          options: ['Laporkan melalui aplikasi', 'Abaikan'],
          correct: 0,
        },
      ],
    });
    await learning.publish(req, module.id, { confirm: true });
    const rubric = await rubrics.create(req, {
      title: 'Demo: Observasi Kru Toko',
      instructions: 'Contoh fiktif; bukan panduan keselamatan kerja.',
      items: [{ label: 'Menjelaskan prosedur pelaporan kendala', required: true, critical: true }],
    });
    await rubrics.publish(req, rubric.id, { confirm: true });
    const path = await paths.create(req, {
      title: 'Demo: Onboarding Kru Baru',
      description: 'Teori dan praktik dinilai terpisah. Semua data fiktif.',
      steps: [
        {
          version_id: module.id,
          rubric_version_id: rubric.id,
          due_days: 7,
          prerequisite: null,
          practice_required: true,
        },
      ],
    });
    await paths.publish(req, path.id, { confirm: true });
    const today = (
      await tx.query("SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today")
    ).rows[0].today;
    const staff = roles.filter((r) => r[0] === 'STAFF');
    const batch = await assignments.preview(req, {
      path_version_id: path.id,
      start_date: today,
      target: { kind: 'staff', ids: staff.map((r) => r[2]) },
    });
    await assignments.commit(req, batch.id, { confirm: true });
    const template = await templates.create(req, {
      title: 'Demo: Pemeriksaan Pembukaan Toko',
      instructions: 'Skenario fiktif untuk mencoba checklist dan review supervisor.',
      branch_ids: branches,
      job_ids: [job],
      shift_label: 'Demo harian',
      start_time: '00:00',
      due_time: '23:59',
      due_next_day: false,
      auto_accept: false,
      items: [
        {
          kind: 'boolean',
          label: 'Area kerja siap digunakan (demo)',
          expected: true,
          required: true,
          critical: false,
          issue_required: false,
        },
        {
          kind: 'text',
          label: 'Catatan serah terima (demo)',
          max_length: 1000,
          required: true,
          critical: false,
          issue_required: false,
        },
      ],
    });
    await templates.publish(req, template.id, { confirm: true });
    for (const [i, branch] of branches.entries()) {
      const schedule = await schedules.create(
        {
          template_version_id: template.id,
          branch_id: branch,
          start_date: today,
          end_date: today,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          assignee_ids: [staff[i][2]],
        },
        req,
      );
      await schedules.generate(schedule.id, { local_date: today }, req);
    }
    await tx.query(
      'INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id,correlation_id) VALUES($1,$2,$3,$4,$2,$5)',
      [randomUUID(), tenant, owner, marker, req.correlationId],
    );
    return { status: 'created', access };
  });
}
