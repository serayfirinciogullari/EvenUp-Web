import { Input } from '@/components/ui/input';

import type { ComponentProps } from 'react';

/**
 * Yalnizca rakam ve TEK bir ondalik ayiraci (',' ya da '.') kabul eden tutar
 * girdisi. Harcama formundaki "Tutar" ve "ozel tutar" bolusme alanlari bunu
 * paylasiyor — ayni kisitlama iki yerde ayri ayri yazilmasin diye.
 *
 * NEDEN onChange'DE REDDEDIYOR, onKeyDown'DA DEGIL
 * ---------------------------------------------------
 * `onKeyDown` yapistirma (paste), otomatik doldurma ve IME/mobil klavyeler
 * icin guvenilir degil — bunlarin hicbiri tek tek tus basimi uretmez.
 * `onChange` her zaman istegin **son degerini** verir; bu deger sekle
 * uymuyorsa state hic guncellenmiyor. Kontrollu input oldugu icin bunun
 * gorunur karsiligi "hicbir sey olmadi" hissi: DOM degeri React'in bir
 * sonraki render'inda zaten eski degere geri donuyor — ayrica bir hata
 * mesaji gostermeye gerek yok, gecersiz karakter zaten hic yazilamiyor.
 *
 * NEDEN BASAMAK SAYISINI SINIRLAMIYOR
 * -------------------------------------
 * Bu bilesenin isi yalnizca **yazilamayan** karakterleri (harf, ikinci
 * ondalik ayiraci, eksi isareti...) engellemek. Iki ondalik basamak kurali
 * zaten `utils/money.ts` -> `parseInputToCents`te var (backend'in
 * NUMERIC(10,2)'siyle ayni); burada tekrarlanmiyor.
 */
const CURRENCY_PATTERN = /^\d*[.,]?\d*$/;

export interface CurrencyInputProps
  extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: string;
  onValueChange: (value: string) => void;
}

export const CurrencyInput = ({ value, onValueChange, ...props }: CurrencyInputProps) => (
  <Input
    {...props}
    inputMode="decimal"
    value={value}
    onChange={(event) => {
      const next = event.target.value;

      if (CURRENCY_PATTERN.test(next)) {
        onValueChange(next);
      }
    }}
  />
);

export default CurrencyInput;
