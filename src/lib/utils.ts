import type { UserRole } from '@/types';

export function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case 'surgeon':
      return 'bg-[#EEEDFE] text-[#3C3489]';
    case 'secretary':
      return 'bg-[#EEEDFE] text-[#3C3489]';
    case 'practice_admin':
      return 'bg-[#EEEDFE] text-[#3C3489]';
    case 'superadmin':
      return 'bg-blue-100 text-blue-800';
  }
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'surgeon':
      return 'Surgeon';
    case 'secretary':
      return 'Secretary';
    case 'practice_admin':
      return 'Admin';
    case 'superadmin':
      return 'Superadmin';
  }
}

export function anaesthetistBadgeClass(): string {
  return 'bg-[#E1F5EE] text-[#085041]';
}

export function statusBadgeClass(status: string, cancelAck?: boolean): string {
  if (status === 'confirmed') return 'bg-green-100 text-green-700';
  if (status === 'cascade_running') return 'bg-amber-100 text-amber-700';
  if (status === 'all_declined') return 'bg-red-100 text-red-700';
  if (status === 'cancelled') {
    if (cancelAck === false) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  }
  if (status === 'pending') return 'bg-gray-100 text-gray-600';
  return 'bg-gray-100 text-gray-600';
}

export function statusLabel(status: string, cancelAck?: boolean): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'cascade_running') return 'Cascade running';
  if (status === 'all_declined') return 'All declined';
  if (status === 'cancelled') {
    if (cancelAck === false) return 'Action needed';
    return 'Cancelled';
  }
  if (status === 'pending') return 'Pending';
  return status;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${ampm}`;
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function normalisePhone(phone: string): string {
  let cleaned = phone.replace(/[\s-]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('65')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('8') || cleaned.startsWith('9')) {
      cleaned = '+65' + cleaned;
    }
  }
  return cleaned;
}

export function anaesthesiaLabel(pref: string): string {
  switch (pref) {
    case 'up_to_anaesthetist': return 'Up to anaesthetist';
    case 'GA': return 'General anaesthesia (GA)';
    case 'regional': return 'Regional anaesthesia';
    case 'sedation': return 'Sedation';
    default: return pref;
  }
}

export function countdown(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
