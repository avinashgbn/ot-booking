import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BookingCard } from '@/components/BookingCard';
import { SurgeonBadge } from '@/components/Badges';
import { initials } from '@/lib/utils';
import type { Booking, CascadeStep, User, Anaesthetist, Practice } from '@/types';
import { Plus, Settings, Search, AlertTriangle } from 'lucide-react';

type StatusFilter = 'all' | 'cascade_running' | 'confirmed' | 'cancelled' | 'attention';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cascadeSteps, setCascadeSteps] = useState<CascadeStep[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [selectedSurgeon, setSelectedSurgeon] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.practice_id) return;

    const { data: bookingsData, error: bError } = await supabase
      .from('bookings')
      .select(`
        *,
        surgeon:users!bookings_surgeon_id_fkey(*),
        confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
      `)
      .eq('practice_id', user.practice_id)
      .order('surgery_date', { ascending: true });

    if (bError) {
      toast.error('Failed to load bookings');
      return;
    }

    const bData = (bookingsData || []) as unknown as Booking[];
    setBookings(bData);

    const bookingIds = bData.map((b) => b.id);
    if (bookingIds.length > 0) {
      const { data: stepsData } = await supabase
        .from('cascade_steps')
        .select(`
          *,
          anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
        `)
        .in('booking_id', bookingIds)
        .order('rank', { ascending: true });
      setCascadeSteps((stepsData || []) as unknown as CascadeStep[]);
    } else {
      setCascadeSteps([]);
    }

    const { data: surgeonsData } = await supabase
      .from('users')
      .select('*')
      .eq('practice_id', user.practice_id)
      .eq('role', 'surgeon')
      .order('full_name', { ascending: true });
    setSurgeons((surgeonsData || []) as User[]);

    const { data: pData } = await supabase
      .from('practices')
      .select('*')
      .eq('id', user.practice_id)
      .maybeSingle();
    if (pData) setPractice(pData as Practice);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.practice_id) return;

    const channel = supabase
      .channel('bookings-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `practice_id=eq.${user.practice_id}`,
      }, () => { fetchData(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cascade_steps',
      }, () => { fetchData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.practice_id, fetchData]);

  const filteredBookings = bookings.filter((b) => {
    if (selectedSurgeon && b.surgeon_id !== selectedSurgeon) return false;
    if (statusFilter === 'attention') {
      return b.status === 'cancelled' && !b.cancel_acknowledged;
    }
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const surgeonName = b.surgeon?.full_name?.toLowerCase() || '';
      return (
        b.patient_initials.toLowerCase().includes(q) ||
        b.procedure.toLowerCase().includes(q) ||
        b.ot_location.toLowerCase().includes(q) ||
        surgeonName.includes(q)
      );
    }
    return true;
  });

  const today = new Date();
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const stats = {
    total: bookings.filter((b) =>
      (b.status === 'confirmed' || b.status === 'cascade_running') &&
      new Date(b.surgery_date) >= today
    ).length,
    cascade: bookings.filter((b) => b.status === 'cascade_running').length,
    attention: bookings.filter((b) => b.status === 'cancelled' && !b.cancel_acknowledged).length,
    confirmedThisWeek: bookings.filter((b) =>
      b.status === 'confirmed' && b.confirmed_at &&
      new Date(b.confirmed_at) >= today && new Date(b.confirmed_at) <= weekFromNow
    ).length,
  };

  const stepsForBooking = (bookingId: string) => cascadeSteps.filter((s) => s.booking_id === bookingId);

  const handleResendConfirmation = async (booking: Booking) => {
    toast('Resending confirmation SMS...');
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'confirmation', bookingId: booking.id }),
    });
    toast.success('Confirmation SMS resent');
  };

  const handleCancelCase = (booking: Booking) => {
    navigate(`/dashboard/booking/${booking.id}?cancel=1`);
  };

  const handleResendCancellation = async (booking: Booking) => {
    toast('Resending cancellation SMS...');
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'cancellation', bookingId: booking.id }),
    });
    toast.success('Cancellation SMS resent');
  };

  const handleMarkAcknowledged = async (booking: Booking) => {
    const { error } = await supabase
      .from('bookings')
      .update({ cancel_acknowledged: true, cancel_acknowledged_at: new Date().toISOString() })
      .eq('id', booking.id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    toast.success('Marked as acknowledged');
    fetchData();
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'cascade_running', label: 'Cascade running' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'attention', label: 'Attention needed' },
  ];

  const pageTitle = selectedSurgeon
    ? `Upcoming cases — Dr ${surgeons.find((s) => s.id === selectedSurgeon)?.full_name || ''}`
    : `All upcoming cases — ${practice?.name || ''}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {today.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })} · {user?.full_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/new-booking')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#3C3489] text-white text-sm font-medium rounded-lg hover:bg-[#2D2670] transition-colors"
            >
              <Plus className="w-4 h-4" /> New booking
            </button>
            <button
              onClick={() => navigate('/dashboard/settings')}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full bg-[#EEEDFE] text-[#3C3489] flex items-center justify-center text-xs font-medium">
              {user ? initials(user.full_name) : ''}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total upcoming" value={stats.total} />
          <StatCard label="Cascade running" value={stats.cascade} accent="amber" />
          <StatCard label="Needs attention" value={stats.attention} accent="orange" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
          <StatCard label="Confirmed this week" value={stats.confirmedThisWeek} accent="green" />
        </div>

        {/* Surgeon filter pills */}
        <div className="mb-4 overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-2 min-w-max">
            <button
              onClick={() => setSelectedSurgeon(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                selectedSurgeon === null
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              All surgeons
            </button>
            {surgeons.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSurgeon(s.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1.5 ${
                  selectedSurgeon === s.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <SurgeonBadge />
                Dr {s.full_name}
              </button>
            ))}
          </div>
        </div>

        {/* Status filters + search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-2 overflow-x-auto">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-colors ${
                  statusFilter === f.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cases..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-full outline-none focus:border-gray-400"
            />
          </div>
        </div>

        {/* Booking cards */}
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-12">Loading bookings...</div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12">
            No bookings found. Click "New booking" to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                cascadeSteps={stepsForBooking(booking.id)}
                onResendConfirmation={handleResendConfirmation}
                onCancelCase={handleCancelCase}
                onResendCancellation={handleResendCancellation}
                onMarkAcknowledged={handleMarkAcknowledged}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, accent, icon }: { label: string; value: number; accent?: string; icon?: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    amber: 'text-amber-600',
    orange: 'text-orange-600',
    green: 'text-green-600',
  };
  return (
    <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 12, borderWidth: 0.5 }}>
      <p className="text-xs text-gray-500 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? colorMap[accent] : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
