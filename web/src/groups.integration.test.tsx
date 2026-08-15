import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { AuthResult } from './types/api';
import type { BalanceResult, GroupSummary } from './types/models';

/**
 * GERCEK BACKEND'e karsi Gruplarim ekrani. Hicbir sey mock'lanmaz.
 *
 *   1. npm run db:reset  (kokte)  -> seed verisi
 *   2. npm run dev       (kokte)  -> API
 *   3. npm run test:api  (web/)
 *
 * Seed verisi (src/db/seeds/01_demo_data.ts) sabit oldugu icin beklenen degerler
 * de sabit: admin "Ev Arkadaslari" grubunun owner'i ve net bakiyesi **+105.00**
 * (300 odedi, 195 payi dustu — bkz. docs/decisions/1.1-1.2-1.6-anlatim.md).
 * Bu, renklendirme kuralinin gercek NUMERIC metniyle calistigini kanitliyor.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'evenup.token';

const SEED_EMAIL = 'admin@evenup.dev';
const SEED_PASSWORD = 'Password123!';
const SEED_GROUP = 'Ev Arkadaslari';

const raw = axios.create({ baseURL: API_URL, validateStatus: () => true });

let token = '';
let adminId = '';

const authed = () => ({ headers: { Authorization: `Bearer ${token}` } });

const renderGroups = () => {
  window.localStorage.setItem(TOKEN_KEY, token);

  return render(
    <MemoryRouter initialEntries={['/groups']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const findCard = async (name: string) => {
  const heading = await screen.findByRole('heading', { name });
  return heading.closest('article') as HTMLElement;
};

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

  const login = await raw.post<AuthResult>('/auth/login', {
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
  });

  if (login.status !== 200) {
    throw new Error(
      `Seed kullanicisi ile giris yapilamadi (${login.status}). ` +
        `Kokte "npm run db:reset" calistirilmis mi?`
    );
  }

  token = login.data.token;
  adminId = login.data.user.id;
});

/* ============================================================ backend cevabi */

describe('backend sozlesmesi', () => {
  it('GET /groups yalnizca uye olunan gruplari doner', async () => {
    const response = await raw.get<{ groups: GroupSummary[] }>('/groups', authed());

    expect(response.status).toBe(200);

    const seeded = response.data.groups.find((group) => group.name === SEED_GROUP);
    expect(seeded).toBeDefined();
    expect(seeded?.role).toBe('owner');
    // pg COUNT'u metin dondurur; backend sayiya ceviriyor.
    expect(typeof seeded?.member_count).toBe('number');
    expect(seeded?.member_count).toBe(4);
  });

  it('GET /groups/:id/balances net bakiyeyi NUMERIC metni olarak doner', async () => {
    const list = await raw.get<{ groups: GroupSummary[] }>('/groups', authed());
    const seeded = list.data.groups.find((group) => group.name === SEED_GROUP);

    const response = await raw.get<BalanceResult>(`/groups/${seeded?.id}/balances`, authed());

    expect(response.status).toBe(200);

    const mine = response.data.balances.find((balance) => balance.user_id === adminId);
    // Metin, sayi degil: float ile para toplanmaz (docs/decisions/1.5.md).
    expect(typeof mine?.net_balance).toBe('string');
    expect(mine?.net_balance).toBe('105.00');
  });
});

/* ================================================================== ekran */

describe('gruplar ekrani gercek backend ile', () => {
  it('seed grubu kart olarak listelenir', async () => {
    renderGroups();

    const card = await findCard(SEED_GROUP);
    expect(within(card).getByText(/4 uye/)).toBeInTheDocument();
    expect(within(card).getByText('Sahip')).toBeInTheDocument();
  });

  it('pozitif bakiye yesil ve "sana borclular" olarak gosterilir', async () => {
    renderGroups();

    const card = await findCard(SEED_GROUP);

    // Bakiye kart basina ayri istekle geliyor; liste zaten gorunuyor.
    await waitFor(() => expect(within(card).getByText('Sana borclular')).toBeInTheDocument());

    expect(card.querySelector('.balance--credit')).not.toBeNull();
    // "105.00" -> 10500 kurus -> "105,00 ₺"
    expect(within(card).getByText('105,00 ₺')).toBeInTheDocument();
  });

  it('davet linki gercekten uretilir ve istemci origin ile kopyalanir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderGroups();
    await findCard(SEED_GROUP);

    fireEvent.click(screen.getByRole('button', { name: 'Davet linkini kopyala' }));

    expect(await screen.findByText('Davet linki panoya kopyalandi.')).toBeInTheDocument();

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.startsWith(`${window.location.origin}/groups/join/`)).toBe(true);

    // Kod gercekten kullanilabilir bir davet: backend ayni kodu tanimali.
    const code = copied.split('/').pop() ?? '';
    expect(code.length).toBeGreaterThan(20);
  });

  it('ikinci davet istegi ayni kodu doner — paylasilan link olmez', async () => {
    const list = await raw.get<{ groups: GroupSummary[] }>('/groups', authed());
    const seeded = list.data.groups.find((group) => group.name === SEED_GROUP);

    const first = await raw.post(`/groups/${seeded?.id}/invite`, {}, authed());
    const second = await raw.post(`/groups/${seeded?.id}/invite`, {}, authed());

    // Varsayilan davranis yeniden uretmek degil (bkz. docs/decisions/1.4.md).
    expect(second.status).toBe(200);
    expect(second.data.rotated).toBe(false);
    expect(second.data.invite.code).toBe(first.data.invite.code);
  });
});
