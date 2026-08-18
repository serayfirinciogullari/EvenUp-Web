import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import RouteFallback from '@/components/RouteFallback';
import { Button } from '@/components/ui/button';
import { getErrorMessage, isNetworkError } from '../api/client';
import groupsApi from '../api/groups';
import { clearPendingInvite, savePendingInvite } from '../api/pendingInvite';
import useAuth from '../hooks/useAuth';

/**
 * Davet linkinin acildigi sayfa: `/join/:inviteCode`.
 *
 * Bu bir ekran degil, bir **gecis**. Kullanici burada bir sey doldurmuyor;
 * sayfa yalnizca "kimsin?" sorusunun cevabina gore iki yoldan birini isletiyor
 * ve bittiginde grup detayina birakip cekiliyor.
 *
 * NEDEN GUARD ALTINDA DEGIL (App.tsx: `/` ile ayni seviyede, halka acik)
 * ---------------------------------------------------------------------
 * `ProtectedRoute` altina konsaydi giris yapmamis ziyaretci `/login`e duser ve
 * **kod adres cubugundan silinirdi**; giris bittiginde uygulamada, davetle
 * hicbir baglantisi kalmamis halde olurdu. Oysa davet linkine tiklayan kisinin
 * cogunun hesabi yok — akisin varsayilan durumu bu.
 *
 * Bu yuzden yonlendirmeyi sayfa kendisi yapiyor ve **kodu yaninda tasiyor**:
 *   - `state.from` ile (giris sonrasi geri donus, ProtectedRoute ile ayni desen)
 *   - ve `savePendingInvite` ile (kayit/giris ekranlari arasinda gezinirken
 *     router state'i kaybolabilir, bkz. api/pendingInvite.ts)
 *
 * Hedef `/register`, `/login` degil: linke tiklayan cogunlukla yeni kullanici.
 * Hesabi olan icin kayit ekraninin altinda "Giris yapin" baglantisi duruyor ve
 * iki ekran arasinda gecis kodu kaybettirmiyor.
 *
 * ISTEK NEDEN BURADA TEKRARLANIYOR, GIRIS EKRANINDA DEGIL
 * -------------------------------------------------------
 * Kayit basarili olunca kullanici buraya **geri gonderiliyor** ve `POST
 * /groups/join/:code` bu bilesende atiliyor. Alternatif — istegi
 * `RegisterPage`in icinde atmak — katilma mantigini iki yere (buraya ve giris
 * formuna) kopyalar, hata gosterimini de ikiye bolerdi.
 */

type JoinState =
  /** Oturum acik, istek ucuyor. */
  | { status: 'joining' }
  /** Gecersiz/dolu kod ya da ag hatasi: mesaj ekranda, sayfa ayakta. */
  | { status: 'error'; message: string; offline: boolean };

const JoinPage = () => {
  // Rota kaliba gore parametre hep var; tip tarafinda `string | undefined`.
  const { inviteCode = '' } = useParams<{ inviteCode: string }>();
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<JoinState>({ status: 'joining' });

  /**
   * Hangi kod icin istek atildigini tutar. Iki isi var:
   *   - React 19 `StrictMode` gelistirmede efektleri iki kez calistirir; ref
   *     olmasaydi her acilista iki `POST` giderdi.
   *   - "Tekrar dene" ayni kodu bilincli olarak yeniden denerken bu ref elle
   *     sifirlaniyor, yani otomatik deneme ile elle deneme ayni yoldan geciyor.
   */
  const attemptedCode = useRef<string | null>(null);

  const runJoin = useCallback(async () => {
    setState({ status: 'joining' });

    // Istek ustlenildi: kodun tek kaynagi artik adres cubugu. Depodaki kopya
    // burada dusuyor, aksi halde sonraki, davetle ilgisi olmayan bir girisi
    // kacirirdi (bkz. api/pendingInvite.ts).
    clearPendingInvite();

    try {
      const { group, already_member: alreadyMember } = await groupsApi.joinGroup(inviteCode);

      // Zaten uye olmak hata degil (backend 200 doner): linke ikinci kez
      // tiklamak beklenen bir durum. Yine de sessiz kalinmiyor — kullanici
      // kendini bir anda grup detayinda bulmasin, ne oldugunu okusun.
      if (alreadyMember) {
        toast.info(`${group.name} grubunun zaten uyesisin`);
      } else {
        toast.success(`${group.name} grubuna katildin`);
      }

      /*
        `replace`: davet adresi gecmiste birakilmiyor. Kalsaydi grup detayinda
        "geri" demek katilma sayfasini yeniden acar ve istek bir kez daha
        atilirdi (zararsiz ama anlamsiz bir tur).

        Grup listesi tazeligi kendiliginden geliyor: `AppDataProvider`
        `ProtectedRoute` altinda ve bu sayfa onun disinda, yani /groups/:id'ye
        gecisle birlikte mount olup listeyi bastan cekiyor. Yeni grup hem
        sidebar'da hem Gruplarim'da gorunuyor.
      */
      navigate(`/groups/${group.id}`, { replace: true });
    } catch (caught) {
      setState({
        status: 'error',
        message: getErrorMessage(caught, 'Gruba katilinamadi'),
        offline: isNetworkError(caught),
      });
    }
  }, [inviteCode, navigate]);

  useEffect(() => {
    // Oturum dogrulanirken karar verilmez: token gecerliyken bile ilk
    // render'da kullanici yok gorunur (bkz. AuthContext'teki uc durum).
    if (status === 'loading') {
      return;
    }

    if (status === 'anonymous') {
      savePendingInvite(inviteCode);
      navigate('/register', { replace: true, state: { from: location } });
      return;
    }

    if (attemptedCode.current === inviteCode) {
      return;
    }

    attemptedCode.current = inviteCode;
    void runJoin();
  }, [inviteCode, location, navigate, runJoin, status]);

  const retry = () => {
    attemptedCode.current = inviteCode;
    void runJoin();
  };

  if (state.status === 'error') {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-4 text-center">
        <h1 className="text-2xl">Gruba katilinamadi</h1>
        {/*
          Backend'in kendi mesaji ("Davet kodu gecersiz veya suresi dolmus"),
          jenerik metin degil. Gecersiz kod, suresi dolmus kod ve kotasi dolmus
          kod backend'de bilincli olarak ayni 404'u doner (grup varligini
          sizdirmamak icin); arayuz de bu durumlari ayirmaya calismaz.
        */}
        <p className="max-w-sm text-sm text-ink-muted" role="alert">
          {state.message}
        </p>
        {/*
          Yol gosteren cumle yalnizca **sunucu reddettiginde**: ag hatasinda
          "yeni bir davet linki iste" demek, sorunu davette olmadigi halde
          kullaniciyi grubun sahibine gonderirdi.
        */}
        {!state.offline && (
          <p className="max-w-sm text-sm text-ink-muted">
            Linkin suresi dolmus ya da kullanim hakki bitmis olabilir. Grubun
            sahibinden yeni bir davet linki isteyebilirsin.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {/* Ag hatasinda asil ise yarayan dugme bu; digerinde de zararsiz. */}
          <Button onClick={retry}>Tekrar dene</Button>
          <Button asChild variant="outline">
            <Link to="/groups">Gruplarima don</Link>
          </Button>
        </div>
      </section>
    );
  }

  // Giris yapmamis kullanici bu kareyi yalnizca bir an goruyor (yonlendirme
  // efektin icinde). Yine de dogru metni goruyor: "gruba ekleniyorsun" deyip
  // ardindan kayit formu acmak, olmayan bir islemi bildirmek olurdu.
  const label =
    status === 'anonymous' ? 'Kayit ekranina yonlendiriliyorsun...' : 'Gruba ekleniyorsun...';

  return <RouteFallback label={label} />;
};

export default JoinPage;
