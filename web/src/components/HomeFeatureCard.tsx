import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { HomeFeatureTile } from '../utils/homeCards';

/**
 * Tam genislikteki tanitim karosu (AI fis tarama).
 *
 * Zemin yine ayni aileden, yalnizca **bir ton acik**: `home-tile--feature`
 * gradyani rose'a en yakin duran karo. Ayrim renkle degil koyulukla yapiliyor;
 * boylece uc karo tek bir yuzeyin uc dilimi gibi okunuyor.
 *
 * Izgaranin son satirinda ve tam genislikte durmasi bilincli: iki kisisel karo
 * "senin durumun", bu karo "uygulamanin vaadi". Ikisi ayni satirda yan yana
 * dursaydi tanitim, bir veri karosu gibi okunurdu.
 *
 * HENUZ YAZILMAMIS OZELLIK
 * ------------------------
 * Fis tarama daha yok (`to: null`). Iki kotu secenek vardi: karoyu tiklanamaz
 * birakmak (bozuk hissettirir) ya da var olmayan bir adrese gonderip 404
 * gostermek. Ucuncusu secildi — karo normal calisiyor, bir bildirim "yakinda"
 * diyor. `Yakinda` rozeti bunu tiklamadan once de soyluyor.
 */
const HomeFeatureCard = ({ tile }: { tile: HomeFeatureTile }) => {
  const navigate = useNavigate();
  const { icon: Icon } = tile;
  const available = tile.to !== null;

  const handleActivate = () => {
    if (tile.to) {
      navigate(tile.to);
      return;
    }

    toast('Bu ozellik yakinda', {
      description: `"${tile.title}" uzerinde calisiyoruz.`,
    });
  };

  return (
    /*
      Karonun tamami bir `<button>`: icinde ikinci bir etkilesimli oge yok,
      dolayisiyla grup kartindaki "stretched link" karmasikligina gerek
      kalmiyor. Buton oldugu icin klavyeyle de erisilir.
    */
    <button
      type="button"
      onClick={handleActivate}
      aria-label={`${tile.title} — ${available ? tile.cta : 'yakinda'}`}
      className="home-tile home-tile--feature group flex w-full items-center gap-4 p-5 text-left sm:p-6"
    >
      <span className="home-tile__icon flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="home-tile__title flex flex-wrap items-center gap-2 text-base leading-snug font-semibold">
          {tile.title}
          {!available && <span className="home-tile__badge">Yakinda</span>}
        </span>
        <span className="home-tile__caption mt-1 block text-sm">{tile.description}</span>
      </span>

      {/* Eylem metni dar ekranda gizleniyor; ok kaliyor, yani yon kaybolmuyor. */}
      <span className="home-tile__cta hidden shrink-0 items-center gap-1.5 text-sm font-medium sm:inline-flex">
        {tile.cta}
        {/* Ok hover'da hafifce ilerliyor: yon duygusu, dikkat cekmeden. */}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>

      <ArrowRight className="home-tile__cta size-4 shrink-0 sm:hidden" aria-hidden />
    </button>
  );
};

export default HomeFeatureCard;
