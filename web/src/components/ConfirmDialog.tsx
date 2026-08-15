import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Onay modali — **solid** yuzey.
 *
 * NEDEN GENEL BIR BILESEN
 * -----------------------
 * "Emin misiniz?" akisinin uc parcasi var ve ucu de her kullanimda yeniden
 * yazilmaya musait: odagin modala gitmesi, bekleyen istekte butonlarin
 * kilitlenmesi, hatanin modal **icinde** gosterilip modalin acik kalmasi.
 * Ucuncusu en kolay atlanani: modal kapanip hata baska bir yerde belirse
 * kullanici hangi satir icin hata aldigini bilemez.
 *
 * NEDEN GERI ALINABILIR BIR ISLEM ICIN DE ONAY VAR
 * ------------------------------------------------
 * Kullaniciyi devre disi birakmak geri alinabilir (`enable` bir tik uzakta) ama
 * **sonucu aninda ve baskasinin uzerinde**: o kisi bir sonraki girisinde
 * "E-posta veya sifre hatali" gorur ve nedenini bilemez. Yanlislikla tiklanmis
 * bir satir, karsi tarafta gercek bir kesinti demek. Onay adimi burada veriyi
 * degil, **yanlis satira tiklamayi** engelliyor.
 */

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** `destructive` kirmizi buton verir; geri alinabilir islemlerde `default`. */
  tone?: 'default' | 'destructive';
  pending?: boolean;
  /** Istek basarisiz olduysa modal acik kalir ve hata burada gosterilir. */
  error?: string | null;
  onConfirm: () => void;
}

const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  pending = false,
  error = null,
  onConfirm,
}: ConfirmDialogProps) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      // Istek ucarken kapanmasin: kullanici sonucu gormeden modal kaybolursa
      // islemin gerceklesip gerceklesmedigi belirsiz kalir.
      if (!pending) {
        onOpenChange(next);
      }
    }}
  >
    <DialogContent className="modal card-solid sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {error && (
        <p
          className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <DialogFooter className="modal__actions">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Vazgec
        </Button>
        <Button
          type="button"
          variant={tone === 'destructive' ? 'destructive' : 'default'}
          onClick={onConfirm}
          disabled={pending}
          autoFocus
        >
          {pending ? 'Uygulaniyor...' : confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
