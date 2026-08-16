import { useCallback, useRef, useState } from 'react';

import { getErrorDetails, getErrorMessage } from '../api/client';
import { hasErrors } from '../utils/validation';

import type { FieldErrors } from '../utils/validation';
// React 19 tiplerinde `FormEvent` deprecated; `onSubmit` artik `SubmitEvent`
// bekliyor. Global DOM `SubmitEvent`'i degil, React'inkini aliyoruz.
import type { SubmitEvent } from 'react';

/**
 * Login ve register formlarinin ortak durumu.
 *
 * Iki sayfa ayni dort seyi yapiyor: alan degerlerini tutmak, gonderim oncesi
 * dogrulamak, istek sirasinda kilitlemek ve backend hatasini okumak. Ayri ayri
 * yazilsalardi asagidaki cift-gonderim korumasi iki yerde tekrarlanir ve biri
 * duzeltilirken digeri unutulabilirdi.
 */

interface UseAuthFormOptions<V> {
  initialValues: V;
  /** Istemci tarafi kontrol. Bos nesne donerse istek atilir. */
  validate: (values: V) => FieldErrors;
  onSubmit: (values: V) => Promise<void>;
  /** Backend mesaj dondurmezse gosterilecek metin. */
  fallbackMessage: string;
}

interface UseAuthFormResult<V> {
  values: V;
  setField: (field: keyof V & string, value: string) => void;
  fieldErrors: FieldErrors;
  formError: string | null;
  pending: boolean;
  handleSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  /**
   * Formu baslangic degerlerine dondurur (2.6).
   *
   * Login/register'da gerekmiyordu: basarili gonderim sayfayi degistiriyor.
   * Ayarlar sayfasi yerinde kaliyor ve sifre alanlarinin ekranda **dolu
   * kalmasi** hem yaniltici (islem bitti) hem gereksiz bir maruziyet.
   */
  reset: () => void;
}

export const useAuthForm = <V extends Record<string, string>>({
  initialValues,
  validate,
  onSubmit,
  fallbackMessage,
}: UseAuthFormOptions<V>): UseAuthFormResult<V> => {
  const [values, setValues] = useState<V>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * CIFT GONDERIM KORUMASI — neden `useState` degil `useRef`
   * --------------------------------------------------------
   * Butonun `disabled` olmasi tek basina yeterli degil: `disabled` bir sonraki
   * render'da uygulanir, oysa iki hizli tik (ya da Enter'a basili tutmak) ayni
   * render doneminde iki submit olayi uretebilir. O anda `pending` state'i
   * hala `false` gorunur — closure eski degeri tasir.
   *
   * `useRef` senkron gunceller: ikinci olay handler'a girdigi anda `true`dur ve
   * istek daha basta elenir. Sonuc: sunucuya iki `POST /auth/register`
   * gitmez — ki gitseydi ikincisi 409 alir ve kullanici basarili kaydinin
   * ardindan "bu e-posta zaten kayitli" hatasi gorurdu.
   */
  const inFlight = useRef(false);

  /**
   * `initialValues` ref'te tutuluyor: cagiran bilesen nesneyi her render'da
   * yeniden olusturuyor olabilir. Dogrudan bagimlilik yapilsaydi `reset`
   * kimligi her render'da degisir ve onu `useEffect`/`useCallback` icinde
   * kullanan her yer gereksiz yere yeniden calisirdi.
   */
  const initial = useRef(initialValues);

  const reset = useCallback(() => {
    setValues(initial.current);
    setFieldErrors({});
    setFormError(null);
  }, []);

  const setField = useCallback((field: keyof V & string, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));

    // Kullanici duzeltmeye baslar baslamaz o alanin hatasi kalkar; kirmizi
    // metnin duzeltilmis bir alanin altinda durmasi yanlis bilgi verir.
    setFieldErrors((previous) => {
      if (!previous[field]) {
        return previous;
      }

      const next = { ...previous };
      delete next[field];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (inFlight.current) {
        return;
      }

      const validationErrors = validate(values);

      if (hasErrors(validationErrors)) {
        // Istemci kontrolu takildi: ag istegi hic atilmaz. Kazanc, kullanicinin
        // cevabi gidis-donus beklemeden gormesi.
        setFieldErrors(validationErrors);
        setFormError(null);
        return;
      }

      inFlight.current = true;
      setFieldErrors({});
      setFormError(null);
      setPending(true);

      void onSubmit(values)
        .catch((caught: unknown) => {
          // Jenerik "bir hata olustu" degil, backend'in kendi mesaji:
          // "E-posta veya sifre hatali", "Bu e-posta zaten kayitli"...
          setFormError(getErrorMessage(caught, fallbackMessage));
          // Backend alan bazli hata dondurduyse (400 + details) ilgili alanin
          // altinda gosterilir.
          setFieldErrors(getErrorDetails(caught));
        })
        .finally(() => {
          inFlight.current = false;
          setPending(false);
        });
    },
    [fallbackMessage, onSubmit, validate, values]
  );

  return { values, setField, fieldErrors, formError, pending, handleSubmit, reset };
};

export default useAuthForm;
