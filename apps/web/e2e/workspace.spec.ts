import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { otpAt } from '../../api/src/crypto';
type Fixture = {
  code: string;
  password: string;
  projects: Record<
    string,
    { admin: string; staff: string; newStaff: string; secret: string; activation: string }
  >;
};
function fixture() {
  return JSON.parse(readFileSync(resolve('qa-artifacts/browser-fixture.json'), 'utf8')) as Fixture;
}
async function login(page: Page, employee: string, secret?: string) {
  const f = fixture();
  await page.goto('/');
  await page.getByLabel('Kode perusahaan', { exact: true }).fill(f.code);
  await page.getByLabel('ID karyawan', { exact: true }).fill(employee);
  await page.locator('input[name="password"]').fill(f.password);
  if (secret)
    await page.locator('input[name="otp"]').fill(otpAt(secret, Math.floor(Date.now() / 30000)));
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}
test('activation, staff navigation and logout remain usable on each viewport', async ({
  page,
}, info) => {
  const f = fixture(),
    a = f.projects[info.project.name];
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Masuk ke ruang kerja' })).toBeVisible();
  await accessible(page);
  await noPageOverflow(page);
  await page.getByRole('button', { name: 'Pekerja baru? Aktifkan akun Anda' }).click();
  await page.getByLabel('Kode aktivasi', { exact: true }).fill(a.activation);
  await page.locator('input[name="password"]').fill(f.password);
  await page.getByRole('button', { name: 'Aktifkan akun', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Akun aktif');
  await login(page, a.newStaff);
  await accessible(page);
  await noPageOverflow(page);
  await expect(
    page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('button', { name: 'Template SOP', exact: true }),
  ).toHaveCount(0);
  for (const [nav, heading] of [
    ['SOP & kendala', 'SOP & kendala'],
    ['Keterampilan', 'Keterampilan & kesiapan'],
    ['Notifikasi', 'Notifikasi'],
  ] as const) {
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('button', { name: nav, exact: true })
      .click();
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    await accessible(page);
    await noPageOverflow(page);
  }
  await page.screenshot({ path: info.outputPath('staff-workspace.png'), fullPage: true });
  await page.getByRole('button', { name: 'Keluar', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Masuk ke ruang kerja' })).toBeVisible();
});
test('failed network login shows an error and keyboard retry succeeds', async ({ page }, info) => {
  const f = fixture(),
    a = f.projects[info.project.name];
  await page.goto('/');
  await page.getByLabel('Kode perusahaan', { exact: true }).focus();
  await page.keyboard.type(f.code);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('ID karyawan', { exact: true })).toBeFocused();
  await page.keyboard.type(a.staff);
  await page.keyboard.press('Tab');
  await expect(page.locator('input[name="password"]')).toBeFocused();
  await page.keyboard.type(f.password);
  await page.route('**/api/v1/auth/login', (route) => route.abort('failed'));
  await page.locator('input[name="password"]').press('Enter');
  await expect(page.locator('main').getByRole('alert')).toContainText('Periksa koneksi Anda');
  await expect(page.getByRole('heading', { name: 'Masuk ke ruang kerja' })).toBeVisible();
  await page.unroute('**/api/v1/auth/login');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
});
test('admin MFA login and branch dialog support keyboard and labels', async ({ page }, info) => {
  const a = fixture().projects[info.project.name];
  await login(page, a.admin, a.secret);
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('button', { name: 'Cabang', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Cabang perusahaan', exact: true, level: 1 }),
  ).toBeVisible();
  await accessible(page);
  await noPageOverflow(page);
  await page.getByRole('button', { name: /Tambah cabang/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Kode', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Tambah cabang/i })).toBeFocused();
  await page.screenshot({ path: info.outputPath('admin-branches.png'), fullPage: true });
});

test('YouTube loads only on demand and blocked requests allow retry with transcript', async ({
  page,
}, info) => {
  await login(page, fixture().projects[info.project.name].staff);
  let requests = 0;
  await page.route('https://www.youtube.com/**', async (route) => {
    requests += 1;
    await route.abort('failed');
  });
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('button', { name: 'Materi & kuis', exact: true })
    .click();
  await page.getByRole('button', { name: /Video Uji Browser/ }).click();
  await expect(
    page.getByText('Transkrip uji tetap tersedia saat koneksi YouTube gagal.', { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Putar / lanjutkan video', exact: true }).click();
  await expect(
    page.getByText('Video tidak dapat dimuat. Transkrip tetap tersedia.', { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Coba muat video lagi', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(
    page.getByRole('button', { name: 'Coba muat video lagi', exact: true }),
  ).toBeVisible();
  await page.unroute('https://www.youtube.com/**');
  await page.route('https://www.youtube.com/**', async (route) => {
    requests += 1;
    await route.fulfill({
      contentType: 'application/javascript',
      body: '// Synthetic API that never becomes ready.',
    });
  });
  await page.clock.install();
  await page.getByRole('button', { name: 'Coba muat video lagi', exact: true }).click();
  await expect.poll(() => requests).toBe(3);
  await page.clock.fastForward(15001);
  await expect(
    page.getByText('Video tidak dapat dimuat. Transkrip tetap tersedia.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Coba muat video lagi', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka di YouTube', exact: true })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  );
});

test('quiz grades answers, enforces three attempts and preserves history after reload', async ({
  page,
}, info) => {
  await login(page, fixture().projects[info.project.name].staff);
  const openQuiz = async () => {
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('button', { name: 'Materi & kuis', exact: true })
      .click();
    await page.getByRole('button', { name: /Video Uji Browser/ }).click();
    await expect(
      page.getByRole('group', { name: '1. Transkrip tersedia?', exact: true }),
    ).toBeVisible();
  };
  await openQuiz();
  await accessible(page);
  await noPageOverflow(page);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.getByRole('radio', { name: attempt === 3 ? 'Ya' : 'Tidak', exact: true }).check();
    await page.getByRole('button', { name: /Kirim jawaban/ }).click();
    await expect(
      page.getByText(new RegExp('^Nilai ' + (attempt === 3 ? '100\\.0' : '0\\.0') + '% — ')),
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp('^Rangkaian 1 · percobaan ' + attempt + ':')),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Ya', exact: true })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Tidak', exact: true })).not.toBeChecked();
  }
  await expect(page.getByRole('button', { name: /Kirim jawaban \(3\/3/ })).toBeDisabled();
  await expect(page.getByText(/Batas tiga percobaan rangkaian ini sudah tercapai/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
  await openQuiz();
  await expect(page.getByRole('button', { name: /Kirim jawaban \(3\/3/ })).toBeDisabled();
  await expect(page.getByText(/^Rangkaian 1 · percobaan \d:/)).toHaveCount(3);
  await expect(
    page.getByText('Rangkaian 1 · percobaan 3: 100.0% · Lulus teori', { exact: true }),
  ).toBeVisible();
});
