import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDate, formatTime, countdown } from '@/lib/utils';
import { statusGroup, statusGroupStripeClass, stepOutcomeGroup, statusGroupTextClass } from '@/lib/status';
import { RoleName, StatusBadge } from '@/components/Badges';
import type { Booking, CascadeStep, User, Anaesthetist } from '@/types';
import {
  Calendar, Clock, MapPin, ChevronDown, ChevronUp, Phone,
  AlertTriangle, CheckCircle, Send, XCircle, RotateCw, FileText, Plus, Settings
} from 'lucide-react';

interface BookingWithRelations extends Booking {
  surgeon?: User;
  confirmed_anaesthetist?: Anaesthetist;
}

interface BookingCardProps {
  booking: BookingWithRelations;
  cascadeSteps: CascadeStep[];
  onResendConfirmation: (booking: Booking) => void;
  onCancelCase: (booking: Booking) => void;
  onResendCancellation: (booking: Booking) => void;
  onMarkAcknowledged: (booking: Booking) => void;
}

export function BookingCard({
  booking, cascadeSteps, onResendConfirmation, onCancelCase, onResendCancellation, onMarkAcknowledged,
}: BookingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const hasActive = cascadeSteps.some((s) => s.outcome === 'pending' && s.expires_at && new Date(s.expires_at) > new Date());
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [cascadeSteps, tick]);

  const unacknowledged = booking.status === 'cancelled' && !booking.cancel_acknowledged;
  const confirmedAnaesthetist = booking.confirmed_anaesthetist;
  const sortedSteps = [...cascadeSteps].sort((a, b) => a.rank - b.rank);
  const stripeClass = statusGroupStripeClass(statusGroup(booking.status, booking.cancel_acknowledged));

  return (
    <div className="bg-surface border border-line rounded shadow-sm overflow-hidden flex">
      <div className={`w-1 flex-shrink-0 ${stripeClass}`} />
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left p-4 hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ink truncate">
                {booking.patient_initials}, {booking.patient_age} yrs · {booking.procedure}
              </h3>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted">
                <RoleName role="surgeon" name={`Dr ${booking.surgeon?.full_name || 'Unknown'}`} />
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(booking.surgery_date)} · {formatTime(booking.surgery_time)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {booking.duration_hours} hrs
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {booking.hospital_clinic} · {booking.ot_location}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={booking.status} cancelAck={booking.cancel_acknowledged} />
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-2" /> : <ChevronDown className="w-4 h-4 text-muted-2" />}
            </div>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-line p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-2">Surgeon</span>
                <p className="mt-1"><RoleName role="surgeon" name={`Dr ${booking.surgeon?.full_name || 'Unknown'}`} /></p>
              </div>
              <div>
                <span className="text-muted-2">Anaesthetist</span>
                <p className="mt-1">
                  {confirmedAnaesthetist ? (
                    <RoleName role="anaesthetist" name={`Dr ${confirmedAnaesthetist.full_name}`} />
                  ) : (
                    <span className="text-muted-2">Not confirmed</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-2">Anaesthesia preference</span>
                <p className="text-ink-2 mt-0.5">
                  {booking.anaesthesia_preferences?.map((p) => p === 'up_to_anaesthetist' ? 'Up to anaesthetist' : p).join(', ') || '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-2">How to contact</span>
                <p className="text-ink-2 mt-0.5 capitalize">{booking.cascade_mode}</p>
              </div>
              <div>
                <span className="text-muted-2">Hospital / Clinic</span>
                <p className="text-ink-2 mt-0.5">{booking.hospital_clinic}</p>
              </div>
              <div>
                <span className="text-muted-2">Booked by</span>
                <p className="text-ink-2 mt-0.5">Secretary</p>
              </div>
              {booking.confirmed_at && (
                <div>
                  <span className="text-muted-2">Confirmed at</span>
                  <p className="text-ink-2 mt-0.5">{formatDate(booking.confirmed_at)}</p>
                </div>
              )}
            </div>

            {booking.status === 'all_declined' && (
              <div className="bg-crit-bg border border-crit-line rounded-sm p-3 text-xs text-crit flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  All {sortedSteps.length} anaesthetist{sortedSteps.length !== 1 ? 's' : ''} declined or did not respond.
                  Open full details to add another anaesthetist.
                </span>
              </div>
            )}

            {(booking.status === 'cascade_running' || booking.status === 'all_declined') && sortedSteps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-2">Request list</p>
                {sortedSteps.map((step) => {
                  const outcomeGroup = stepOutcomeGroup(step.outcome, !!step.notified_at);
                  return (
                    <div key={step.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-2 w-4 figure">{step.rank}</span>
                        <RoleName role="anaesthetist" name={`Dr ${step.anaesthetist?.full_name || 'Unknown'}`} />
                      </div>
                      <div className="text-right">
                        {step.outcome === 'accepted' && <span className={`font-medium ${statusGroupTextClass(outcomeGroup)}`}>Accepted</span>}
                        {step.outcome === 'declined' && <span className="text-muted">Declined</span>}
                        {step.outcome === 'expired' && <span className="text-muted">Expired</span>}
                        {step.outcome === 'released' && <span className="text-muted">Released</span>}
                        {step.outcome === 'send_failed' && <span className="text-crit">Send failed</span>}
                        {step.outcome === 'pending' && step.notified_at && (
                          <span className={statusGroupTextClass(outcomeGroup)}>
                            Awaiting · {countdown(step.expires_at)}
                          </span>
                        )}
                        {step.outcome === 'pending' && !step.notified_at && (
                          <span className="text-muted-2">Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {booking.status === 'confirmed' && confirmedAnaesthetist && (
              <div className="bg-ok-bg border border-ok-line rounded-sm p-3 text-xs text-ok flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Dr {confirmedAnaesthetist.full_name} confirmed. Confirmation sent via WhatsApp. Surgeon dashboard updated.
              </div>
            )}

            {unacknowledged && confirmedAnaesthetist && (
              <div className="bg-warn-bg border border-warn-line rounded-sm p-3 text-xs text-warn flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Dr {confirmedAnaesthetist.full_name} has not acknowledged the cancellation.
                  No reply after 30 min. Call: {confirmedAnaesthetist.phone}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => window.location.href = `/dashboard/booking/${booking.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2"
              >
                <FileText className="w-3.5 h-3.5" /> Full details
              </button>
              {booking.status === 'confirmed' && (
                <button
                  onClick={() => onResendConfirmation(booking)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2"
                >
                  <Send className="w-3.5 h-3.5" /> Resend confirmation
                </button>
              )}
              {booking.status !== 'cancelled' && (
                <button
                  onClick={() => onCancelCase(booking)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-crit border border-crit-line rounded-sm hover:bg-crit-bg"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel case
                </button>
              )}
              {unacknowledged && (
                <>
                  <button
                    onClick={() => onResendCancellation(booking)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Resend cancellation message
                  </button>
                  <button
                    onClick={() => onMarkAcknowledged(booking)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Mark as manually confirmed
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
