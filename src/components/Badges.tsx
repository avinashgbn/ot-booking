import type { UserRole } from '@/types';
import { roleBadgeClass, roleLabel, roleDotClass, anaesthetistBadgeClass, statusBadgeClass, statusLabel } from '@/lib/utils';

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(role)}`}>
      {roleLabel(role)}
    </span>
  );
}

export function SurgeonBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-tint text-brand">
      Surgeon
    </span>
  );
}

export function AnaesthetistBadge() {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${anaesthetistBadgeClass()}`}>
      Anaesthetist
    </span>
  );
}

export function StatusBadge({ status, cancelAck }: { status: string; cancelAck?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusBadgeClass(status, cancelAck)}`}
    >
      {statusLabel(status, cancelAck)}
    </span>
  );
}

// Compact "role dot + name" treatment used in place of a full pill wherever a
// role tag is repeated next to many names (case cards, cascade lists,
// directory rows): a small uppercase caption with a coloured dot, surgeon =
// brand, anaesthetist = ok.
export function RoleDot({ role }: { role: 'surgeon' | 'anaesthetist' }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
      <span className={`w-1.5 h-1.5 rounded-full ${roleDotClass(role)}`} />
      {role === 'surgeon' ? 'Surgeon' : 'Anaesthetist'}
    </span>
  );
}

export function RoleName({ role, name }: { role: 'surgeon' | 'anaesthetist'; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${roleDotClass(role)}`} />
      <span className="font-semibold text-ink">{name}</span>
    </span>
  );
}
