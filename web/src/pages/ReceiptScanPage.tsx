import { ScanLine } from 'lucide-react';

/**
 * Fis Tara — henuz yazilmamis ozellik icin kendi sekmesi ve adresi.
 *
 * Eskiden Home'daki tanitim karosu bir bildirimle ("Bu ozellik yakinda")
 * idare ediyordu; artik sidebar'da gercek bir sekme oldugu icin tiklayinca
 * bir yere **gitmesi** gerekiyor — bildirim gosterip kullaniciyi oldugu
 * sayfada birakmak, bir sekmenin davranisi olamazdi. Bu yuzden burasi kendi
 * rotasi (`/fis-tara`) olan, tamamen islevsiz bir yer tutucu: `docs/decisions/3.16-fis-tara-sayfasi.md`.
 *
 * Var olmayan bir seyi calisiyormus gibi gostermek yerine (sahte bir yukleme
 * alani, tiklaninca hicbir sey yapmayan bir buton) durum acikca soyleniyor —
 * `HomeFeatureCard`in "Yakinda" rozetiyle ayni ilke.
 */
const ReceiptScanPage = () => (
  <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <span className="flex size-12 items-center justify-center rounded-full bg-rose/10">
      <ScanLine className="size-6 text-rose" aria-hidden />
    </span>

    <h1 className="text-xl">Yakinda</h1>

    <p className="max-w-sm text-sm text-ink-muted">
      Fis fotografini yukle, kalemleri ve tutari AI cikarsin, sen yalnizca onayla.
    </p>
  </section>
);

export default ReceiptScanPage;
