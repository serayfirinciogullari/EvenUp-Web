import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';

import type { User } from '../types/models';

/**
 * Ayarlar sayfasi testleri (2.6, yeniden tasarim -> docs/decisions/ayarlar-sayfasi.md).
 *
 * Yalnizca ag katmani mock'lanir (`api/auth`, `api/users`); form mantigi
 * (`useAuthForm`), dogrulama (`utils/validation`), oturum context'i, tema
 * saglayicisi ve Router gercek kod olarak calisir.
 *
 * Dosyanin asil derdi eskisiyle ayni uce artik bir dorduncu ekleniyor:
 *   1. profil degisikliginin **sunucudan geri okunarak** dogrulanmasi
 *      (yerel state'e yazip "kaydedildi" dememek) — artik isim + takma ad +
 *      fotograf ucu birden
 *   2. sifre degistirmenin mevcut sifre olmadan hic denenmemesi ve yanlis
 *      mevcut sifrede oturumun **dusmemesi**
 *   3. temanin secilmesi, saklanmasi ve `<html>` uzerine uygulanmasi
 *   4. dort sekmenin **gercek route'lar** olmasi: dogrudan adresle acilabilme,
 *      sekmeler arasi tiklamayla gecis, aktif sekmenin isaretlenmesi
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
  avatar: null,
  handle: null,
};

/** Backend'in hata govdesini taklit eder: `message` + alan bazli `details`. */
const apiError = (statusCode: number, message: string, details?: Record<string, string>) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message, details } },
  });

/* ------------------------------------------------------------ yardimcilar */

const renderSettings = (path = '/settings/profile', as: User = deniz) => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(as);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForShell = () => screen.findByRole('heading', { name: 'Hesabin ve tercihlerin' });

/** Bolum kapsami: "Kaydet" ve sifre alanlari ayni sekmede birden fazla olabilir. */
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

const pngFile = (name: string, sizeBytes: number, type = 'image/png') =>
  new File([new Uint8Array(sizeBytes)], name, { type });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = '';

  mockedUsers.updateProfile.mockResolvedValue({ ...deniz, name: 'Deniz Yilmaz' });
  mockedUsers.changePassword.mockResolvedValue(undefined);
});

/* ============================================================== sekmeler */

describe('Ayarlar > sekmeler', () => {
  it('/settings dogrudan Profil sekmesine yonlendirir', async () => {
    renderSettings('/settings');
    await waitForShell();

    // Yonlendirme, Layout'taki sayfa gecisi animasyonunun (AnimatePresence)
    // ardindan tamamlaniyor; `findBy` bu gecisi bekliyor, senkron `getBy` beklemez.
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeInTheDocument();
  });

  it('dogrudan /settings/security adresi Guvenlik sekmesini acar', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    expect(screen.getByRole('heading', { name: 'Sifre degistir' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Profil' })).not.toBeInTheDocument();
  });

  /*
    Uc ayri test, tek testte uc kere zincirlenmis gecis yerine: Layout'taki
    sayfa gecisi animasyonu (AnimatePresence) her tiklamada gercek bir sure
    aliyor, uc gecisi art arda zincirlemek paralel test kosumunda (bu dosya
    tek basina degil digerleriyle birlikte kosarken) zaman asimi riskini
    katlıyor. Tek gecisli testler ayni davranisi sinar, riski azaltir.
  */
  it('Guvenlik sekmesine tiklayinca Sifre degistir acilir', async () => {
    renderSettings('/settings/profile');
    await waitForShell();

    fireEvent.click(screen.getByRole('link', { name: /Guvenlik/ }));
    expect(await screen.findByRole('heading', { name: 'Sifre degistir' })).toBeInTheDocument();
  });

  it('Tercihler sekmesine tiklayinca Gorunum acilir', async () => {
    renderSettings('/settings/profile');
    await waitForShell();

    fireEvent.click(screen.getByRole('link', { name: /Tercihler/ }));
    expect(await screen.findByRole('heading', { name: 'Gorunum' })).toBeInTheDocument();
  });

  it('Hesap sekmesine tiklayinca Hesap acilir', async () => {
    renderSettings('/settings/profile');
    await waitForShell();

    fireEvent.click(screen.getByRole('link', { name: /Hesap/ }));
    expect(await screen.findByRole('heading', { name: 'Hesap' })).toBeInTheDocument();
  });

  it('aktif sekme isaretlenir', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    expect(screen.getByRole('link', { name: /Guvenlik/ })).toHaveClass('bg-rose/10');
    expect(screen.getByRole('link', { name: /Profil/ })).not.toHaveClass('bg-rose/10');
  });
});

/* ================================================================= profil */

describe('Ayarlar > profil', () => {
  it('ad ve takma ad alanlari mevcut degerlerle dolu gelir', async () => {
    renderSettings('/settings/profile', { ...deniz, handle: 'deniz' });
    await waitForShell();

    const scope = profileSection();
    expect(within(scope).getByLabelText('Gorunen ad')).toHaveValue('Deniz Kaya');
    expect(within(scope).getByLabelText('Takma ad')).toHaveValue('deniz');
  });

  it('e-posta maskeli gosterilir ve GIZLI etiketiyle birlikte duzenlenemez', async () => {
    renderSettings();
    await waitForShell();

    const scope = profileSection();
    const emailInput = within(scope).getByLabelText('E-posta');
    expect(emailInput).toHaveValue('d****@****.dev');
    expect(emailInput).toHaveAttribute('readonly');
    expect(within(scope).getByText('GIZLI')).toBeInTheDocument();
  });

  it('hicbir alan degismeden Kaydet kapalidir ve istek atilmaz', async () => {
    renderSettings();
    await waitForShell();

    const save = within(profileSection()).getByRole('button', { name: 'Kaydet' });
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(mockedUsers.updateProfile).not.toHaveBeenCalled();
  });

  it('yeni isimle kaydedince PUT gonderir ve basari bildirimi gosterir', async () => {
    renderSettings();
    await waitForShell();

    typeInto('Gorunen ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      expect(mockedUsers.updateProfile).toHaveBeenCalledWith({
        name: 'Deniz Yilmaz',
        handle: null,
        avatar: null,
      });
    });

    expect(await screen.findByText('Profil guncellendi')).toBeInTheDocument();
  });

  it('takma ad kaydedilince kucuk harfe cevrilip gonderilir', async () => {
    renderSettings();
    await waitForShell();

    typeInto('Takma ad', 'DenizK', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      expect(mockedUsers.updateProfile).toHaveBeenCalledWith({
        name: 'Deniz Kaya',
        handle: 'denizk',
        avatar: null,
      });
    });
  });

  it('gecersiz takma ad bicimi istemcide yakalanir, istek atilmaz', async () => {
    renderSettings();
    await waitForShell();

    typeInto('Takma ad', 'a', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(
      await within(profileSection()).findByText(
        'Takma ad yalnizca kucuk harf, rakam ve alt cizgi icerebilir (3-20 karakter)'
      )
    ).toBeInTheDocument();
    expect(mockedUsers.updateProfile).not.toHaveBeenCalled();
  });

  it('takma ad baskasi tarafindan alinmissa backend 409 hatasi alan altinda gosterilir', async () => {
    renderSettings();
    await waitForShell();

    mockedUsers.updateProfile.mockRejectedValue(
      apiError(409, 'Bu takma ad zaten kullaniliyor', { handle: 'Bu takma ad zaten kullaniliyor' })
    );

    typeInto('Takma ad', 'meraba', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(
      await within(profileSection()).findByText('Bu takma ad zaten kullaniliyor')
    ).toBeInTheDocument();
  });

  /**
   * Gorevin "gercekten veritabaninda mi" sorusunun istemci tarafindaki
   * karsiligi: ekranda gorunen deger sunucudan **geri okunan** deger olmali.
   */
  it('kaydettikten sonra kullaniciyi sunucudan geri okur', async () => {
    renderSettings();
    await waitForShell();

    // Acilistaki dogrulama cagrisi (1) sayilmasin diye sifirlaniyor.
    mockedAuth.getMe.mockClear();
    mockedAuth.getMe.mockResolvedValue({ ...deniz, name: 'Deniz Yilmaz' });

    typeInto('Gorunen ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(mockedAuth.getMe).toHaveBeenCalledTimes(1));

    // Sidebar'daki isim de tazelenen degeri gosteriyor.
    const sidebar = screen.getByRole('complementary', { name: 'Kenar cubugu' });
    expect(await within(sidebar).findByText('Deniz Yilmaz')).toBeInTheDocument();
  });

  it('sunucudan geri okuma basarisiz olursa basari bildirimi gosterilmez', async () => {
    renderSettings();
    await waitForShell();

    mockedAuth.getMe.mockRejectedValue(apiError(500, 'Sunucu hatasi'));

    typeInto('Gorunen ad', 'Deniz Yilmaz', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(within(profileSection()).getByRole('alert')).toHaveTextContent('Sunucu hatasi')
    );
    expect(screen.queryByText('Profil guncellendi')).not.toBeInTheDocument();
  });

  it('bos isimde istemci dogrulamasi takilir, ag istegi atilmaz', async () => {
    renderSettings();
    await waitForShell();

    typeInto('Gorunen ad', '   ', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(await within(profileSection()).findByText('Isim zorunlu')).toBeInTheDocument();
    expect(mockedUsers.updateProfile).not.toHaveBeenCalled();
  });

  it('backend hatasi alan altinda gosterilir', async () => {
    renderSettings();
    await waitForShell();

    mockedUsers.updateProfile.mockRejectedValue(
      apiError(400, 'Gecersiz profil bilgileri', { name: 'Isim en fazla 120 karakter olabilir' })
    );

    typeInto('Gorunen ad', 'Yeni Isim', profileSection());
    fireEvent.click(within(profileSection()).getByRole('button', { name: 'Kaydet' }));

    expect(
      await within(profileSection()).findByText('Isim en fazla 120 karakter olabilir')
    ).toBeInTheDocument();
  });

  /* ----------------------------------------------------------- fotograf */

  describe('fotograf', () => {
    it('gecerli bir PNG secilince Kaydet acilir', async () => {
      renderSettings();
      await waitForShell();

      const scope = profileSection();
      const input = within(scope).getByLabelText('Fotograf yukle', { selector: 'input' });

      fireEvent.change(input, { target: { files: [pngFile('foto.png', 1024)] } });

      await waitFor(() => {
        expect(within(scope).getByRole('button', { name: 'Kaydet' })).toBeEnabled();
      });
    });

    it('kaydedince fotograf data URI olarak gonderilir', async () => {
      renderSettings();
      await waitForShell();

      const scope = profileSection();
      const input = within(scope).getByLabelText('Fotograf yukle', { selector: 'input' });

      fireEvent.change(input, { target: { files: [pngFile('foto.png', 1024)] } });
      await waitFor(() => expect(within(scope).getByRole('button', { name: 'Kaydet' })).toBeEnabled());

      fireEvent.click(within(scope).getByRole('button', { name: 'Kaydet' }));

      await waitFor(() => {
        expect(mockedUsers.updateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ avatar: expect.stringMatching(/^data:image\/png;base64,/) })
        );
      });
    });

    it('2MB uzeri dosya reddedilir, secim uygulanmaz', async () => {
      renderSettings();
      await waitForShell();

      const scope = profileSection();
      const input = within(scope).getByLabelText('Fotograf yukle', { selector: 'input' });

      fireEvent.change(input, { target: { files: [pngFile('buyuk.png', 3 * 1024 * 1024)] } });

      expect(await within(scope).findByText('Fotograf en fazla 2MB olabilir')).toBeInTheDocument();
      expect(within(scope).getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    });

    it('desteklenmeyen dosya turu reddedilir', async () => {
      renderSettings();
      await waitForShell();

      const scope = profileSection();
      const input = within(scope).getByLabelText('Fotograf yukle', { selector: 'input' });

      fireEvent.change(input, {
        target: { files: [pngFile('belge.pdf', 1024, 'application/pdf')] },
      });

      expect(await within(scope).findByText('Yalnizca JPG veya PNG yuklenebilir')).toBeInTheDocument();
      expect(within(scope).getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    });

    it('mevcut fotografi olmayan kullanicida Kaldir butonu kapalidir', async () => {
      renderSettings();
      await waitForShell();

      expect(within(profileSection()).getByRole('button', { name: 'Kaldir' })).toBeDisabled();
    });

    it('mevcut fotografi olan kullanici Kaldir ile kaldirir ve null gonderir', async () => {
      renderSettings('/settings/profile', {
        ...deniz,
        avatar: 'data:image/png;base64,AAAA',
      });
      await waitForShell();

      const scope = profileSection();
      const removeButton = within(scope).getByRole('button', { name: 'Kaldir' });
      expect(removeButton).toBeEnabled();

      fireEvent.click(removeButton);
      fireEvent.click(within(scope).getByRole('button', { name: 'Kaydet' }));

      await waitFor(() => {
        expect(mockedUsers.updateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ avatar: null })
        );
      });
    });
  });
});

/* ================================================================== sifre */

describe('Ayarlar > sifre degistirme', () => {
  it('uc alan da sifre tipinde ve mevcut sifre ilk sirada', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    const scope = passwordSection();
    const inputs = [...scope.querySelectorAll('input')];

    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => input.type === 'password')).toBe(true);
    expect(inputs[0]).toHaveAttribute('name', 'currentPassword');
  });

  /** Gorevin asil kurali: mevcut sifre olmadan istek hic ucmamali. */
  it('mevcut sifre bosken istek atilmaz', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    submitPasswordForm({ current: '', next: 'YeniSifre123', repeat: 'YeniSifre123' });

    expect(await within(passwordSection()).findByText('Mevcut sifre zorunlu')).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre ile tekrari uyusmuyorsa istek atilmaz', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    submitPasswordForm({
      current: 'MevcutSifre123',
      next: 'YeniSifre123',
      repeat: 'YeniSifre124',
    });

    expect(await within(passwordSection()).findByText('Sifreler eslesmiyor')).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre 8 karakterden kisaysa istek atilmaz', async () => {
    renderSettings('/settings/security');
    await waitForShell();

    submitPasswordForm({ current: 'MevcutSifre123', next: 'kisa', repeat: 'kisa' });

    expect(
      await within(passwordSection()).findByText('Yeni sifre en az 8 karakter olmali')
    ).toBeInTheDocument();
    expect(mockedUsers.changePassword).not.toHaveBeenCalled();
  });

  it('yeni sifre mevcut sifreyle ayniysa istek atilmaz', async () => {
    renderSettings('/settings/security');
    await waitForShell();

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
    renderSettings('/settings/security');
    await waitForShell();

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
    renderSettings('/settings/security');
    await waitForShell();

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
    renderSettings('/settings/security');
    await waitForShell();

    mockedUsers.changePassword.mockRejectedValue(
      apiError(400, 'Mevcut sifre hatali', { currentPassword: 'Mevcut sifre hatali' })
    );

    submitPasswordForm({
      current: 'YanlisSifre999',
      next: 'YeniSifre123',
      repeat: 'YeniSifre123',
    });

    expect(await within(passwordSection()).findByText('Mevcut sifre hatali')).toBeInTheDocument();
    expect(await waitForShell()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('mevcut sifre hatasi ayni cumleyi iki kez gostermez', async () => {
    renderSettings('/settings/security');
    await waitForShell();

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
    renderSettings('/settings/security');
    await waitForShell();

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

/* ============================================================== tercihler */

describe('Ayarlar > tercihler > tema', () => {
  it('uc secenek de bir radiogroup icinde sunulur', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    const group = within(themeSection()).getByRole('radiogroup', { name: 'Tema' });
    expect(within(group).getAllByRole('radio').map((option) => option.textContent)).toEqual([
      'Acik',
      'Koyu',
      'Sistem',
    ]);
  });

  it('koyu tema secilince html uzerine dark sinifi biner ve tercih saklanir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('acik temaya donunce dark sinifi kalkar', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Acik' }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('secili secenek aria-checked ile isaretlenir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

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

  it('Sistem secenegi tercih olarak saklanir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Koyu' }));
    await waitFor(() => expect(window.localStorage.getItem(THEME_KEY)).toBe('dark'));

    fireEvent.click(within(themeSection()).getByRole('radio', { name: 'Sistem' }));
    await waitFor(() => expect(window.localStorage.getItem(THEME_KEY)).toBe('system'));
  });

  /*
    Hizli gecis sidebar'daki hesap menusune tasindi (tek tiklanabilir kart).
    Davranis ayni: bu ekrandaki uc secenekli kontrolle **ayni** tercihi
    yaziyor, iki ayri kayit olusmuyor.
  */
  it('sidebar hesap kartindaki hizli anahtar ayni tercihi degistirir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

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

    renderSettings('/settings/preferences');
    await waitForShell();

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});

describe('Ayarlar > tercihler > yakinda gelecek', () => {
  it('dil, para birimi ve bildirimler icin bir yer tutucu gosterilir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    expect(
      screen.getByRole('heading', { name: 'Dil, para birimi ve bildirimler' })
    ).toBeInTheDocument();
    expect(screen.getByText('Yakinda gelecek.')).toBeInTheDocument();
  });
});

/* =================================================================== hesap */

describe('Ayarlar > hesap', () => {
  it('tamamen bir yer tutucu gosterir', async () => {
    renderSettings('/settings/account');
    await waitForShell();

    expect(screen.getByRole('heading', { name: 'Hesap' })).toBeInTheDocument();
    expect(screen.getByText('Yakinda gelecek.')).toBeInTheDocument();
  });
});

/* ================================================================ sidebar */

describe('Sidebar > hesap karti', () => {
  it('Profili duzenle secilince Ayarlar > Profil acilir', async () => {
    renderSettings('/settings/preferences');
    await waitForShell();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Hesap menusu' }),
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Profili duzenle' }));

    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeInTheDocument();
  });

  it('takma ad varsa hesap kartinda @takma-ad gosterilir', async () => {
    renderSettings('/settings/profile', { ...deniz, handle: 'deniz' });
    await waitForShell();

    const sidebar = screen.getByRole('complementary', { name: 'Kenar cubugu' });
    expect(within(sidebar).getByText('@deniz')).toBeInTheDocument();
  });

  it('takma ad yoksa hesap kartinda e-posta gosterilir', async () => {
    renderSettings();
    await waitForShell();

    const sidebar = screen.getByRole('complementary', { name: 'Kenar cubugu' });
    expect(within(sidebar).getByText('deniz@evenup.dev')).toBeInTheDocument();
  });
});
