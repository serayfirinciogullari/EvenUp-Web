import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { AuthResult } from './types/api';
import type { BalanceResult, SettlementListResult } from './types/models';

/**
 * GERCEK BACKEND'e karsi grup detay ekrani. Hicbir sey mock'lanmaz.
 *
 *   1. npm run db:reset  (kokte)  -> seed verisi
 *   2. npm run dev       (kokte)  -> API
 *   3. npm run test:api  (web/)
 *
 * KRITIK SENARYO
 * --------------
 * Bu dosyanin varlik sebebi gorevdeki uctan uca akis:
 *
 *     harcama ekle -> bakiye guncellenir -> "odedim" -> BASKA BIR KULLANICI
 *     onaylar -> bakiye kapanir
 *
 * Onay adimi arayuzden yapilamaz (alacakli baska bir kisi), bu yuzden ikinci
 * kullanici **ham API istegiyle** taklit ediliyor — gorevdeki "Postman'den
 * taklit et" adiminin otomatiklestirilmis hali. Boylece iki tarafli onay modeli
 * gercekten iki taraftan sinaniyor, tek kullaniciyla "sanki" degil.
 *
 * NEDEN SEED GRUBU DEGIL, YENI GRUP
 * ---------------------------------
 * Iki sebep:
 *   1. **Deterministiklik.** Seed grubunda dort kisinin bakiyesi var; "borcunu
 *      ode" adiminda netlestirme borcu birden fazla alacakliya bolebilir ve
 *      "bakiye sifirlandi" iddiasi tek bir odemeyle dogrulanamaz. Iki kisilik
 *      taze bir grupta tek transfer var, sonuc kesin.
 *   2. **Yan etki birakmamak.** Bu dosya seed grubuna harcama yazsaydi
 *      `groups.integration.test.tsx`'in bekledigi "+105.00" degeri bozulurdu.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'evenup.token';

const SEED_PASSWORD = 'Password123!';
const DENIZ_EMAIL = 'deniz@evenup.dev';
const ECE_EMAIL = 'ece@evenup.dev';

const raw = axios.create({ baseURL: API_URL, validateStatus: () => true });

let denizToken = '';
let denizId = '';
let eceToken = '';
let eceId = '';
let groupId = '';
let groupName = '';

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

/** Deniz olarak grup detay ekranini acar. */
const renderDetail = () => {
  window.localStorage.setItem(TOKEN_KEY, denizToken);

  return render(
    <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: groupName });

/** Radix sekmeyi mousedown aninda degistiriyor (bkz. groupDetail.test.tsx). */
const selectTab = (name: RegExp | string) => {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
};

const netBalanceOf = async (userId: string): Promise<string> => {
  const response = await raw.get<BalanceResult>(`/groups/${groupId}/balances`, authed(denizToken));
  return response.data.balances.find((balance) => balance.user_id === userId)?.net_balance ?? 'YOK';
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

  const deniz = await login(DENIZ_EMAIL);
  denizToken = deniz.token;
  denizId = deniz.user.id;

  const ece = await login(ECE_EMAIL);
  eceToken = ece.token;
  eceId = ece.user.id;

  // Taze grup: Deniz kurar (owner olur), Ece davet linkiyle katilir.
  groupName = `2.4 Akis Testi ${Date.now()}`;

  const created = await raw.post('/groups', { name: groupName }, authed(denizToken));
  if (created.status !== 201) {
    throw new Error(`Grup olusturulamadi (${created.status})`);
  }
  groupId = created.data.group.id;

  const invite = await raw.post(`/groups/${groupId}/invite`, {}, authed(denizToken));
  if (invite.status !== 201 && invite.status !== 200) {
    throw new Error(`Davet uretilemedi (${invite.status})`);
  }

  const joined = await raw.post(
    `/groups/join/${invite.data.invite.code}`,
    {},
    authed(eceToken)
  );
  if (joined.status !== 200 && joined.status !== 201) {
    throw new Error(`Ece gruba katilamadi (${joined.status})`);
  }
});

/* ==================================================== backend sozlesmesi */

describe('backend sozlesmesi (2.4 ile eklenen uc nokta)', () => {
  it('GET /groups/:id/settlements sayfalama bilgisiyle doner', async () => {
    const response = await raw.get<SettlementListResult>(
      `/groups/${groupId}/settlements?status=pending`,
      authed(denizToken)
    );

    expect(response.status).toBe(200);
    expect(response.data.settlements).toEqual([]);
    expect(response.data.pagination.page).toBe(1);
    expect(response.data.pagination.total).toBe(0);
  });

  it('bilinmeyen status sessizce yok sayilmaz', async () => {
    const response = await raw.get(
      `/groups/${groupId}/settlements?status=beklemede`,
      authed(denizToken)
    );

    expect(response.status).toBe(400);
  });

  it('esit bolmede kurus artigi istemci onizlemesiyle ayni kisiye gider', async () => {
    // Istemcideki onizleme (utils/split.ts) artigi en kucuk userId'ye veriyor;
    // backend'in `distributeByWeights`i de oyle. Bu test ikisinin ayrismadigini
    // gercek veriyle gosteriyor.
    const response = await raw.post(
      `/groups/${groupId}/expenses`,
      {
        amount: '100.00',
        description: 'Kurus artigi kontrolu',
        splitType: 'equal',
        splitDetails: { participants: [denizId, eceId] },
      },
      authed(denizToken)
    );

    expect(response.status).toBe(201);

    const shares: { user_id: string; share_amount: string }[] = response.data.expense.shares;
    const total = shares.reduce(
      (sum, share) => sum + Math.round(Number(share.share_amount) * 100),
      0
    );

    // Toplam her zaman tam tutar (1.5'teki degismez kural).
    expect(total).toBe(10_000);

    // Iki kisiye bolununce artik yok; asil kontrol tek kurusluk artikta.
    const odd = await raw.post(
      `/groups/${groupId}/expenses`,
      {
        amount: '0.01',
        description: 'Tek kurus',
        splitType: 'equal',
        splitDetails: { participants: [denizId, eceId] },
      },
      authed(denizToken)
    );

    expect(odd.status).toBe(201);

    const smallest = denizId < eceId ? denizId : eceId;
    const winner = odd.data.expense.shares.find(
      (share: { user_id: string; share_amount: string }) => share.share_amount === '0.01'
    );

    expect(winner.user_id).toBe(smallest);

    // Yan etki birakmamak icin iki deneme harcamasi da siliniyor.
    await raw.delete(`/expenses/${response.data.expense.id}`, authed(denizToken));
    await raw.delete(`/expenses/${odd.data.expense.id}`, authed(denizToken));

    expect(await netBalanceOf(denizId)).toBe('0.00');
  });
});

/* ================================================== KRITIK uctan uca akis */

describe('KRITIK akis: harcama -> bakiye -> odeme -> onay -> sifir', () => {
  it('harcama eklenir, bakiye guncellenir, odeme onaylaninca kapanir', async () => {
    /* ------------------------------------------------- 1. baslangic: sifir */
    expect(await netBalanceOf(denizId)).toBe('0.00');

    renderDetail();
    await waitForPage();

    /* ------------------------------------- 2. arayuzden harcama ekle (exact)
       Ece odedi, tamami Deniz'in payi -> Deniz -60.00, Ece +60.00 */
    fireEvent.click(screen.getByRole('button', { name: 'Harcama Ekle' }));

    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText('Aciklama'), {
      target: { value: 'Ucak bileti' },
    });
    fireEvent.change(within(modal).getByLabelText('Tutar (₺)'), { target: { value: '60' } });
    fireEvent.change(within(modal).getByLabelText('Kim odedi'), { target: { value: eceId } });

    fireEvent.click(within(modal).getByLabelText('Ozel tutar'));
    fireEvent.click(within(modal).getByLabelText('Ece Demir dahil'));

    // Once bilerek YANLIS toplam: 20 TL, harcama 60 TL.
    fireEvent.change(within(modal).getByLabelText('Deniz Kaya tutari'), {
      target: { value: '20' },
    });

    // Anlik dogrulama: eksik oldugunu istek atmadan soyluyor.
    expect(await screen.findByText('40,00 ₺ eksik')).toBeInTheDocument();

    // Dogru tutar girilince toplam tutuyor.
    fireEvent.change(within(modal).getByLabelText('Deniz Kaya tutari'), {
      target: { value: '60' },
    });
    expect(await screen.findByText('Toplam tutuyor: 60,00 ₺')).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    /* ----------------------------------------------- 3. bakiye guncellendi */
    await waitFor(async () => {
      expect(await netBalanceOf(denizId)).toBe('-60.00');
    });

    // Ekranda da guncel: Deniz artik Ece'ye borclu.
    selectTab(/Odemeler/);
    expect(await screen.findByText("Sen Ece Demir'e 60,00 ₺ borclusun")).toBeInTheDocument();

    /* ------------------------------------------------ 4. arayuzden "Odedim" */
    fireEvent.click(screen.getByRole('button', { name: 'Odedim olarak isaretle' }));

    const settleModal = await screen.findByRole('dialog');
    expect(within(settleModal).getByLabelText('Tutar (₺)')).toHaveValue('60.00');

    fireEvent.click(within(settleModal).getByRole('button', { name: 'Odedim' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    /* ------------------------- 5. PENDING kayit bakiyeyi DEGISTIRMEZ (1.7) */
    expect(await screen.findByText(/odedigini bildirdin/)).toBeInTheDocument();
    expect(await netBalanceOf(denizId)).toBe('-60.00');
    // Borc hala ekranda: onaylanmamis odeme netlestirmeye girmez.
    expect(screen.getByText("Sen Ece Demir'e 60,00 ₺ borclusun")).toBeInTheDocument();
    // Onay bu tarafta verilemez.
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();

    /* ---------- 6. IKINCI KULLANICI (Ece) onaylar — ham API, Postman gibi */
    const pending = await raw.get<SettlementListResult>(
      `/groups/${groupId}/settlements?status=pending`,
      authed(eceToken)
    );

    const mine = pending.data.settlements.find(
      (item) => item.from_user === denizId && item.to_user === eceId
    );

    expect(mine).toBeDefined();
    expect(mine?.amount).toBe('60.00');
    expect(mine?.from_name).toBe('Deniz Kaya');

    // Borclunun kendi kaydini onaylamasi engelli.
    const selfConfirm = await raw.put(`/settlements/${mine?.id}/confirm`, {}, authed(denizToken));
    expect(selfConfirm.status).toBe(403);

    const confirm = await raw.put(`/settlements/${mine?.id}/confirm`, {}, authed(eceToken));
    expect(confirm.status).toBe(200);
    expect(confirm.data.settlement.status).toBe('confirmed');

    /* ------------------------------------------- 7. bakiye kapandi (sifir) */
    expect(await netBalanceOf(denizId)).toBe('0.00');
    expect(await netBalanceOf(eceId)).toBe('0.00');

    const balances = await raw.get<BalanceResult>(
      `/groups/${groupId}/balances`,
      authed(denizToken)
    );
    expect(balances.data.transfers).toEqual([]);
    expect(balances.data.meta.confirmed_settlement_count).toBe(1);
  });
});
