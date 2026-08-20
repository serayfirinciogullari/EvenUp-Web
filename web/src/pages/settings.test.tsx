import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';

import type { User } from '../types/models';

/**
 * Ayarlar sayfasi testleri (2.6).
 *
 * Yalnizca ag katmani mock'lanir (`api/auth`, `api/users`); form mantigi
 * (`useAuthForm`), dogrulama (`utils/validation`), oturum context'i, tema
 * saglayicisi ve Router gercek kod olarak calisir.
 *
 * Dosyanin uc asil derdi:
 *   1. profil degisikliginin **sunucudan geri okunarak** dogrulanmasi
 *      (yerel state'e yazip "kaydedildi" dememek)
 *   2. sifre degistirmenin mevcut sifre olmadan hic denenmemesi ve yanlis
 *      mevcut sifrede oturumun **dusmemesi**
 *   3. temanin secilmesi, saklanmasi ve `<html>` uzerine uygulanmasi
 */
vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/users', () => ({
  __esModule: true,
  default: { updateProfile: vi.fn(), changePassword: vi.fn() },
}));

/*
  Sidebar (Layout) bekleyen odeme rozetini paylasilan saglayicidan okuyor,
  yani her korunan sayfa bu ucu tetikliyor. Bu dosyanin derdi baska oldugu
  icin cevap sabitleniyor; mock'lanmasaydi testler gercek bir istek denerdi.
*/
vi.mock('../api/summary', () => ({
  __esModule: true,
  default: {
    getHomeSummary: vi.fn().mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 0,
      pendingSettlementsCount: 0,
      unseenActivityCount: 0,
    }),
  },
}));

/*
  Sidebar (Layout) grup kisayollarini paylasilan saglayicidan okuyor, yani her
  korunan sayfa `GET /groups` tetikliyor. Bu dosyanin derdi baska oldugu icin
  bos liste dondurecek sekilde sabitleniyor.
*/
vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
    setMemberNickname: vi.fn(),
  },
}));

import authApi from '../api/auth';
import usersApi from '../api/users';

const mockedAuth = vi.mocked(authApi);
const mockedUsers = vi.mocked(usersApi);

/* ------------------------------------------------------------------ veri */

const TOKEN_KEY = 'evenup.token';
const THEME_KEY = 'evenup.theme';

const deniz: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'deniz@evenup.dev',
  name: 'Deniz Kaya',
  role: 'user',
  is_active: true,
  created_at: '2026-08-02T10:00:00.000Z',
};

/** Backend'in hata govdesini taklit eder: `message` + alan bazli `details`. */
const apiError = (statusCode: number, message: string, details?: Record<string, string>) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message, details } },
  });

/* ------------------------------------------------------------ yardimcilar */

const renderSettings = (as: User = deniz) => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(as);

  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: 'Ayarlar' });

/** Bolum kapsami: "Kaydet" ve sifre alanlari ayni sayfada birden fazla. */
const section = (name: string) =>
  screen.getByRole('heading', { name }).closest('section') as HTMLElement;

const profileSection = () => section('Profil');
const passwordSection = () => section('Sifre degistir');
const themeSection = () => section('Gorunum');

const typeInto = (label: string, value: string, scope: HTMLElement) => {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
};

const submitPasswordForm = (values: {
  current?: string;
  next?: string;
  repeat?: string;
} = {}) => {
  const scope = passwordSection();

  if (values.current !== undefined) typeInto('Mevcut sifre', values.current, scope);
  if (values.next !== undefined) typeInto('Yeni sifre', values.next, scope);
  if (values.repeat !== undefined) typeInto('Yeni sifre (tekrar)', values.repeat, scope);

  fireEvent.click(within(scope).getByRole('button', { name: 'Sifreyi degistir' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = '';

  mockedUsers.updateProfile.mockResolvedValue({ ...deniz, name: 'Deniz Yilmaz' });
  mockedUsers.changePassword.mockResolvedValue(undefined);
});

/* ================================================================= profil */

describe('Ayarlar > profil', () => {
  it('ad alani mevcut isimle dolu gelir', async () => {
    renderSettings();
    await waitForPage();

    expect(within(profileSection()).getByLabelText('Ad')).toHaveValue('Deniz Kaya');
  });

  it('e-posta ve rol gosterilir ama duzenlenebilir alan degildir', async () => {
    renderSettings();
    await waitForPage();

    const scope = profileSection();
    expect(within(scope).getByText('deniz@evenup.dev')).toBeInTheDocument();
    expect(within(scope).getByText('user')).toBeInTheDocument();

    // Tek duzenlenebilir alan "Ad".
    expect(within(scope).queryByLabelText('E-posta')).not.toBeInTheDocument();
    expect(scope.querySelectorAll('input')).toHaveLength(1);
  });

  it('isim degismeden Kaydet kapalidir ve istek atilmaz', async () => {
    renderSettings();
    await waitForPage();

    const save = within(profileSection()).getByRole('button', { name: 'Kaydet' });
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(mockedUsers.updateProfile).not.toHaveBeenCalled();
  });

  it('yeni isimle kaydedince PUT gonderir ve basari bildirimi gosterir', async () => {
    renderSettings();
    await waitForPage();

    typeInto('Ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      expect(mockedUsers.updateProfile).toHaveBeenCalledWith({ name: 'Deniz Yilmaz' });
    });

    expect(await screen.findByText('Profil guncellendi')).toBeInTheDocument();
  });

  /**
   * Gorevin "gercekten veritabaninda mi" sorusunun istemci tarafindaki
   * karsiligi: ekranda gorunen deger sunucudan **geri okunan** deger olmali.
   */
  it('kaydettikten sonra kullaniciyi sunucudan geri okur', async () => {
    renderSettings();
    await waitForPage();

    // Acilistaki dogrulama cagrisi (1) sayilmasin diye sifirlaniyor.
    mockedAuth.getMe.mockClear();
    mockedAuth.getMe.mockResolvedValue({ ...deniz, name: 'Deniz Yilmaz' });

    typeInto('Ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(mockedAuth.getMe).toHaveBeenCalledTimes(1));

    // Sidebar'daki isim de tazelenen degeri gosteriyor (gezinme ust bardan
    // sol sidebar'a tasindi; kullanici blogu artik orada).
    const sidebar = screen.getByRole('complementary', { name: 'Kenar cubugu' });
    expect(await within(sidebar).findByText('Deniz Yilmaz')).toBeInTheDocument();
  });

  it('sunucudan geri okuma basarisiz olursa basari bildirimi gosterilmez', async () => {
    renderSettings();
    await waitForPage();

    mockedAuth.getMe.mockRejectedValue(apiError(500, 'Sunucu hatasi'));

    typeInto('Ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(within(profileSection()).getByRole('alert')).toHaveTextContent('Sunucu hatasi')
    );
    expect(screen.queryByText('Profil guncellendi')).not.toBeInTheDocument();
  });

  it('bos isimde istemci dogrulamasi takilir, ag istegi atilmaz', async () => {
    renderSettings();
    await waitForPage();

    typeInto('Ad', '   ', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(await within(profileSection()).findByText('Isim zorunlu')).toBeInTheDocument();
    expect(mockedUsers.updateProfile).not.toHaveBeenCalled();
  });

  it('backend hatasi alan altinda gosterilir', async () => {
    renderSettings();
    await waitForPage();

    mockedUsers.updateProfile.mockRejectedValue(
      apiError(400, 'Gecersiz profil bilgileri', { name: 'Isim en fazla 120 karakter olabilir' })
    );

    typeInto('Ad', 'Yeni Isim', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(
      await within(profileSection()).findByText('Isim en fazla 120 karakter olabilir')
    ).toBeInTheDocument();
  });
});

/* ================================================================== sifre */

describe('Ayarlar > sifre degistirme', () => {
  it('uc alan da sifre tipinde ve mevcut sifre ilk sirada', async () => {
    renderSettings();
    await waitForPage();

    const scope = passwordSection();
    const inputs = [...scope.querySelectorAll('input')];

    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => input.type === 'password')).toBe(true);
    expect(inputs[0]).toHaveAttribute('name', 'currentPassword');
  });

  /** Gorevin asil kurali: mevcut sifre olmadan istek hic ucmamali. */
  it('mevcut sifre bosken istek atilmaz', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({ current: '', next: 'YeniSifre123', repeat: 'YeniSifre123' });

    expect(await within(passwordSection()).findByText('Mevcut sifre zorunlu')).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre ile tekrari uyusmuyorsa istek atilmaz', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({
      current: 'MevcutSifre123',
      next: 'YeniSifre123',
      repeat: 'YeniSifre124',
    });

    expect(await within(passwordSection()).findByText('Sifreler eslesmiyor')).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre 8 karakterden kisaysa istek atilmaz', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({ current: 'MevcutSifre123', next: 'kisa', repeat: 'kisa' });

    expect(
      await within(passwordSection()).findByText('Yeni sifre en az 8 karakter olmali')
    ).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre mevcut sifreyle ayniysa istek atilmaz', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({
      current: 'MevcutSifre123',
      next: 'MevcutSifre123',
      repeat: 'MevcutSifre123',
    });

    expect(
      await within(passwordSection()).findByText('Yeni sifre mevcut sifreden farkli olmali')
    ).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('gecerli girdide iki alani da gonderir', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({
      current: 'MevcutSifre123',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    await waitFor(() => {
      expect(mockedUsers.changePassword).toHaveBeenCalledWith({
        currentPassword: 'MevcutSifre123',
        newPassword: 'YeniSifre123',
      });
    });
  });

  it('basaridan sonra alanlar temizlenir ve durum mesaji kalir', async () => {
    renderSettings();
    await waitForPage();

    submitPasswordForm({
      current: 'MevcutSifre123',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    expect(await screen.findByText('Sifreniz degistirildi')).toBeInTheDocument();

    const scope = passwordSection();
    await waitFor(() => {
      [...scope.querySelectorAll('input')].forEach((input) => expect(input).toHaveValue(''));
    });

    expect(within(scope).getByRole('status')).toHaveTextContent('Sifreniz degistirildi');
  });

  /**
   * Backend 400 + `details.currentPassword` donuyor. Iki iddia birden: mesaj
   * alanin altinda gorunuyor ve kullanici **login sayfasina atilmiyor**.
   */
  it('mevcut sifre yanlissa acik hata gosterir, oturum dusmez', async () => {
    renderSettings();
    await waitForPage();

    mockedUsers.changePassword.mockRejectedValue(
      apiError(400, 'Mevcut sifre hatali', { currentPassword: 'Mevcut sifre hatali' })
    );

    submitPasswordForm({
      current: 'YanlisSifre999',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    expect(await within(passwordSection()).findByText('Mevcut sifre hatali')).toBeInTheDocument();
    expect(await waitForPage()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('mevcut sifre hatasi ayni cumleyi iki kez gostermez', async () => {
    renderSettings();
    await waitForPage();

    mockedUsers.changePassword.mockRejectedValue(
      apiError(400, 'Mevcut sifre hatali', { currentPassword: 'Mevcut sifre hatali' })
    );

    submitPasswordForm({
      current: 'YanlisSifre999',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    await within(passwordSection()).findByText('Mevcut sifre hatali');
    expect(within(passwordSection()).getAllByText('Mevcut sifre hatali')).toHaveLength(1);
  });

  it('hata durumunda alanlar temizlenmez', async () => {
    renderSettings();
    await waitForPage();

    mockedUsers.changePassword.mockRejectedValue(
      apiError(400, 'Mevcut sifre hatali', { currentPassword: 'Mevcut sifre hatali' })
    );

    submitPasswordForm({
      current: 'YanlisSifre999',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    await within(passwordSection()).findByText('Mevcut sifre hatali');
    expect(within(passwordSection()).getByLabelText('Yeni sifre')).toHaveValue('YeniSifre123');
  });
});

/* ================================================================ gorunum */

describe('Ayarlar > tema', () => {
  it('uc secenek de bir radiogroup icinde sunulur', async () => {
    renderSettings();
    await waitForPage();

    const group = within(themeSection()).getByRole('radiogroup', { name: 'Tema' });
    expect(within(group).getAllByRole('radio').map((option) => option.textContent)).toEqual([
      'Acik',
      'Koyu',
      'Sistem',
    ]);
  });

  it('koyu tema secilince html uzerine dark sinifi biner ve tercih saklanir', async () => {
    renderSettings();
    await waitForPage();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('acik temaya donunce dark sinifi kalkar', async () => {
    renderSettings();
    await waitForPage();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Acik' }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('secili secenek aria-checked ile isaretlenir', async () => {
    renderSettings();
    await waitForPage();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));

    await waitFor(() =>
      expect(within(themeSection()).getByRole('radio', { name: 'Koyu' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    );
    expect(within(themeSection()).getByRole('radio', { name: 'Acik' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  /**
   * "Sistem" ayri bir deger olarak saklanmali: `resolvedTheme` yazilsaydi
   * kullanici bir daha isletim sistemini takip eden duruma donemezdi.
   */
  it('Sistem secenegi tercih olarak saklanir', async () => {
    renderSettings();
    await waitForPage();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));
    await waitFor(() => expect(window.localStorage.getItem(THEME_KEY)).toBe('dark'));

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Sistem' }));
    await waitFor(() => expect(window.localStorage.getItem(THEME_KEY)).toBe('system'));
  });

  /*
    Hizli gecis ust bardan sidebar'daki hesap menusune tasindi (tek tiklanabilir
    avatar). Davranis ayni: bu ekrandaki uc secenekli kontrolle **ayni** tercihi
    yaziyor, iki ayri kayit olusmuyor.
  */
  it('hesap menusundeki hizli anahtar ayni tercihi degistirir', async () => {
    renderSettings();
    await waitForPage();

    // Radix menusu `pointerdown` ile aciliyor; `click` tek basina yetmiyor.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Hesap menusu' }),
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Koyu temaya gec' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(within(themeSection()).getByRole('radio', { name: 'Koyu' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('kayitli tercih acilista uygulanir', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');

    renderSettings();
    await waitForPage();

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});
