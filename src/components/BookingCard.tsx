import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDate, formatTime, countdown } from '@/lib/utils';
import { SurgeonBadge, AnaesthetistBadge, StatusBadge } from '@/components/Badges';
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

  return (
    <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 12, borderWidth: 0.5 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {booking.patient_initials}, {booking.patient_age} yrs · {booking.procedure}
            </h3>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <SurgeonBadge />
                Dr {booking.surgeon?.full_name || 'Unknown'}
              </span>
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
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400">Surgeon</span>
              <p className="text-gray-900 mt-0.5 flex items-center gap-1">
                <SurgeonBadge /> Dr {booking.surgeon?.full_name || 'Unknown'}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Anaesthetist</span>
              <p className="text-gray-900 mt-0.5">
                {confirmedAnaesthetist ? (
                  <span className="inline-flex items-center gap-1">
                    <AnaesthetistBadge /> Dr {confirmedAnaesthetist.full_name}
                  </span>
                ) : (
                  <span className="text-gray-400">Not confirmed</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Anaesthesia preference</span>
              <p className="text-gray-900 mt-0.5">
                {booking.anaesthesia_preferences?.map((p) => p === 'up_to_anaesthetist' ? 'Up to anaesthetist' : p).join(', ') || '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Cascade mode</span>
              <p className="text-gray-900 mt-0.5 capitalize">{booking.cascade_mode}</p>
            </div>
            <div>
              <span className="text-gray-400">Hospital / Clinic</span>
              <p className="text-gray-900 mt-0.5">{booking.hospital_clinic}</p>
            </div>
            <div>
              <span className="text-gray-400">Booked by</span>
              <p className="text-gray-900 mt-0.5">Secretary</p>
            </div>
            {booking.confirmed_at && (
              <div>
                <span className="text-gray-400">Confirmed at</span>
                <p className="text-gray-900 mt-0.5">{formatDate(booking.confirmed_at)}</p>
              </div>
            )}
          </div>

          {booking.status === 'all_declined' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                All {sortedSteps.length} anaesthetist{sortedSteps.length !== 1 ? 's' : ''} declined or did not respond.
                Open full details to add another anaesthetist.
              </span>
            </div>
          )}

          {(booking.status === 'cascade_running' || booking.status === 'all_declined') && sortedSteps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Cascade list</p>
              {sortedSteps.map((step) => (
                <div key={step.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-4">{step.rank}</span>
                    <AnaesthetistBadge />
                    <span className="text-gray-900">Dr {step.anaesthetist?.full_name || 'Unknown'}</span>
                  </div>
                  <div className="text-right">
                    {step.outcome === 'accepted' && <span className="text-green-600 font-medium">Accepted</span>}
                    {step.outcome === 'declined' && <span className="text-gray-500">Declined</span>}
                    {step.outcome === 'expired' && <span className="text-gray-500">Expired</span>}
                    {step.outcome === 'released' && <span className="text-gray-500">Released</span>}
                    {step.outcome === 'pending' && step.notified_at && (
                      <span className="text-amber-600">
                        Awaiting · {countdown(step.expires_at)}
                      </span>
                    )}
                    {step.outcome === 'pending' && !step.notified_at && (
                      <span className="text-gray-400">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {booking.status === 'confirmed' && confirmedAnaesthetist && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Dr {confirmedAnaesthetist.full_name} confirmed. Confirmation sent via WhatsApp. Surgeon dashboard updated.
            </div>
          )}

          {unacknowledged && confirmedAnaesthetist && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <AnaesthetistBadge /> Dr {confirmedAnaesthetist.full_name} has not acknowledged the cancellation.
                No reply after 30 min. Call: {confirmedAnaesthetist.phone}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => window.location.href = `/dashboard/booking/${booking.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <FileText className="w-3.5 h-3.5" /> Full details
            </button>
            {booking.status === 'confirmed' && (
              <button
                onClick={() => onResendConfirmation(booking)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Send className="w-3.5 h-3.5" /> Resend confirmation
              </button>
            )}
            {booking.status !== 'cancelled' && (
              <button
                onClick={() => onCancelCase(booking)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel case
              </button>
            )}
            {unacknowledged && (
              <>
                <button
                  onClick={() => onResendCancellation(booking)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Resend cancellation message
                </button>
                <button
                  onClick={() => onMarkAcknowledged(booking)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Mark as manually confirmed
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
