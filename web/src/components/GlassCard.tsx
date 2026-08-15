import { ShineBorder } from '@/components/ui/shine-border';
import { cn } from '@/lib/utils';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

/**
 * Glass yuzey — projenin **imza karti**.
 *
 * `.card-glass` (index.css) yuzeyi tanimliyor; bu bilesen ona imza cerceveyi
 * (ShineBorder) ekliyor ve ikisini birbirine baglıyor.
 *
 * NEDEN AYRI BIR BILESEN
 * ----------------------
 * Parilti efektini "her yerde kullanma" kurali ancak tek bir yerden dagitilirsa
 * korunabilir. ShineBorder'i dogrudan sayfalarda cagirmak serbest birakilsaydi
 * bir sure sonra butonlarda ve form kartlarinda da belirir, imza olmaktan cikip
 * gurultuye donusurdu. Kural burada kodlanmis durumda:
 * **parilti = glass; glass = ozet/durum yuzeyi.**
 *
 * Solid yuzeyler icin karsiligi yok — bilerek. Onlar dogrudan `.card-solid`
 * sinifini kullanir, cunku ekleyecekleri bir imza ogesi yok.
 */

const SHINE_COLORS = ['#E4D2D6', '#B8A0C4', '#7A4A56'];

interface GlassCardProps extends ComponentPropsWithoutRef<'div'> {
  /** Anlamsal etiket. Grup karti `article`, ozet bloklari `section`, sayfa
   *  basligini tasiyan ozet karti `header` olabilir. */
  as?: Extract<ElementType, 'div' | 'article' | 'section' | 'header'>;
  children: ReactNode;
}

export const GlassCard = ({
  as: Tag = 'div',
  className,
  children,
  ...props
}: GlassCardProps) => (
  <Tag className={cn('card-glass overflow-hidden', className)} {...props}>
    {/*
      `pointer-events-none absolute inset-0` — ShineBorder'in kendi sinifi.
      Tiklamayi engellemez, yalnizca cerceveyi cizer. `motion-safe:` ile
      geldigi icin `prefers-reduced-motion` altinda kendiliginden duruyor.
    */}
    <ShineBorder borderWidth={1} duration={14} shineColor={SHINE_COLORS} />
    {children}
  </Tag>
);

export default GlassCard;
