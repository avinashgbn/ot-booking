import type { UserRole } from '@/types';
import { roleBadgeClass, roleLabel, anaesthetistBadgeClass, statusBadgeClass, statusLabel } from '@/lib/utils';

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(role)}`}>
      {roleLabel(role)}
    </span>
  );
}

export function SurgeonBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#EEEDFE] text-[#3C3489]">
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
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClass(status, cancelAck)}`}
      style={{ borderRadius: 20 }}
    >
      {statusLabel(status, cancelAck)}
    </span>
  );
}
