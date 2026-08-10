export type UserRole = 'superadmin' | 'practice_admin' | 'secretary' | 'surgeon';

export type BookingStatus = 'pending' | 'cascade_running' | 'confirmed' | 'cancelled' | 'all_declined';

export type CascadeMode = 'sequential' | 'simultaneous';

export type CascadeOutcome = 'pending' | 'accepted' | 'declined' | 'expired' | 'released';

export type WhatsAppDirection = 'outbound' | 'inbound';

export type WhatsAppMessageType =
  | 'request'
  | 'confirmation'
  | 'cancellation'
  | 'cancellation_ack'
  | 'invalid_reply'
  | 'release'
  | 'reschedule_request'
  | 'reschedule';

export type AnaesthesiaType = 'up_to_anaesthetist' | 'GA' | 'regional' | 'sedation';

export interface Practice {
  id: string;
  name: string;
  created_at: string;
  admin_user_id: string | null;
}

export interface User {
  id: string;
  practice_id: string | null;
  full_name: string;
  phone: string;
  role: UserRole;
  pin_hash: string | null;
  active: boolean;
  archived: boolean;
  invite_token: string | null;
  invite_expires_at: string | null;
  created_at: string;
}

export interface PracticeSurgeon {
  id: string;
  practice_id: string;
  surgeon_id: string;
  created_at: string;
  surgeon?: User;
}

export interface Anaesthetist {
  id: string;
  full_name: string;
  phone: string;
  hospitals: string[];
  active: boolean;
  created_at: string;
}

export interface AnaesthetistPreference {
  id: string;
  surgeon_id: string;
  anaesthetist_id: string;
  rank: number;
  created_at: string;
  anaesthetist?: Anaesthetist;
}

export interface Booking {
  id: string;
  practice_id: string;
  surgeon_id: string;
  secretary_id: string | null;
  patient_initials: string;
  patient_age: number;
  procedure: string;
  hospital_clinic: string;
  ot_location: string;
  surgery_date: string;
  surgery_time: string;
  duration_hours: number;
  anaesthesia_preferences: AnaesthesiaType[];
  cascade_mode: CascadeMode;
  status: BookingStatus;
  confirmed_anaesthetist_id: string | null;
  confirmed_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_acknowledged: boolean;
  cancel_acknowledged_at: string | null;
  rescheduled_at: string | null;
  rescheduled_by: string | null;
  secretary_phone: string | null;
  created_at: string;
  surgeon?: User;
  secretary?: User;
  confirmed_anaesthetist?: Anaesthetist;
}

export interface CascadeStep {
  id: string;
  booking_id: string;
  anaesthetist_id: string;
  rank: number;
  notified_at: string | null;
  expires_at: string | null;
  outcome: CascadeOutcome;
  responded_at: string | null;
  cascade_context: 'reschedule' | null;
  created_at: string;
  anaesthetist?: Anaesthetist;
}

export interface WhatsAppLog {
  id: string;
  booking_id: string | null;
  anaesthetist_id: string | null;
  direction: WhatsAppDirection;
  message_type: WhatsAppMessageType | null;
  body: string | null;
  reply: string | null;
  to_phone: string | null;
  from_phone: string | null;
  sent_at: string;
  replied_at: string | null;
}

export interface SuperadminAudit {
  id: string;
  action: string | null;
  target_practice_id: string | null;
  target_user_id: string | null;
  notes: string | null;
  performed_at: string;
}
