import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { RoleName } from '@/components/Badges';
import { normalisePhone, anaesthesiaLabel } from '@/lib/utils';
import { startCascadeEngine } from '@/lib/cascadeEngine';
import type { User, Anaesthetist, AnaesthetistPreference, CascadeMode, AnaesthesiaType } from '@/types';
import {
  ArrowLeft, ArrowUp, ArrowDown, X, Search, Check, ChevronRight, Layers, Zap
} from 'lucide-react';

export function NewBookingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<Anaesthetist[]>([]);
  const [selectedSurgeonId, setSelectedSurgeonId] = useState('');
  const [preferences, setPreferences] = useState<AnaesthetistPreference[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    patient_initials: '',
    patient_age: '',
    procedure: '',
    hospital_clinic: '',
    ot_location: '',
    surgery_date: '',
    surgery_time: '',
    duration_hours: '',
    anaesthesia_preferences: [] as AnaesthesiaType[],
    cascade_mode: 'sequential' as CascadeMode,
  });

  const loadSurgeons = useCallback(async () => {
    if (!user?.practice_id) return;
    const { data: homeSurgeons } = await supabase
      .from('users')
      .select('*')
      .eq('practice_id', user.practice_id)
      .eq('role', 'surgeon')
      .eq('archived', false)
      .order('full_name');

    const { data: linked } = await supabase
      .from('practice_surgeons')
      .select('surgeon:users!practice_surgeons_surgeon_id_fkey(*)')
      .eq('practice_id', user.practice_id);

    const linkedSurgeons = (linked || [])
      .map((l) => (l as unknown as { surgeon: User }).surgeon)
      .filter(Boolean);

    const merged = [...((homeSurgeons || []) as User[]), ...linkedSurgeons]
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    setSurgeons(merged);
  }, [user]);

  const loadAnaesthetists = useCallback(async () => {
    const { data } = await supabase
      .from('anaesthetists')
      .select('*')
      .eq('active', true)
      .order('full_name');
    setAnaesthetists((data || []) as Anaesthetist[]);
  }, []);

  const loadPreferences = useCallback(async (surgeonId: string) => {
    const { data } = await supabase
      .from('anaesthetist_preferences')
      .select(`
        *,
        anaesthetist:anaesthetists!anaesthetist_preferences_anaesthetist_id_fkey(*)
      `)
      .eq('surgeon_id', surgeonId)
      .order('rank');
    setPreferences((data || []) as unknown as AnaesthetistPreference[]);
  }, []);

  useEffect(() => {
    loadSurgeons();
    loadAnaesthetists();
  }, [loadSurgeons, loadAnaesthetists]);

  useEffect(() => {
    if (selectedSurgeonId) loadPreferences(selectedSurgeonId);
    else setPreferences([]);
  }, [selectedSurgeonId, loadPreferences]);

  const toggleAnaesthesia = (type: AnaesthesiaType) => {
    setForm((f) => ({
      ...f,
      anaesthesia_preferences: f.anaesthesia_preferences.includes(type)
        ? f.anaesthesia_preferences.filter((t) => t !== type)
        : [...f.anaesthesia_preferences, type],
    }));
  };

  const movePreference = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= preferences.length) return;
    const updated = [...preferences];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    const reRanked = updated.map((p, i) => ({ ...p, rank: i + 1 }));
    setPreferences(reRanked);
  };

  const removePreference = (id: string) => {
    const updated = preferences.filter((p) => p.id !== id);
    const reRanked = updated.map((p, i) => ({ ...p, rank: i + 1 }));
    setPreferences(reRanked);
  };

  const addFromDirectory = (anaesthetist: Anaesthetist) => {
    if (preferences.length >= 5) {
      toast.error('Maximum 5 anaesthetists');
      return;
    }
    if (preferences.some((p) => p.anaesthetist_id === anaesthetist.id)) {
      toast.error('Already in the list');
      return;
    }
    const newPref: AnaesthetistPreference = {
      id: `temp-${Date.now()}`,
      surgeon_id: selectedSurgeonId,
      anaesthetist_id: anaesthetist.id,
      rank: preferences.length + 1,
      created_at: new Date().toISOString(),
      anaesthetist,
    };
    setPreferences([...preferences, newPref]);
    setShowDirectory(false);
    setDirectorySearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.practice_id) { toast.error('No practice found'); return; }
    if (!selectedSurgeonId) { toast.error('Select a surgeon'); return; }
    if (!form.patient_initials.trim()) { toast.error('Enter patient initials'); return; }
    if (!form.patient_age) { toast.error('Enter patient age'); return; }
    if (!form.procedure.trim()) { toast.error('Enter procedure'); return; }
    if (!form.hospital_clinic.trim()) { toast.error('Enter hospital/clinic'); return; }
    if (!form.ot_location.trim()) { toast.error('Enter location'); return; }
    if (!form.surgery_date) { toast.error('Select date'); return; }
    if (!form.surgery_time) { toast.error('Select time'); return; }
    if (!form.duration_hours) { toast.error('Enter duration'); return; }
    if (form.anaesthesia_preferences.length === 0) { toast.error('Select at least one anaesthesia preference'); return; }
    if (preferences.length === 0) { toast.error('Add at least one anaesthetist'); return; }

    setSubmitting(true);

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        practice_id: user.practice_id,
        surgeon_id: selectedSurgeonId,
        secretary_id: user.id,
        patient_initials: form.patient_initials.trim(),
        patient_age: parseInt(form.patient_age, 10),
        procedure: form.procedure.trim(),
        hospital_clinic: form.hospital_clinic.trim(),
        ot_location: form.ot_location.trim(),
        surgery_date: form.surgery_date,
        surgery_time: form.surgery_time,
        duration_hours: parseFloat(form.duration_hours),
        anaesthesia_preferences: form.anaesthesia_preferences,
        cascade_mode: form.cascade_mode,
        status: 'cascade_running',
        secretary_phone: user.phone,
      })
      .select()
      .single();

    if (error || !booking) {
      toast.error('Failed to create booking');
      setSubmitting(false);
      return;
    }

    const stepInserts = preferences.map((p) => ({
      booking_id: booking.id,
      anaesthetist_id: p.anaesthetist_id,
      rank: p.rank,
      outcome: 'pending' as const,
    }));

    const { error: stepsError } = await supabase
      .from('cascade_steps')
      .insert(stepInserts);

    if (stepsError) {
      toast.error('Failed to set up request');
      setSubmitting(false);
      return;
    }

    const cascadeStarted = await startCascadeEngine(booking.id);

    if (cascadeStarted) {
      toast.success('Booking created. Request started.');
    } else {
      toast.error('Booking created, but the first WhatsApp request may be delayed — it will retry automatically.');
    }
    setSubmitting(false);
    navigate('/dashboard');
  };

  const handleSaveDraft = async () => {
    if (!user?.practice_id || !selectedSurgeonId) {
      toast.error('Select a surgeon first');
      return;
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        practice_id: user.practice_id,
        surgeon_id: selectedSurgeonId,
        secretary_id: user.id,
        patient_initials: form.patient_initials.trim() || 'TBD',
        patient_age: parseInt(form.patient_age, 10) || 0,
        procedure: form.procedure.trim() || 'TBD',
        hospital_clinic: form.hospital_clinic.trim() || 'TBD',
        ot_location: form.ot_location.trim() || 'TBD',
        surgery_date: form.surgery_date || new Date().toISOString().split('T')[0],
        surgery_time: form.surgery_time || '09:00',
        duration_hours: parseFloat(form.duration_hours) || 1,
        anaesthesia_preferences: form.anaesthesia_preferences,
        cascade_mode: form.cascade_mode,
        status: 'pending',
        secretary_phone: user.phone,
      })
      .select()
      .single();

    if (error || !booking) {
      toast.error('Failed to save draft');
      return;
    }

    toast.success('Draft saved');
    navigate(`/dashboard/booking/${booking.id}`);
  };

  const filteredAnaesthetists = anaesthetists.filter((a) => {
    if (!directorySearch.trim()) return true;
    const q = directorySearch.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(q) ||
      a.hospitals?.some((h) => h.toLowerCase().includes(q))
    );
  });

  const anaesthesiaOptions: { key: AnaesthesiaType; label: string }[] = [
    { key: 'up_to_anaesthetist', label: 'Up to the anaesthetist' },
    { key: 'GA', label: 'General anaesthesia (GA)' },
    { key: 'regional', label: 'Regional anaesthesia' },
    { key: 'sedation', label: 'Sedation' },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 text-muted hover:text-ink-2 hover:bg-surface-2 rounded-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-ink">New booking</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Section 1: Patient and case details */}
        <Section title="Patient and case details" number={1}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Patient initials">
              <input
                type="text"
                value={form.patient_initials}
                onChange={(e) => setForm({ ...form, patient_initials: e.target.value })}
                placeholder="J.O."
                className="form-input"
              />
            </Field>
            <Field label="Patient age">
              <input
                type="number"
                value={form.patient_age}
                onChange={(e) => setForm({ ...form, patient_age: e.target.value })}
                placeholder="45"
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Surgical procedure">
            <input
              type="text"
              value={form.procedure}
              onChange={(e) => setForm({ ...form, procedure: e.target.value })}
              placeholder="Laparoscopic cholecystectomy"
              className="form-input"
            />
          </Field>
        </Section>

        {/* Section 2: OT details */}
        <Section title="OT details" number={2} subtitle="Confirmed by phone with OT">
          <Field label="Hospital / Clinic">
            <input
              type="text"
              value={form.hospital_clinic}
              onChange={(e) => setForm({ ...form, hospital_clinic: e.target.value })}
              placeholder="Mount Novena Hospital"
              className="form-input"
            />
          </Field>
          <Field label="Location (OT / Day Surgery / Endoscopy, etc.)">
            <input
              type="text"
              value={form.ot_location}
              onChange={(e) => setForm({ ...form, ot_location: e.target.value })}
              placeholder="Main OT"
              className="form-input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <input
                type="date"
                value={form.surgery_date}
                onChange={(e) => setForm({ ...form, surgery_date: e.target.value })}
                className="form-input"
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={form.surgery_time}
                onChange={(e) => setForm({ ...form, surgery_time: e.target.value })}
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Duration (hours)">
            <input
              type="number"
              step="0.5"
              value={form.duration_hours}
              onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
              placeholder="2"
              className="form-input"
            />
          </Field>
        </Section>

        {/* Section 3: Anaesthesia preference */}
        <Section title="Anaesthesia preference" number={3}>
          <div className="space-y-2">
            {anaesthesiaOptions.map((opt) => (
              <label
                key={opt.key}
                onClick={() => toggleAnaesthesia(opt.key)}
                className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${
                  form.anaesthesia_preferences.includes(opt.key)
                    ? 'border-brand bg-brand-tint/30'
                    : 'border-line hover:bg-surface-2'
                }`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                  form.anaesthesia_preferences.includes(opt.key)
                    ? 'bg-brand border-brand'
                    : 'border-line'
                }`}>
                  {form.anaesthesia_preferences.includes(opt.key) && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm text-ink">{opt.label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* Section 4: In what order to book anaesthetist */}
        <Section title="In what order to book anaesthetist" number={4}>
          <div className="grid grid-cols-2 gap-3">
            <CascadeCard
              selected={form.cascade_mode === 'sequential'}
              onClick={() => setForm({ ...form, cascade_mode: 'sequential' })}
              icon={<Layers className="w-5 h-5" />}
              title="Ranked order"
              description="Contact anaesthetists one at a time in ranked order. 5-minute reply window each."
              badge="Ranked order"
            />
            <CascadeCard
              selected={form.cascade_mode === 'simultaneous'}
              onClick={() => setForm({ ...form, cascade_mode: 'simultaneous' })}
              icon={<Zap className="w-5 h-5" />}
              title="Fastest fingers first"
              description="Message all 5 at once. 8-minute window. First to reply 1 wins. Others auto-released."
              badge="Fastest first"
            />
          </div>
        </Section>

        {/* Section 5: List of Surgeons favourite Anaesthetist */}
        <Section title="List of Surgeons favourite Anaesthetist" number={5}>
          <Field label="Surgeon">
            <select
              value={selectedSurgeonId}
              onChange={(e) => setSelectedSurgeonId(e.target.value)}
              className="form-input"
            >
              <option value="">Select surgeon...</option>
              {surgeons.map((s) => (
                <option key={s.id} value={s.id}>Dr {s.full_name}{!s.active ? ' (pending invite)' : ''}</option>
              ))}
            </select>
          </Field>

          {selectedSurgeonId && (
            <div className="space-y-2">
              {preferences.map((pref, i) => (
                <div key={pref.id} className="flex items-center gap-2 p-3 border border-line rounded-sm">
                  <span className="figure text-sm font-medium text-muted-2 w-6">{pref.rank}</span>
                  <RoleName role="anaesthetist" name={`Dr ${pref.anaesthetist?.full_name || 'Unknown'}`} />
                  <span className="flex-1" />
                  <button type="button" onClick={() => movePreference(i, -1)} disabled={i === 0} className="p-1 text-muted-2 hover:text-ink-2 disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => movePreference(i, 1)} disabled={i === preferences.length - 1} className="p-1 text-muted-2 hover:text-ink-2 disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => removePreference(pref.id)} className="p-1 text-crit border border-crit-line rounded-sm bg-crit-bg hover:opacity-80">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {preferences.length < 5 && (
                <button
                  type="button"
                  onClick={() => setShowDirectory(true)}
                  className="w-full p-3 border border-dashed border-line rounded-sm text-sm text-muted hover:border-brand hover:text-brand transition-colors"
                >
                  + Add from directory
                </button>
              )}

              <p className="text-xs text-muted-2">
                System contacts in this order. Changes here only affect this booking — to update the saved list go to Settings.
              </p>
            </div>
          )}
        </Section>

        {/* Bottom buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex-1 py-2.5 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2"
          >
            Save as draft
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit and start request'}
          </button>
        </div>
      </form>

      {/* Directory modal */}
      {showDirectory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowDirectory(false)}>
          <div className="bg-surface rounded w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-line">
              <h3 className="text-sm font-semibold text-ink mb-3">Add anaesthetist</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-2" />
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search by name or hospital..."
                  className="form-input pl-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAnaesthetists.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addFromDirectory(a)}
                  className="w-full flex items-center gap-2 p-3 rounded-sm hover:bg-surface-2 text-left"
                >
                  <div className="flex-1">
                    <RoleName role="anaesthetist" name={`Dr ${a.full_name}`} />
                    <p className="text-xs text-muted-2 mt-0.5">{a.hospitals?.join(', ') || 'No hospitals listed'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-2" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, number, subtitle, children }: { title: string; number: number; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded p-5 space-y-4 shadow-sm">
      <div>
        <div className="flex items-center gap-2">
          <span className="figure w-6 h-6 rounded-full bg-brand-tint text-brand flex items-center justify-center text-xs font-semibold">
            {number}
          </span>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-muted-2 ml-8 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CascadeCard({ selected, onClick, icon, title, description, badge }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string; badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 border rounded text-left transition-colors ${
        selected ? 'border-brand bg-brand-tint/30' : 'border-line hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${selected ? 'bg-brand text-white' : 'bg-neut-bg text-neut'}`}>
          {icon}
        </div>
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <p className="text-xs text-muted mb-2">{description}</p>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neut-bg text-neut">
        {badge}
      </span>
    </button>
  );
}
