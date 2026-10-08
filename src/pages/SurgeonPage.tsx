import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { SurgeonBadge, StatusBadge, RoleName } from '@/components/Badges';
import { ReorderableList } from '@/components/ReorderableList';
import { formatDate, formatTime, anaesthesiaLabel } from '@/lib/utils';
import type { Booking, Practice, Anaesthetist, AnaesthetistPreference } from '@/types';
import { Calendar, Clock, MapPin, Activity, Users, Plus, X, Search, ChevronDown, ChevronUp, LogOut } from 'lucide-react';

export function SurgeonPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<AnaesthetistPreference[]>([]);
  const [allAnaesthetists, setAllAnaesthetists] = useState<Anaesthetist[]>([]);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showAddAnaesthetist, setShowAddAnaesthetist] = useState(false);
  const [search, setSearch] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
      `)
      .eq('surgeon_id', user.id)
      .order('surgery_date', { ascending: true });

    if (!error && data) {
      setBookings(data as unknown as Booking[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    (async () => {
      if (!user?.practice_id) return;
      const { data } = await supabase.from('practices').select('*').eq('id', user.practice_id).maybeSingle();
      if (data) setPractice(data as Practice);
    })();
  }, [user?.practice_id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('surgeon-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `surgeon_id=eq.${user.id}` }, () => fetchBookings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchBookings]);

  const fetchPrefs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('anaesthetist_preferences')
      .select(`*, anaesthetist:anaesthetists!anaesthetist_preferences_anaesthetist_id_fkey(*)`)
      .eq('surgeon_id', user.id)
      .order('rank');
    setPrefs((data || []) as unknown as AnaesthetistPreference[]);
  }, [user?.id]);

  const fetchAnaesthetists = useCallback(async () => {
    const { data } = await supabase.from('anaesthetists').select('*').eq('active', true).order('full_name');
    setAllAnaesthetists((data || []) as Anaesthetist[]);
  }, []);

  useEffect(() => {
    fetchPrefs();
    fetchAnaesthetists();
  }, [fetchPrefs, fetchAnaesthetists]);

  const savePrefs = async (updated: AnaesthetistPreference[]) => {
    if (!user?.id) return;
    await supabase.from('anaesthetist_preferences').delete().eq('surgeon_id', user.id);
    if (updated.length > 0) {
      await supabase.from('anaesthetist_preferences').insert(
        updated.map((p, i) => ({
          surgeon_id: user.id,
          anaesthetist_id: p.anaesthetist_id,
          rank: i + 1,
        }))
      );
    }
    fetchPrefs();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleReorder = (newItems: AnaesthetistPreference[]) => {
    setPrefs(newItems);
    savePrefs(newItems);
  };

  const handleRemove = (id: string) => {
    const updated = prefs.filter((p) => p.id !== id);
    setPrefs(updated);
    savePrefs(updated);
  };

  const handleAdd = (a: Anaesthetist) => {
    if (prefs.length >= 5) { toast.error('Maximum 5 preferences'); return; }
    if (prefs.some((p) => p.anaesthetist_id === a.id)) { toast.error('Already in your list'); return; }
    const newPref: AnaesthetistPreference = {
      id: `temp-${Date.now()}`,
      surgeon_id: user!.id,
      anaesthetist_id: a.id,
      rank: prefs.length + 1,
      created_at: new Date().toISOString(),
      anaesthetist: a,
    };
    const updated = [...prefs, newPref];
    setPrefs(updated);
    savePrefs(updated);
    setShowAddAnaesthetist(false);
    setSearch('');
  };

  const filteredAnaesthetists = allAnaesthetists.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.hospitals?.some((h) => h.toLowerCase().includes(q));
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = bookings.filter((b) => new Date(b.surgery_date) >= today && b.status !== 'cancelled');
  const recent = bookings.filter((b) => new Date(b.surgery_date) < today || b.status === 'cancelled');
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recent30 = recent.filter((b) => new Date(b.surgery_date) >= monthAgo);

  const stats = {
    confirmed: upcoming.filter((b) => b.status === 'confirmed').length,
    awaiting: upcoming.filter((b) => b.status === 'cascade_running' || b.status === 'pending' || b.status === 'all_declined').length,
    thisMonth: bookings.filter((b) => {
      const d = new Date(b.surgery_date);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length,
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-sm bg-brand flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold text-ink">OT Booking</span>
          </div>
          <button
            onClick={handleSignOut}
            title="Log off"
            className="p-2 text-muted hover:text-ink-2 hover:bg-surface-2 rounded-sm"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Header section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <SurgeonBadge />
            <h1 className="text-lg font-semibold text-ink">Dr {user?.full_name}</h1>
          </div>
          <p className="text-sm text-muted">{practice?.name || ''}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Confirmed upcoming" value={stats.confirmed} accent="ok" />
          <StatCard label="Awaiting anaesthetist" value={stats.awaiting} accent="warn" />
          <StatCard label="Cases this month" value={stats.thisMonth} />
        </div>

        {/* Anaesthetist preferences */}
        <div className="bg-surface border border-line mb-6 overflow-hidden rounded shadow-sm">
          <button
            onClick={() => setPrefsOpen(!prefsOpen)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-semibold text-ink">My anaesthetist preferences</h2>
              {prefs.length > 0 && (
                <span className="text-xs text-muted-2">({prefs.length} ranked)</span>
              )}
            </div>
            {prefsOpen ? <ChevronUp className="w-4 h-4 text-muted-2" /> : <ChevronDown className="w-4 h-4 text-muted-2" />}
          </button>

          {prefsOpen && (
            <div className="px-4 pb-4 border-t border-line pt-3">
              {prefs.length === 0 ? (
                <p className="text-sm text-muted-2 text-center py-4">
                  No preferences set. Add anaesthetists to create your ranked list.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-2 mb-3">Drag to reorder by preference (1 = first choice).</p>
                  <ReorderableList
                    items={prefs}
                    onReorder={handleReorder}
                    getKey={(p) => p.id}
                    renderItem={(item) => (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <RoleName role="anaesthetist" name={`Dr ${item.anaesthetist?.full_name || 'Unknown'}`} />
                          <p className="text-xs text-muted-2 truncate mt-0.5">{item.anaesthetist?.hospitals?.join(', ') || ''}</p>
                        </div>
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="p-1 text-crit border border-crit-line rounded-sm bg-crit-bg hover:opacity-80 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  />
                </>
              )}

              {prefs.length < 5 && (
                <button
                  onClick={() => setShowAddAnaesthetist(true)}
                  className="w-full mt-3 p-3 border border-dashed border-line rounded-sm text-sm text-muted hover:border-brand hover:text-brand transition-colors"
                >
                  + Add anaesthetist
                </button>
              )}
            </div>
          )}
        </div>

        {showAddAnaesthetist && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowAddAnaesthetist(false)}>
            <div className="bg-surface rounded w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-line">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink">Add anaesthetist</h3>
                  <button onClick={() => setShowAddAnaesthetist(false)} className="p-1 text-muted-2 hover:text-ink-2"><X className="w-4 h-4" /></button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-2" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or hospital..." className="form-input pl-9" autoFocus />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filteredAnaesthetists.map((a) => (
                  <button key={a.id} onClick={() => handleAdd(a)} className="w-full flex items-center gap-2 p-3 rounded-sm hover:bg-surface-2 text-left">
                    <div className="flex-1">
                      <RoleName role="anaesthetist" name={`Dr ${a.full_name}`} />
                      <p className="text-xs text-muted-2 mt-0.5">{a.hospitals?.join(', ') || ''}</p>
                    </div>
                    <Plus className="w-4 h-4 text-muted-2" />
                  </button>
                ))}
                {filteredAnaesthetists.length === 0 && (
                  <p className="text-sm text-muted-2 p-4 text-center">No anaesthetists found</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upcoming cases */}
        <h2 className="text-sm font-semibold text-ink mb-3">Upcoming cases</h2>
        {loading ? (
          <p className="text-sm text-muted-2 py-8 text-center">Loading...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-2 py-8 text-center">No upcoming cases.</p>
        ) : (
          <div className="space-y-3 mb-8">
            {upcoming.map((b) => (
              <CaseCard key={b.id} booking={b} />
            ))}
          </div>
        )}

        {/* Recent cases */}
        {recent30.length > 0 && (
          <>
            <div className="border-t border-line pt-6 mb-3">
              <h2 className="text-sm font-semibold text-ink">Recent cases</h2>
              <p className="text-xs text-muted-2">Past 30 days</p>
            </div>
            <div className="space-y-3">
              {recent30.map((b) => (
                <CaseCard key={b.id} booking={b} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'ok' | 'warn' }) {
  const colorMap: Record<string, string> = {
    ok: 'text-ok',
    warn: 'text-warn',
  };
  return (
    <div className="bg-surface border border-line p-3 rounded shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`figure text-xl font-semibold mt-1 ${accent ? colorMap[accent] : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function CaseCard({ booking }: { booking: Booking }) {
  const confirmed = booking.status === 'confirmed' && booking.confirmed_anaesthetist;
  const cancelled = booking.status === 'cancelled';

  return (
    <div className="bg-surface border border-line p-4 rounded shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {booking.patient_initials}, {booking.patient_age} yrs · {booking.procedure}
          </h3>
        </div>
        <StatusBadge status={booking.status} cancelAck={booking.cancel_acknowledged} />
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(booking.surgery_date)} · {formatTime(booking.surgery_time)}</span>
        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {booking.duration_hours} hrs</span>
        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {booking.ot_location}</span>
      </div>

      {confirmed && (
        <div className="mt-3 bg-ok-bg border border-ok-line rounded-sm px-3 py-2 text-xs text-ok flex items-center gap-2">
          <RoleName role="anaesthetist" name={`Dr ${booking.confirmed_anaesthetist!.full_name}`} />
          <span>· {booking.anaesthesia_preferences?.map(anaesthesiaLabel).join(', ') || ''}</span>
        </div>
      )}

      {booking.status === 'cascade_running' && (
        <div className="mt-3 bg-warn-bg border border-warn-line rounded-sm px-3 py-2 text-xs text-warn">
          Secretary is confirming anaesthetist
        </div>
      )}

      {cancelled && booking.cancel_reason && (
        <div className="mt-3 text-xs text-crit">
          Cancelled: {booking.cancel_reason}
          {booking.confirmed_anaesthetist && <span className="block mt-0.5">Notified: Dr {booking.confirmed_anaesthetist.full_name}</span>}
        </div>
      )}
    </div>
  );
}
