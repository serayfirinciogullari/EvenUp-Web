import { ImageIcon, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * AI sohbetinin **statik** onizlemesi.
 *
 * Isleyen bir sey degil: yazma alani yok, mesajlar sabit, hicbir istek
 * atilmiyor. Bu bilincli — landing'te calisan bir demo, ziyaretciyi urunun
 * yerine demonun icinde tutar ve "denedim, yeterince iyi degil" yargisini
 * uygulamaya hic girmeden verdirir.
 *
 * `Yakinda` rozeti dogrudan onizlemenin ustunde duruyor. Sohbet arayuzu henuz
 * yazilmadi; ekranda gorunen bir sey icin "bu bugun var" izlenimi birakmak,
 * kullanicinin kayit olduktan sonra ilk dakikada fark edecegi bir yaniltma
 * olurdu.
 *
 * Diyalogun kendisi urunun **ayirt edici** anini secmis durumda: fis okundu,
 * bir kalem kullaniciya ait degil, tek cumleyle cikariliyor ve pay yeniden
 * hesaplaniyor. Splitwise benzeri bir uygulamada bu, uc ekran ve alti dokunus.
 */

interface Bubble {
  from: 'user' | 'ai';
  text: string;
  /** Kullanici mesajina ilistirilmis dosya (yalnizca gorsel). */
  attachment?: string;
  /** AI mesajinin altindaki kalem listesi. */
  items?: readonly string[];
}

const CONVERSATION: readonly Bubble[] = [
  { from: 'user', text: 'Aksam marketi', attachment: 'fis-2408.jpg' },
  {
    from: 'ai',
    text: 'Fisi okudum: 4 kalem, toplam 480,00 ₺. Herkese esit boldum.',
    items: ['Kahvalti 165,00 ₺', 'Sut & ekmek 60,00 ₺', 'Temizlik 195,00 ₺', 'Atistirmalik 60,00 ₺'],
  },
  { from: 'user', text: 'Temizlik bana ait degil, sil' },
  {
    from: 'ai',
    text: 'Cikardim. Yeni toplam 285,00 ₺ — kisi basi 95,00 ₺. Ece ve Can sana 95,00 ₺ borclu.',
  },
];

const LandingChatPreview = () => (
  /*
    Kok oge `article`: icindeki `header` boylece sayfanin `banner`i sayilmiyor.
    Duz bir `div` icinde kalsaydi ekran okuyucu sayfada iki "banner" duyurur
    ve gercek ust bar ile bu sahte pencere basligi ayirt edilemezdi.
  */
  <article className="landing-chat card-solid mx-auto w-full max-w-md overflow-hidden">
    {/*
      Sahte pencere basligi: bunun bir sohbet ekrani oldugunu tek bakista
      soyluyor. `header` degil `div` — `<header>` etiketi (ic ice olmasina
      bakmayan arac ve okuyucularda) sayfanin `banner` bolgesi olarak
      duyuruluyor ve gercek ust barla karisiyordu.
    */}
    <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-rose/12">
        <Sparkles className="size-3.5 text-rose" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">Ev Arkadaslari</p>
        <p className="truncate text-xs text-ink-muted">4 kisi · EvenUp AI</p>
      </div>
      <Badge variant="outline" className="border-ink/15 text-[0.7rem] text-ink-muted">
        Yakinda
      </Badge>
    </div>

    <div className="flex flex-col gap-3 p-4">
      {CONVERSATION.map((bubble, index) => (
        <ChatBubble key={index} bubble={bubble} />
      ))}
    </div>
  </article>
);

const ChatBubble = ({ bubble }: { bubble: Bubble }) => {
  const mine = bubble.from === 'user';

  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ' +
          /*
            Kullanici balonu rose dolgu + cream metin: iki temada da okunur
            (bkz. index.css kontrast tablosu). AI balonu notr `ink/5` — konusan
            iki tarafi renkle ayirmak, ok/isim etiketinden daha hizli okunuyor.
          */
          (mine ? 'bg-rose text-cream' : 'bg-ink/5 text-ink')
        }
      >
        {bubble.attachment && (
          <span className="mb-2 flex items-center gap-2 rounded-lg bg-cream/15 px-2 py-1.5 text-xs">
            <ImageIcon className="size-3.5" aria-hidden />
            {bubble.attachment}
          </span>
        )}

        <p>{bubble.text}</p>

        {bubble.items && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-ink/10 pt-2 text-xs text-ink-muted">
            {bubble.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LandingChatPreview;
