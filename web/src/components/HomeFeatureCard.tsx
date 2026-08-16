import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';

import type { FeatureCardModel } from '../utils/homeCards';

/**
 * Ozellik tanitim karti — **solid** yuzey.
 *
 * `HomeStatCard` glass, burasi solid. Kural index.css'te: glass = ozet/durum,
 * solid = islem/veri yuzeyi. Bir tanitim karti bir **davet**, bir durum ozeti
 * degil; parilti (ShineBorder) burada bilerek yok — imza ogesi her yerde
 * kullanilirsa imza olmaktan cikar.
 *
 * Vurgu rengi rose: ikon dolgusu ve eylem satiri. Iki kanal kurali geregi rose
 * yalnizca **etkilesimli** ogede; kartin basligi yine duz `ink`.
 *
 * HENUZ YAZILMAMIS OZELLIKLER
 * ---------------------------
 * Uc tanitim kartinin ucunun de hedef ekrani su an yok (`to: null`). Iki kotu
 * secenek vardi: karti tiklanamaz birakmak (bozuk hissettirir) ya da var
 * olmayan bir adrese gonderip 404 gostermek. Ucuncusu secildi — kart normal
 * calisiyor, bir bildirim "yakinda" diyor. `Yakinda` rozeti bunu tiklamadan
 * once de soyluyor, yani kimse bosuna tiklamiyor.
 */
const HomeFeatureCard = ({ card }: { card: FeatureCardModel }) => {
  const navigate = useNavigate();
  const { icon: Icon } = card;
  const available = card.to !== null;

  const handleActivate = () => {
    if (card.to) {
      navigate(card.to);
      return;
    }

    toast('Bu ozellik yakinda', {
      description: `"${card.title}" uzerinde calisiyoruz.`,
    });
  };

  return (
    /*
      Kartin tamami bir `<button>`: tanitim kartinin icinde ikinci bir
      etkilesimli oge yok, dolayisiyla grup kartindaki "stretched link"
      karmasikligina gerek kalmiyor. Buton oldugu icin klavyeyle de erisilir
      ve `aria-label` tek bir anlasilir cumle veriyor.
    */
    <button
      type="button"
      onClick={handleActivate}
      aria-label={`${card.title} — ${available ? card.cta : 'yakinda'}`}
      className="home-card home-card--feature card-solid group flex h-full w-full flex-col gap-3 p-5 text-left transition-colors hover:border-rose/30 hover:bg-rose/4"
    >
      <header className="flex items-start justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose/10">
          <Icon className="size-4 text-rose" aria-hidden />
        </span>

        {!available && (
          <Badge variant="outline" className="shrink-0 border-ink/15 text-ink-muted">
            Yakinda
          </Badge>
        )}
      </header>

      {/* Baslik `ink` + Fraunces degil: kart basligi sayfa basligi degil, bu
          yuzden normal govde tipografisi. Otorite kanali basliklara ayrilmis. */}
      <h3 className="home-card__title text-base leading-snug font-semibold text-ink">
        {card.title}
      </h3>

      <p className="home-card__desc text-sm text-ink-muted">{card.description}</p>

      <span className="home-card__cta mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-rose">
        {card.cta}
        {/* Ok hover'da hafifce ilerliyor: yon duygusu, dikkat cekmeden. */}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </button>
  );
};

export default HomeFeatureCard;
