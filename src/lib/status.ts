// Single mapping from booking/case state to a status-token group, so the
// badge, the case-card severity stripe, and the case-detail header all agree
// on what colour a given state is — a case's status should be legible from
// colour alone.
export type StatusGroup = 'ok' | 'warn' | 'crit' | 'neut';

export function statusGroup(status: string, cancelAck?: boolean): StatusGroup {
  if (status === 'confirmed') return 'ok';
  if (status === 'cascade_running') return 'warn';
  if (status === 'all_declined') return 'warn';
  if (status === 'cancelled') return 'crit';
  void cancelAck; // cancelled is crit either way; label text still distinguishes ack state
  return 'neut'; // pending and any other/unrecognised state
}

// Cascade-step outcomes share the same four-way palette: an accept reads as
// ok, a live pending countdown as warn, everything else (declined, expired,
// released, not-yet-notified) as neutral.
export function stepOutcomeGroup(outcome: string, notified: boolean): StatusGroup {
  if (outcome === 'accepted') return 'ok';
  if (outcome === 'pending' && notified) return 'warn';
  return 'neut';
}

const BADGE_CLASSES: Record<StatusGroup, string> = {
  ok: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-warn-bg text-warn border-warn-line',
  crit: 'bg-crit-bg text-crit border-crit-line',
  neut: 'bg-neut-bg text-neut border-neut-line',
};

const STRIPE_CLASSES: Record<StatusGroup, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
  neut: 'bg-neut',
};

const TEXT_CLASSES: Record<StatusGroup, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  crit: 'text-crit',
  neut: 'text-neut',
};

export function statusGroupBadgeClass(group: StatusGroup): string {
  return BADGE_CLASSES[group];
}

export function statusGroupStripeClass(group: StatusGroup): string {
  return STRIPE_CLASSES[group];
}

export function statusGroupTextClass(group: StatusGroup): string {
  return TEXT_CLASSES[group];
}
