import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { AuthResult } from './types/api';
import type { AdminGroupListResult, AdminStats, AdminUserListResult } from './types/models';

/**
 * GERCEK BACKEND'e karsi admin paneli. Hicbir sey mock'lanmaz.
 *
 *   1. npm run db:reset  (kokte)  -> seed verisi
 *   2. npm run dev       (kokte)  -> API
 *   3. npm run test:api  (web/)
 *
 * DOSYANIN ISI
 * ------------
 * 1. `web/src/types/models.ts` icindeki admin tiplerinin backend'in gercek
 *    cevabiyla **birebir** ortustugunu gostermek. Tipler elle yazildi (uretim
 *    yok), yani ayrisma ancak boyle yakalanir. Ozellikle `GET /admin/groups`
 *    satirinin anahtar kumesi tam olarak dort alan olmali.
 * 2. Salt okunur grup listesi iddiasini **veriyle** dogrulamak: gruba gercek bir
 *    harcama yazilir, sonra admin cevabinda o harcamanin hicbir izinin
 *    bulunmadigi kontrol edilir.
 * 3. Devre disi birakma akisini arayuzden ucdan uca yurutmek.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'evenup.token';

const SEED_PASSWORD = 'Password123!';
const ADMIN_EMAIL = 'admin@evenup.dev';
const DENIZ_EMAIL = 'deniz@evenup.dev';

const raw = axios.create({ baseURL: API_URL, validateStatus: () => true });

let adminToken = '';
let denizToken = '';

/** Testin kendi olusturdugu, uzerinde islem yapilacak hesap. */
const VICTIM_EMAIL = `admin-e2e-${Date.now()}@evenup.test`;
const VICTIM_NAME = `Test Kullanici ${Date.now()}`;
let victimId = '';

const authed = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

const login = async (email: string): Promise<AuthResult> => {
  const response = await raw.post<AuthResult>('/auth/login', { email, password: SEED_PASSWORD });

  if (response.status !== 200) {
    throw new Error(
      `${email} ile giris yapilamadi (${response.status}). Kokte "npm run db:reset" calistirilmis mi?`
    );
  }

  return response.data;
};

const renderAdmin = () => {
  window.localStorage.setItem(TOKEN_KEY, adminToken);

  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: 'Admin' });

const usersSection = () =>
  screen.getByRole('heading', { name: 'Kullanicilar' }).closest('section') as HTMLElement;

const groupsSection = () =>
  screen.getByRole('heading', { name: 'Gruplar' }).closest('section') as HTMLElement;

beforeAll(async () => {
  try {
    const health = await raw.get('/health');

    if (health.status !== 200) {
      throw new Error(`/health ${health.status} dondu`);
    }
  } catch (error) {
    throw new Error(
      `Backend'e ulasilamiyor (${API_URL}). Bu testler gercek API ister.\n` +
        `  Proje kokunde:  npm run dev\n` +
        `  Veritabani icin: npm run db:reset\n` +
        `Ayrinti: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  adminToken = (await login(ADMIN_EMAIL)).token;
  denizToken = (await login(DENIZ_EMAIL)).token;

  // Seed kullanicilarina dokunmamak icin kendi hesabimizi acalim: bu hesap
  // kapatilip yeniden acilacak.
  const registered = await raw.post<AuthResult>('/auth/register', {
    name: VICTIM_NAME,
    email: VICTIM_EMAIL,
    password: SEED_PASSWORD,
  });

  if (registered.status !== 201) {
    throw new Error(`Test kullanicisi olusturulamadi (${registered.status})`);
  }

  victimId = registered.data.user.id;
});

/* ================================================== tip / sozlesme uyumu */

describe('admin API sozlesmesi tiplerle ortusuyor', () => {
  it('GET /admin/stats beklenen anahtarlari ve metin hacimleri doner', async () => {
    const response = await raw.get<AdminStats>('/admin/stats', authed(adminToken));

    expect(response.status).toBe(200);

    const stats = response.data;

    expect(Object.keys(stats).sort()).toEqual([
      'expenses',
      'groups',
      'settlements',
      'trends',
      'users',
    ]);
    expect(Object.keys(stats.users).sort()).toEqual(['active', 'inactive', 'total']);

    // Sayilar sayi, para metin: NUMERIC alanlar float'a cevrilmeden geliyor.
    expect(typeof stats.users.total).toBe('number');
    expect(typeof stats.expenses.volume).toBe('string');
    expect(stats.expenses.volume).toMatch(/^\d+\.\d{2}$/);
    expect(typeof stats.settlements.confirmed_volume).toBe('string');

    expect(Object.keys(stats.trends).sort()).toEqual(['last_30_days', 'last_7_days']);
  });

  it('GET /admin/users satirinda password_hash yok', async () => {
    const response = await raw.get<AdminUserListResult>('/admin/users?limit=5', authed(adminToken));

    expect(response.status).toBe(200);
    expect(Object.keys(response.data.users[0]).sort()).toEqual([
      'created_at',
      'email',
      'id',
      'is_active',
      'name',
      'role',
    ]);
    expect(response.data.pagination.page).toBe(1);
  });

  it('GET /admin/groups satiri TAM OLARAK dort alan tasir', async () => {
    const response = await raw.get<AdminGroupListResult>('/admin/groups', authed(adminToken));

    expect(response.status).toBe(200);
    expect(response.data.groups.length).toBeGreaterThan(0);

    for (const group of response.data.groups) {
      // Tipin dar olusu bir kirpma degil, backend'in sozlesmesi. Buraya yeni bir
      // alan sizsaydi (description, expense_count) test burada kirilirdi.
      expect(Object.keys(group).sort()).toEqual(['created_at', 'id', 'member_count', 'name']);
    }
  });

  it('normal kullanici hicbir /admin ucuna erisemez', async () => {
    for (const path of ['/admin/stats', '/admin/users', '/admin/groups']) {
      const response = await raw.get(path, authed(denizToken));
      expect(response.status).toBe(403);
    }
  });
});

/* ============================================ salt okunur grup listesi */

describe('grup listesi harcama verisi tasimiyor', () => {
  it('gruba harcama yazilsa bile admin cevabinda izi bulunmaz', async () => {
    // Deniz'in uyesi oldugu bir grup bul ve icine ayirt edici bir harcama yaz.
    const groups = await raw.get('/groups', authed(denizToken));
    const target = groups.data.groups[0];

    expect(target).toBeDefined();

    const marker = `Gizli psikolog randevusu ${Date.now()}`;
    const created = await raw.post(
      `/groups/${target.id}/expenses`,
      { amount: '1250.00', description: marker, category: 'saglik', splitType: 'equal' },
      authed(denizToken)
    );

    expect(created.status).toBe(201);

    const adminView = await raw.get('/admin/groups?limit=100', authed(adminToken));
    const body = JSON.stringify(adminView.data);

    // Ne aciklama, ne tutar, ne de alan adlari.
    expect(body).not.toContain(marker);
    expect(body).not.toContain('1250.00');
    for (const field of ['description', 'amount', 'expense', 'share', 'paid_by', 'category']) {
      expect(body).not.toContain(field);
    }

    // Yan etki birakmamak icin harcama siliniyor (soft delete).
    await raw.delete(`/expenses/${created.data.expense.id}`, authed(denizToken));
  });

  it('arayuzde grup satirindan icerige giden bir yol yok', async () => {
    renderAdmin();
    await waitForPage();

    const section = groupsSection();
    // Birden fazla grup satiri var; varlik kontrolu icin hepsi yeterli.
    const memberCells = await within(section).findAllByText(/\d+ uye$/);
    expect(memberCells.length).toBeGreaterThan(0);

    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(within(section).getByText(/Grup icerigi admin icin gizlidir/)).toBeInTheDocument();
    // Ekranda para birimi hic gecmiyor: hacim/bakiye bu blokta yok.
    expect(section.textContent).not.toMatch(/₺/);
  });
});

/* ================================================ uctan uca: devre disi birak */

describe('KRITIK akis: arayuzden devre disi birakma', () => {
  it('onay modalindan gecer, hesap kapanir ve giris engellenir', async () => {
    renderAdmin();
    await waitForPage();

    // Arama sunucu tarafinda: yeni acilan hesap ilk sayfada olmayabilir.
    fireEvent.change(screen.getByLabelText('E-posta ya da isim ara'), {
      target: { value: VICTIM_EMAIL },
    });

    const emailCell = await within(usersSection()).findByText(VICTIM_EMAIL, undefined, {
      timeout: 5000,
    });
    const row = emailCell.closest('tr') as HTMLElement;

    expect(within(row).getByText('Aktif')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: /devre disi birak/i }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/devre disi birakmak istediginize emin misiniz\?/i)
    ).toBeInTheDocument();

    // Onay verilmeden hesap kapanmamali.
    let check = await raw.get<AdminUserListResult>(
      `/admin/users?search=${encodeURIComponent(VICTIM_EMAIL)}`,
      authed(adminToken)
    );
    expect(check.data.users[0].is_active).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Devre disi birak' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Sunucuda gercekten kapandi.
    check = await raw.get<AdminUserListResult>(
      `/admin/users?search=${encodeURIComponent(VICTIM_EMAIL)}`,
      authed(adminToken)
    );
    expect(check.data.users[0].is_active).toBe(false);

    // Ve sonucu gercek: bu hesap artik giris yapamiyor.
    const blocked = await raw.post('/auth/login', {
      email: VICTIM_EMAIL,
      password: SEED_PASSWORD,
    });
    expect(blocked.status).toBe(401);

    // Ekranda satir "Pasif" ve aksiyon "Aktiflestir" olarak yenilendi.
    await waitFor(() =>
      expect(within(usersSection()).getByText('Pasif')).toBeInTheDocument()
    );

    // Geri alinabilirligi de kanitla: aktiflestir ve giris yeniden calissin.
    const enabled = await raw.put(`/admin/users/${victimId}/enable`, {}, authed(adminToken));
    expect(enabled.status).toBe(200);

    const allowed = await raw.post('/auth/login', {
      email: VICTIM_EMAIL,
      password: SEED_PASSWORD,
    });
    expect(allowed.status).toBe(200);
  });

  it('admin kendi hesabini kapatamaz', async () => {
    const me = await raw.get('/auth/me', authed(adminToken));

    const response = await raw.put(
      `/admin/users/${me.data.user.id}/disable`,
      {},
      authed(adminToken)
    );

    expect(response.status).toBe(400);
  });
});
