import {
  ACTIVITY_BADGE_TONE,
  ACTIVITY_BADGES,
  ACTIVITY_BADGE_TITLES,
  activitySentence,
} from '../utils/activity';
import { formatTime } from '../utils/datetime';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { ActivityEvent } from '../types/models';

/**
 * Aktivite akisinin tek satiri — Aktivite sayfasinda dogdu, Home > "Son
 * hareketler" de **ayni** bileseni kullaniyor (bkz.
 * docs/decisions/3.15-home-son-hareketler.md). Ikinci bir kopya yazilmadi;
 * rozet kisaltmalari (EKL/DUZ/ONY/RED), cumle kurulumu (`activitySentence`,
 * "Sen" ayrimi dahil) ve ton renkleri tek yerde.
 */

const ActivityRow = ({
  event,
  currentUserId,
}: {
  event: ActivityEvent;
  currentUserId: string;
}) => {
  const cents = parseAmountToCents(event.amount) ?? 0;

  return (
    <li className="activity-row card-solid flex items-start justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`activity-row__badge mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-semibold tracking-wide ${ACTIVITY_BADGE_TONE[event.kind]}`}
          title={ACTIVITY_BADGE_TITLES[event.kind]}
        >
          {ACTIVITY_BADGES[event.kind]}
        </span>

        <div className="min-w-0">
          <p className="activity-row__sentence text-sm font-medium text-ink">
            {activitySentence(event, currentUserId)}
          </p>
          <p className="activity-row__meta mt-0.5 text-xs text-ink-muted">
            {event.group_name}
            {' · '}
            <time dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time>
          </p>
        </div>
      </div>

      <p className="activity-row__amount shrink-0 text-sm font-semibold text-ink">
        {formatCents(cents)}
      </p>
    </li>
  );
};

export default ActivityRow;
