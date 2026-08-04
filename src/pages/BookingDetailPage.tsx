import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { SurgeonBadge, AnaesthetistBadge, StatusBadge } from '@/components/Badges';
import { formatDate, formatTime, formatDateTime, anaesthesiaLabel } from '@/lib/utils';
import type { Booking, CascadeStep, WhatsAppLog, User, Anaesthetist } from '@/types';
import {
  ArrowLeft, Calendar, Clock, MapPin, XCircle, Send, AlertTriangle, CheckCircle, RotateCw, Search, Plus, X
} from 'lucide-react';

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [cascadeSteps, setCascadeSteps] = useState<CascadeStep[]>([]);
  const [whatsappLogs, setWhatsappLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [allAnaesthetists, setAllAnaesthetists] = useState<Anaesthetist[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [staged, setStaged] = useState<Anaesthetist[]>([]);
  const [sendingNew, setSendingNew] = useState(false);

  const showCancel = searchParams.get('cancel') === '1';

  const fetchData = useCallback(async () => {
    if (!id) return;

    const { data: bookingData, error: bError } = await supabase
      .from('bookings')
      .select(`
        *,
        surgeon:users!bookings_surgeon_id_fkey(*),
        confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (bError || !bookingData) {
      toast.error('Booking not found');
      navigate('/dashboard');
      return;
    }

    setBooking(bookingData as unknown as Booking);

    const { data: stepsData } = await supabase
      .from('cascade_steps')
      .select(`
        *,
        anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
      `)
      .eq('booking_id', id)
      .order('rank');
    setCascadeSteps((stepsData || []) as unknown as CascadeStep[]);

    const { data: logsData } = await supabase
      .from('whatsapp_log')
      .select('*')
      .eq('booking_id', id)
      .order('sent_at', { ascending: false });
    setWhatsappLogs((logsData || []) as WhatsAppLog[]);

    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (showCancel && booking) setShowCancelModal(true);
  }, [showCancel, booking]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`booking-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cascade_steps', filter: `booking_id=eq.${id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_log', filter: `booking_id=eq.${id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('anaesthetists').select('*').eq('active', true).order('full_name');
      setAllAnaesthetists((data || []) as Anaesthetist[]);
    })();
  }, []);

  const askedIds = new Set(cascadeSteps.map((s) => s.anaesthetist_id));
  const available = allAnaesthetists.filter((a) =>
    !askedIds.has(a.id) &&
    !staged.some((s) => s.id === a.id) &&
    (!addSearch.trim() ||
      a.full_name.toLowerCase().includes(addSearch.toLowerCase()) ||
      a.hospitals?.some((h) => h.toLowerCase().includes(addSearch.toLowerCase())))
  );

  const addStaged = (a: Anaesthetist) => setStaged((s) => [...s, a]);
  const removeStaged = (id: string) => setStaged((s) => s.filter((a) => a.id !== id));

  const handleSendNewRequests = async () => {
    if (!booking || staged.length === 0) return;
    setSendingNew(true);

    const maxRank = cascadeSteps.reduce((m, s) => Math.max(m, s.rank), 0);
    const inserts = staged.map((a, i) => ({
      booking_id: booking.id,
      anaesthetist_id: a.id,
      rank: maxRank + i + 1,
      outcome: 'pending' as const,
    }));

    const { error: insertError } = await supabase.from('cascade_steps').insert(inserts);
    if (insertError) {
      toast.error('Failed to add anaesthetist');
      setSendingNew(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cascade_running' })
      .eq('id', booking.id);
    if (updateError) {
      toast.error('Failed to restart cascade');
      setSendingNew(false);
      return;
    }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cascade-engine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ bookingId: booking.id, action: 'start' }),
    });

    toast.success('New case request sent via WhatsApp');
    setStaged([]);
    setAddSearch('');
    setSendingNew(false);
    fetchData();
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please enter a reason for cancellation');
      return;
    }
    if (!booking || !user) return;

    setCancelling(true);

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancel_reason: cancelReason.trim(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
      })
      .eq('id', booking.id);

    if (error) {
      toast.error('Failed to cancel booking');
      setCancelling(false);
      return;
    }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'cancellation', bookingId: booking.id }),
    });

    toast.success('Case cancelled. WhatsApp message sent to anaesthetist and surgeon.');
    setCancelling(false);
    setShowCancelModal(false);
    setCancelReason('');
    setSearchParams({});
    fetchData();
  };

  if (loading || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">
              {booking.patient_initials}, {booking.patient_age} yrs · {booking.procedure}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={booking.status} cancelAck={booking.cancel_acknowledged} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Case info */}
        <Card title="Case information">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <InfoRow label="Patient" value={`${booking.patient_initials}, ${booking.patient_age} yrs`} />
            <InfoRow label="Procedure" value={booking.procedure} />
            <InfoRow label="Surgeon" value={
              <span className="flex items-center gap-1"><SurgeonBadge /> Dr {booking.surgeon?.full_name || 'Unknown'}</span>
            } />
            <InfoRow label="Hospital / Clinic" value={booking.hospital_clinic} />
            <InfoRow label="Location" value={booking.ot_location} />
            <InfoRow label="Date" value={formatDate(booking.surgery_date)} />
            <InfoRow label="Time" value={formatTime(booking.surgery_time)} />
            <InfoRow label="Duration" value={`${booking.duration_hours} hrs`} />
            <InfoRow label="Cascade mode" value={<span className="capitalize">{booking.cascade_mode}</span>} />
            <InfoRow label="Anaesthesia" value={booking.anaesthesia_preferences?.map(anaesthesiaLabel).join(', ') || '—'} />
            {booking.confirmed_anaesthetist && (
              <InfoRow label="Confirmed anaesthetist" value={
                <span className="flex items-center gap-1"><AnaesthetistBadge /> Dr {booking.confirmed_anaesthetist.full_name}</span>
              } />
            )}
            {booking.confirmed_at && (
              <InfoRow label="Confirmed at" value={formatDateTime(booking.confirmed_at)} />
            )}
            {booking.cancel_reason && (
              <InfoRow label="Cancel reason" value={<span className="text-red-600">{booking.cancel_reason}</span>} />
            )}
            {booking.cancelled_at && (
              <InfoRow label="Cancelled at" value={formatDateTime(booking.cancelled_at)} />
            )}
          </div>

          {booking.status !== 'cancelled' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel case
            </button>
          )}
        </Card>

        {/* Cascade exhausted: add anaesthetist */}
        {booking.status === 'all_declined' && (
          <Card title="Cascade exhausted — add an anaesthetist">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Already asked</p>
                <div className="space-y-2">
                  {[...cascadeSteps].sort((a, b) => a.rank - b.rank).map((step) => (
                    <div key={step.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <AnaesthetistBadge /> Dr {step.anaesthetist?.full_name || 'Unknown'}
                      </span>
                      <span className="text-gray-500 capitalize">{step.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Add anaesthetist</p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search by name or hospital..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400"
                  />
                </div>

                {staged.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {staged.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs bg-[#EEEDFE] text-[#3C3489]">
                        Dr {a.full_name}
                        <button type="button" onClick={() => removeStaged(a.id)} className="p-0.5 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                  {available.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">
                      {addSearch.trim() ? 'No match' : 'No other anaesthetists available — everyone in the directory has already been asked.'}
                    </p>
                  ) : (
                    available.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addStaged(a)}
                        className="w-full flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gray-50 text-left"
                      >
                        <span className="text-xs text-gray-900">Dr {a.full_name}</span>
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSendNewRequests}
                  disabled={staged.length === 0 || sendingNew}
                  className="w-full py-2 text-xs font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670] disabled:opacity-50"
                >
                  {sendingNew
                    ? 'Sending...'
                    : staged.length > 0
                      ? `Send request to ${staged.length} anaesthetist${staged.length !== 1 ? 's' : ''}`
                      : 'Send request'}
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Cascade timeline */}
        <Card title="Cascade timeline">
          {cascadeSteps.length === 0 ? (
            <p className="text-sm text-gray-400">No cascade steps recorded.</p>
          ) : (
            <div className="space-y-3">
              {[...cascadeSteps].sort((a, b) => a.rank - b.rank).map((step) => (
                <div key={step.id} className="flex items-start gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
                    {step.rank}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <AnaesthetistBadge />
                      <span className="text-gray-900">Dr {step.anaesthetist?.full_name || 'Unknown'}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                      {step.notified_at && <p>Notified: {formatDateTime(step.notified_at)}</p>}
                      {step.expires_at && <p>Expires: {formatDateTime(step.expires_at)}</p>}
                      {step.responded_at && <p>Responded: {formatDateTime(step.responded_at)}</p>}
                      <p className="font-medium text-gray-600">Outcome: <span className="capitalize">{step.outcome}</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* WhatsApp audit log */}
        <Card title="WhatsApp audit log">
          {whatsappLogs.length === 0 ? (
            <p className="text-sm text-gray-400">No WhatsApp messages logged.</p>
          ) : (
            <div className="space-y-3">
              {whatsappLogs.map((log) => (
                <div key={log.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      log.direction === 'outbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {log.direction === 'outbound' ? 'Sent' : 'Received'}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(log.sent_at)}</span>
                  </div>
                  <p className="text-gray-900 text-xs">{log.body}</p>
                  {log.reply && <p className="text-gray-500 text-xs mt-1">Reply: {log.reply}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {log.message_type && <span className="capitalize">{log.message_type.replace(/_/g, ' ')}</span>}
                    {' · '}To: {log.to_phone} · From: {log.from_phone}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => { setShowCancelModal(false); setSearchParams({}); }}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Cancel this case?</h3>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-600">
              <p><strong>{booking.patient_initials}, {booking.patient_age} yrs</strong> · {booking.procedure}</p>
              <p>{formatDate(booking.surgery_date)} · {formatTime(booking.surgery_time)} · {booking.ot_location}</p>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              A cancellation message will be sent via WhatsApp to both the anaesthetist and surgeon.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for cancellation *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Enter the reason for cancellation..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setSearchParams({}); setCancelReason(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Go back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel case and notify via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 p-5" style={{ borderRadius: 12, borderWidth: 0.5 }}>
      <h2 className="text-sm font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
