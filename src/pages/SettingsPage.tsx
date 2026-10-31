import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { RoleBadge, RoleName } from '@/components/Badges';
import { ReorderableList } from '@/components/ReorderableList';
import { normalisePhone, INVALID_PHONE_MESSAGE } from '@/lib/utils';
import { stripDoctorTitle } from '@/lib/names';
import { usePracticeNames, anaesthetistName, practiceNameFor, type PracticeNames } from '@/lib/anaesthetistNames';
import type { User, Anaesthetist, AnaesthetistPreference, Practice, PracticeSurgeon } from '@/types';
import {
  ArrowLeft, Search, Plus, X, Trash2, Send, ShieldAlert, Contact
} from 'lucide-react';

type Tab = 'practice' | 'users' | 'directory' | 'lists' | 'admin';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('practice');
  const [practice, setPractice] = useState<Practice | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<Anaesthetist[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [linkedSurgeons, setLinkedSurgeons] = useState<User[]>([]);
  const [inUse, setInUse] = useState<Set<string>>(new Set());
  const { names, reload: reloadNames } = usePracticeNames([user?.practice_id]);

  const loadPractice = useCallback(async () => {
    if (!user?.practice_id) return;
    const { data } = await supabase.from('practices').select('*').eq('id', user.practice_id).maybeSingle();
    if (data) setPractice(data as Practice);
  }, [user]);

  const loadUsers = useCallback(async () => {
    if (!user?.practice_id) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('practice_id', user.practice_id)
      .order('full_name');
    setUsers((data || []) as User[]);
    setSurgeons((data || []).filter((u) => u.role === 'surgeon' && !u.archived) as User[]);
  }, [user]);

  const loadLinkedSurgeons = useCallback(async () => {
    if (!user?.practice_id) return;
    const { data } = await supabase
      .from('practice_surgeons')
      .select('surgeon:users!practice_surgeons_surgeon_id_fkey(*)')
      .eq('practice_id', user.practice_id);
    const linked = (data || [])
      .map((l) => (l as unknown as { surgeon: User }).surgeon)
      .filter(Boolean);
    setLinkedSurgeons(linked);
  }, [user]);

  const loadAnaesthetists = useCallback(async () => {
    const { data } = await supabase.from('anaesthetists').select('*').order('full_name');
    setAnaesthetists((data || []) as Anaesthetist[]);
    // Ids of anaesthetists on any booking or request, across all practices
    // (RLS hides other practices' bookings, so this comes from an RPC).
    const { data: used } = await supabase.rpc('anaesthetists_in_use');
    setInUse(new Set(((used || []) as unknown[]).map((r) =>
      typeof r === 'string' ? r : String(Object.values(r as Record<string, unknown>)[0]))));
  }, []);

  useEffect(() => {
    loadPractice();
    loadUsers();
    loadLinkedSurgeons();
    loadAnaesthetists();
  }, [loadPractice, loadUsers, loadLinkedSurgeons, loadAnaesthetists]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'practice', label: 'Practice' },
    { key: 'users', label: 'Surgeons & Secretaries' },
    { key: 'directory', label: 'Anaesthetist Directory' },
    { key: 'lists', label: 'Anaesthetist Lists' },
    { key: 'admin', label: 'Admin' },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 text-muted hover:text-ink-2 hover:bg-surface-2 rounded-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-ink">Settings</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto mb-6 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted hover:text-ink-2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'practice' && <PracticeTab practice={practice} onUpdate={loadPractice} />}
        {tab === 'users' && (
          <UsersTab
            users={users}
            linkedSurgeons={linkedSurgeons}
            currentUserId={user?.id || ''}
            practiceId={user?.practice_id || ''}
            onChanged={async () => { await loadUsers(); await loadLinkedSurgeons(); }}
          />
        )}
        {tab === 'directory' && (
          <DirectoryTab
            anaesthetists={anaesthetists}
            onChanged={loadAnaesthetists}
            viewer={user}
            names={names}
            onNamesChanged={reloadNames}
            inUse={inUse}
          />
        )}
        {tab === 'lists' && (
          <ListsTab
            surgeons={[...surgeons, ...linkedSurgeons]}
            anaesthetists={anaesthetists}
            names={names}
            practiceId={user?.practice_id}
          />
        )}
        {tab === 'admin' && user?.role === 'practice_admin' && <AdminTab users={users} currentUserId={user.id} onChanged={loadUsers} />}
        {tab === 'admin' && user?.role !== 'practice_admin' && (
          <p className="text-sm text-muted-2">Admin settings are only available to practice admins.</p>
        )}
      </div>
    </div>
  );
}

function PracticeTab({ practice, onUpdate }: { practice: Practice | null; onUpdate: () => void }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (practice) setName(practice.name);
  }, [practice]);

  const handleSave = async () => {
    if (!practice) return;
    const { error } = await supabase.from('practices').update({ name }).eq('id', practice.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success('Practice name updated');
    onUpdate();
  };

  if (!practice) return <p className="text-sm text-muted-2">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink mb-4">Practice details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Practice name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Practice ID</label>
            <input type="text" value={practice.id} disabled className="form-input text-muted-2 font-mono text-xs" />
          </div>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users, linkedSurgeons, currentUserId, practiceId, onChanged }: {
  users: User[]; linkedSurgeons: User[]; currentUserId: string; practiceId: string; onChanged: () => void | Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'surgeon' | 'secretary'>('surgeon');
  const [adding, setAdding] = useState(false);

  const handleAddSurgeon = async (phone: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-surgeon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ phone, full_name: newName.trim() }),
    });
    const result = await res.json();

    if (!res.ok) {
      toast.error(result.error || 'Failed to add surgeon');
      return false;
    }

    if (result.linked) {
      toast.success(`Dr ${result.surgeon.full_name} linked to this practice — they already have an account elsewhere, so no new invite is needed.`);
    } else {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type: 'invite', token: result.token, phone }),
      });
      toast.success('Surgeon added. Invite sent via WhatsApp.');
    }
    return true;
  };

  const handleAddSecretary = async (phone: string) => {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('users').insert({
      practice_id: practiceId,
      full_name: newName.trim(),
      phone,
      role: 'secretary',
      invite_token: token,
      invite_expires_at: expiresAt,
      active: false,
    });

    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Phone number already registered' : 'Failed to add user');
      return false;
    }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'invite', token, phone }),
    });

    toast.success('Secretary added. Invite sent via WhatsApp.');
    return true;
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Enter name and phone'); return; }
    if (!practiceId) { toast.error('No practice found'); return; }
    const phone = normalisePhone(newPhone);
    if (!phone) { toast.error(INVALID_PHONE_MESSAGE); return; }
    setAdding(true);

    const ok = newRole === 'surgeon' ? await handleAddSurgeon(phone) : await handleAddSecretary(phone);

    if (ok) {
      setNewName('');
      setNewPhone('');
      setShowAdd(false);
      await onChanged();
    }
    setAdding(false);
  };

  const handleUnlink = async (u: User) => {
    if (!confirm(`Unlink Dr ${u.full_name} from this practice? They'll remain registered at their home practice.`)) return;
    const { error } = await supabase.from('practice_surgeons').delete().eq('practice_id', practiceId).eq('surgeon_id', u.id);
    if (error) { toast.error('Failed to unlink'); return; }
    toast.success('Surgeon unlinked');
    onChanged();
  };

  const handleResendInvite = async (u: User) => {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('users').update({ invite_token: token, invite_expires_at: expiresAt }).eq('id', u.id);
    if (error) { toast.error('Failed to resend'); return; }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'invite', token, phone: u.phone }),
    });

    toast.success('Invite resent via WhatsApp');
    onChanged();
  };

  const handleRemove = async (u: User) => {
    if (u.id === currentUserId) { toast.error('Cannot remove yourself'); return; }
    if (!confirm(`Remove ${u.full_name}?`)) return;

    const { error } = await supabase.from('users').delete().eq('id', u.id);
    if (!error) {
      toast.success('User removed');
      onChanged();
      return;
    }

    if (error.code === '23503') {
      const { error: archiveError } = await supabase.from('users').update({ archived: true }).eq('id', u.id);
      if (archiveError) { toast.error('Failed to remove user'); return; }
      toast.success(`${u.full_name} has existing bookings, so they were archived instead of deleted — no longer bookable for new cases, but their case history is kept.`);
      onChanged();
      return;
    }

    toast.error('Failed to remove user');
  };

  const handleRestore = async (u: User) => {
    const { error } = await supabase.from('users').update({ archived: false }).eq('id', u.id);
    if (error) { toast.error('Failed to restore'); return; }
    toast.success(`${u.full_name} restored`);
    onChanged();
  };

  const getStatus = (u: User) => {
    if (u.archived) return { label: 'Archived', class: 'bg-neut-bg text-neut' };
    if (u.active) return { label: 'Active', class: 'bg-ok-bg text-ok' };
    if (u.invite_token) return { label: 'Invite sent', class: 'bg-warn-bg text-warn' };
    return { label: 'Not sent', class: 'bg-neut-bg text-neut' };
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => { setNewRole('surgeon'); setShowAdd(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong">
          <Plus className="w-4 h-4" /> Add surgeon
        </button>
        <button onClick={() => { setNewRole('secretary'); setShowAdd(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong">
          <Plus className="w-4 h-4" /> Add secretary
        </button>
      </div>

      <div className="bg-surface border border-line rounded overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted">Role</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted">Phone</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const status = getStatus(u);
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-ink">{u.full_name}{isSelf && <span className="text-xs text-muted-2 ml-1">(you)</span>}</td>
                  <td className="px-4 py-3 text-ink-2 text-xs">{u.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.class}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <div className="flex justify-end gap-1">
                        {u.archived ? (
                          <button onClick={() => handleRestore(u)} className="px-2.5 py-1 text-xs font-medium text-brand border border-brand rounded-sm hover:bg-brand-tint" title="Restore">
                            Restore
                          </button>
                        ) : (
                          <>
                            {!u.active && (
                              <button onClick={() => handleResendInvite(u)} className="p-1.5 text-muted-2 hover:text-ink-2 hover:bg-surface-2 rounded-sm" title="Resend invite">
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleRemove(u)} className="p-1.5 text-crit hover:bg-crit-bg rounded-sm" title="Remove">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <p className="text-sm text-muted-2 p-6 text-center">No users yet.</p>}
      </div>

      {linkedSurgeons.length > 0 && (
        <div className="bg-surface border border-line rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold text-ink">Linked surgeons</h3>
            <p className="text-xs text-muted-2 mt-0.5">Surgeons who also work elsewhere and are shared into this practice for booking. Their account is managed at their home practice.</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {linkedSurgeons.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-ink">{u.full_name}</td>
                  <td className="px-4 py-3 text-ink-2 text-xs">{u.phone}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleUnlink(u)} className="p-1.5 text-crit hover:bg-crit-bg rounded-sm" title="Unlink">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-4">Add {newRole}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="form-input" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Mobile number</label>
                <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-muted border-r border-line">+65</span>
                  <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="9232 2222" className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none" />
                </div>
                {newRole === 'surgeon' && (
                  <p className="text-xs text-muted-2 mt-1">If this number already belongs to a surgeon at another practice, they'll be linked here instead of getting a new invite.</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">Cancel</button>
                <button onClick={handleAdd} disabled={adding} className="flex-1 py-2.5 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong disabled:opacity-50">
                  {adding ? 'Adding...' : 'Add & send invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectoryTab({ anaesthetists, onChanged, viewer, names, onNamesChanged, inUse }: {
  anaesthetists: Anaesthetist[];
  onChanged: () => void;
  viewer: User | null;
  names: PracticeNames;
  onNamesChanged: () => void;
  inUse: Set<string>;
}) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newHospitals, setNewHospitals] = useState('');
  // "Already in the directory" prompt, and the "Edit clinic name" dialog.
  const [existing, setExisting] = useState<{ anaesthetist: Anaesthetist; name: string } | null>(null);
  const [editing, setEditing] = useState<{ anaesthetist: Anaesthetist; name: string } | null>(null);

  const practiceId = viewer?.practice_id ?? null;
  const isSuperadmin = viewer?.role === 'superadmin';
  const isClinicStaff = !!practiceId && (viewer?.role === 'practice_admin' || viewer?.role === 'secretary');
  // Mirrors the anaesthetists_update/delete policies: the practice that added
  // them, or a superadmin.
  const canManage = (a: Anaesthetist) =>
    isSuperadmin || (isClinicStaff && !!a.added_by_practice_id && a.added_by_practice_id === practiceId);
  const displayOf = (a: Anaesthetist) => anaesthetistName(names, a, practiceId);

  const filtered = anaesthetists.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return displayOf(a).toLowerCase().includes(q)
      || a.full_name.toLowerCase().includes(q)
      || a.hospitals?.some((h) => h.toLowerCase().includes(q));
  });

  // Contact Picker API: Android Chrome only (no iOS Safari / desktop support).
  // Falls back to the manual form below when unavailable — nothing else to do.
  const contactPickerSupported = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  const handleImportFromContacts = async () => {
    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
      if (!contacts || contacts.length === 0) return;
      const contact = contacts[0];
      let tel = ((contact.tel && contact.tel[0]) || '').replace(/[\s-]/g, '');
      if (tel.startsWith('+65')) tel = tel.slice(3);
      else if (tel.startsWith('65') && tel.length > 8) tel = tel.slice(2);
      setNewName((contact.name && contact.name[0]) || '');
      setNewPhone(tel);
      setShowAdd(true);
    } catch {
      // User cancelled the picker — nothing to do.
    }
  };

  const resetAddForm = () => {
    setNewName(''); setNewPhone(''); setNewHospitals('');
    setShowAdd(false);
  };

  const handleAdd = async () => {
    const name = stripDoctorTitle(newName);
    if (!name || !newPhone.trim()) { toast.error('Enter name and phone'); return; }
    const phone = normalisePhone(newPhone);
    if (!phone) { toast.error(INVALID_PHONE_MESSAGE); return; }

    // Phone is the identity key: if this number is already in the shared
    // directory, don't create a second record — offer a clinic name instead.
    const { data: found } = await supabase.from('anaesthetists').select('*').eq('phone', phone).maybeSingle();
    if (found) {
      resetAddForm();
      if (!isClinicStaff) {
        toast(`This number is already in the directory as Dr ${stripDoctorTitle((found as Anaesthetist).full_name)}`);
        return;
      }
      setExisting({ anaesthetist: found as Anaesthetist, name });
      return;
    }

    const hospitals = newHospitals.split(',').map((h) => h.trim()).filter(Boolean);
    // added_by_practice_id is filled by the column default (the adder's practice).
    const { error } = await supabase.from('anaesthetists').insert({
      full_name: name,
      phone,
      hospitals,
      active: true,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Phone number already exists' : 'Failed to add');
      return;
    }
    toast.success('Anaesthetist added');
    resetAddForm();
    onChanged();
  };

  const savePracticeName = async (anaesthetistId: string, rawName: string) => {
    const name = stripDoctorTitle(rawName);
    if (!practiceId || !name) { toast.error('Enter a name'); return false; }
    const { error } = await supabase
      .from('anaesthetist_practice_names')
      .upsert({ anaesthetist_id: anaesthetistId, practice_id: practiceId, display_name: name },
        { onConflict: 'anaesthetist_id,practice_id' });
    if (error) { toast.error('Failed to save name'); return false; }
    toast.success(`Saved. Your clinic will see them as Dr ${name}`);
    onNamesChanged();
    return true;
  };

  const clearPracticeName = async (anaesthetistId: string) => {
    if (!practiceId) return;
    const { error } = await supabase
      .from('anaesthetist_practice_names')
      .delete()
      .eq('anaesthetist_id', anaesthetistId)
      .eq('practice_id', practiceId);
    if (error) { toast.error('Failed to clear name'); return; }
    setEditing(null);
    onNamesChanged();
  };

  const handleArchive = async (a: Anaesthetist) => {
    const name = displayOf(a);
    if (!confirm(`Archive Dr ${name}? They won't be offered for new requests. Their past bookings and request history are kept, and you can restore them at any time.`)) return;
    const { data, error } = await supabase.from('anaesthetists').update({ active: false }).eq('id', a.id).select('id');
    if (error || !data?.length) { toast.error('Failed to archive'); return; }
    toast.success(`Dr ${name} archived`);
    onChanged();
  };

  const handleRestore = async (a: Anaesthetist) => {
    const name = displayOf(a);
    const { data, error } = await supabase.from('anaesthetists').update({ active: true }).eq('id', a.id).select('id');
    if (error || !data?.length) { toast.error('Failed to restore'); return; }
    toast.success(`Dr ${name} restored and can be offered for new requests again`);
    onChanged();
  };

  const handleDelete = async (a: Anaesthetist) => {
    const name = displayOf(a);
    if (!confirm(`Delete Dr ${name} from the directory? This can't be undone.`)) return;
    const { data, error } = await supabase.from('anaesthetists').delete().eq('id', a.id).select('id');
    // 23503: still referenced by a booking or request (ON DELETE RESTRICT).
    if (error?.code === '23503') {
      toast.error(`Dr ${name} has bookings, so they can't be deleted. Archive them instead.`);
      onChanged();
      return;
    }
    if (error || !data?.length) { toast.error('Failed to delete'); return; }
    toast.success(`Dr ${name} deleted`);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-2" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or hospital..." className="form-input pl-9" />
        </div>
        {contactPickerSupported && (
          <button onClick={handleImportFromContacts} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">
            <Contact className="w-4 h-4" /> Import from contacts
          </button>
        )}
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong">
          <Plus className="w-4 h-4" /> Add anaesthetist
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map((a) => {
          const display = displayOf(a);
          const canonical = stripDoctorTitle(a.full_name);
          return (
            <div key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 bg-surface border border-line rounded-sm ${a.active ? '' : 'opacity-70'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <RoleName role="anaesthetist" name={`Dr ${display}`} />
                  {!a.active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-muted border border-line">Archived</span>
                  )}
                </div>
                {display !== canonical && (
                  <p className="text-xs text-muted-2 mt-0.5">Directory name: Dr {canonical}</p>
                )}
                <p className="text-xs text-muted mt-0.5">{a.hospitals?.join(', ') || 'No hospitals listed'} · {a.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                {isClinicStaff && (
                  <button
                    onClick={() => setEditing({ anaesthetist: a, name: display })}
                    className="px-3 py-1.5 text-xs font-medium text-brand border border-line rounded-sm hover:bg-surface-2"
                  >
                    Edit clinic name
                  </button>
                )}
                {canManage(a) ? (
                  !a.active ? (
                    <button onClick={() => handleRestore(a)} className="px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">Restore</button>
                  ) : inUse.has(a.id) ? (
                    <button onClick={() => handleArchive(a)} className="px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">Archive</button>
                  ) : (
                    <button onClick={() => handleDelete(a)} className="px-3 py-1.5 text-xs font-medium text-crit border border-crit-line rounded-sm bg-crit-bg hover:opacity-80">Delete</button>
                  )
                ) : (
                  <span className="text-xs text-muted-2">{a.added_by_practice_id ? 'Managed by another clinic' : 'Shared directory'}</span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-muted-2 p-4 text-center">No anaesthetists found</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-4">Add anaesthetist</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
                <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-muted border-r border-line">Dr</span>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none" autoFocus />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Mobile number</label>
                <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-muted border-r border-line">+65</span>
                  <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="9232 2222" className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Hospitals (comma separated)</label>
                <input type="text" value={newHospitals} onChange={(e) => setNewHospitals(e.target.value)} placeholder="Mount Novenal, Gleneagles" className="form-input" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">Cancel</button>
                <button onClick={handleAdd} className="flex-1 py-2.5 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {existing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setExisting(null)}>
          <div className="bg-surface rounded w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-2">Already in the directory</h3>
            <p className="text-sm text-muted mb-4">
              This number belongs to Dr {stripDoctorTitle(existing.anaesthetist.full_name)}, who is already in the shared directory. What does your clinic call them?
            </p>
            <label className="block text-xs font-medium text-muted mb-1.5">Name used at your clinic</label>
            <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
              <span className="px-3 py-2.5 text-sm text-muted border-r border-line">Dr</span>
              <input
                type="text"
                value={existing.name}
                onChange={(e) => setExisting({ ...existing, name: e.target.value })}
                className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setExisting(null)} className="flex-1 py-2.5 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2">Cancel</button>
              <button
                onClick={async () => { if (await savePracticeName(existing.anaesthetist.id, existing.name)) setExisting(null); }}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong"
              >
                Save name
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="bg-surface rounded w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-4">Edit clinic name</h3>
            <label className="block text-xs font-medium text-muted mb-1.5">Name used at your clinic</label>
            <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
              <span className="px-3 py-2.5 text-sm text-muted border-r border-line">Dr</span>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-2 mt-1.5">Directory name: Dr {stripDoctorTitle(editing.anaesthetist.full_name)}</p>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => clearPracticeName(editing.anaesthetist.id)}
                disabled={!practiceNameFor(names, editing.anaesthetist.id, practiceId)}
                className="flex-1 py-2.5 text-sm font-medium text-ink-2 border border-line rounded-sm hover:bg-surface-2 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={async () => { if (await savePracticeName(editing.anaesthetist.id, editing.name)) setEditing(null); }}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ListsTab({ surgeons, anaesthetists, names, practiceId }: {
  surgeons: User[];
  anaesthetists: Anaesthetist[];
  names: PracticeNames;
  practiceId: string | null | undefined;
}) {
  const [selectedSurgeon, setSelectedSurgeon] = useState('');
  const [prefs, setPrefs] = useState<AnaesthetistPreference[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [search, setSearch] = useState('');

  const loadPrefs = useCallback(async () => {
    if (!selectedSurgeon) { setPrefs([]); return; }
    const { data } = await supabase
      .from('anaesthetist_preferences')
      .select(`*, anaesthetist:anaesthetists!anaesthetist_preferences_anaesthetist_id_fkey(*)`)
      .eq('surgeon_id', selectedSurgeon)
      .order('rank');
    setPrefs((data || []) as unknown as AnaesthetistPreference[]);
  }, [selectedSurgeon]);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const savePrefs = async (updated: AnaesthetistPreference[]) => {
    if (!selectedSurgeon) return;
    await supabase.from('anaesthetist_preferences').delete().eq('surgeon_id', selectedSurgeon);
    if (updated.length > 0) {
      await supabase.from('anaesthetist_preferences').insert(
        updated.map((p, i) => ({
          surgeon_id: selectedSurgeon,
          anaesthetist_id: p.anaesthetist_id,
          rank: i + 1,
        }))
      );
    }
    loadPrefs();
  };

  const handleReorder = (newItems: AnaesthetistPreference[]) => {
    setPrefs(newItems);
    savePrefs(newItems);
  };

  const remove = (id: string) => {
    const updated = prefs.filter((p) => p.id !== id);
    setPrefs(updated);
    savePrefs(updated);
  };

  const add = (a: Anaesthetist) => {
    if (prefs.length >= 5) { toast.error('Maximum 5'); return; }
    if (prefs.some((p) => p.anaesthetist_id === a.id)) { toast.error('Already in list'); return; }
    const newPref: AnaesthetistPreference = {
      id: `temp-${Date.now()}`,
      surgeon_id: selectedSurgeon,
      anaesthetist_id: a.id,
      rank: prefs.length + 1,
      created_at: new Date().toISOString(),
      anaesthetist: a,
    };
    savePrefs([...prefs, newPref]);
    setShowDirectory(false);
    setSearch('');
  };

  // Archived anaesthetists can't be added to a list.
  const filteredAnaesthetists = anaesthetists.filter((a) => {
    if (!a.active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return anaesthetistName(names, a, practiceId).toLowerCase().includes(q)
      || a.full_name.toLowerCase().includes(q)
      || a.hospitals?.some((h) => h.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Select surgeon</label>
        <select value={selectedSurgeon} onChange={(e) => setSelectedSurgeon(e.target.value)} className="form-input max-w-xs">
          <option value="">Choose surgeon...</option>
          {surgeons.map((s) => <option key={s.id} value={s.id}>Dr {s.full_name}</option>)}
        </select>
      </div>

      {selectedSurgeon && (
        <div className="space-y-2">
          {prefs.length > 0 && (
            <p className="text-xs text-muted-2">Drag to reorder by preference (1 = first choice).</p>
          )}
          <ReorderableList
            items={prefs}
            onReorder={handleReorder}
            getKey={(p) => p.id}
            renderItem={(item) => (
              <div className={`flex items-center gap-2 ${item.anaesthetist && !item.anaesthetist.active ? 'opacity-60' : ''}`}>
                <RoleName role="anaesthetist" name={`Dr ${anaesthetistName(names, item.anaesthetist, practiceId)}`} />
                {item.anaesthetist && !item.anaesthetist.active && (
                  <span className="text-xs text-muted-2">Archived – won't be sent requests</span>
                )}
                <span className="flex-1" />
                <button onClick={() => remove(item.id)} className="p-1 text-crit border border-crit-line rounded-sm bg-crit-bg hover:opacity-80"><X className="w-4 h-4" /></button>
              </div>
            )}
          />

          {prefs.length === 0 && (
            <p className="text-sm text-muted-2 text-center py-4">No preferences set. Add an anaesthetist below.</p>
          )}

          {prefs.length < 5 && (
            <button onClick={() => setShowDirectory(true)} className="w-full p-3 border border-dashed border-line rounded-sm text-sm text-muted hover:border-brand hover:text-brand transition-colors">
              + Add from directory
            </button>
          )}
        </div>
      )}

      {showDirectory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowDirectory(false)}>
          <div className="bg-surface rounded w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-line">
              <h3 className="text-sm font-semibold text-ink mb-3">Add anaesthetist</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-2" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="form-input pl-9" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAnaesthetists.map((a) => (
                <button key={a.id} onClick={() => add(a)} className="w-full flex items-center gap-2 p-3 rounded-sm hover:bg-surface-2 text-left">
                  <div className="flex-1">
                    <RoleName role="anaesthetist" name={`Dr ${anaesthetistName(names, a, practiceId)}`} />
                    <p className="text-xs text-muted-2 mt-0.5">{a.hospitals?.join(', ') || ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminTab({ users, currentUserId, onChanged }: { users: User[]; currentUserId: string; onChanged: () => void }) {
  const [newAdminId, setNewAdminId] = useState('');
  const secretaries = users.filter((u) => u.role === 'secretary' && u.id !== currentUserId);

  const handleTransfer = async () => {
    if (!newAdminId) { toast.error('Select a secretary'); return; }
    if (!confirm('Transfer admin role? You will become a regular secretary.')) return;

    const { error: selfError } = await supabase.from('users').update({ role: 'secretary' }).eq('id', currentUserId);
    if (selfError) { toast.error('Failed to transfer'); return; }

    const { error: newError } = await supabase.from('users').update({ role: 'practice_admin' }).eq('id', newAdminId);
    if (newError) { toast.error('Failed to assign new admin'); return; }

    const { data: practiceData } = await supabase.from('practices').select('id').eq('admin_user_id', currentUserId).maybeSingle();
    if (practiceData) {
      await supabase.from('practices').update({ admin_user_id: newAdminId }).eq('id', practiceData.id);
    }

    toast.success('Admin role transferred');
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink mb-4">Transfer admin role</h2>
        <p className="text-xs text-muted mb-3">Transfer the practice admin role to another secretary. You will become a regular secretary.</p>
        <div className="flex gap-2">
          <select value={newAdminId} onChange={(e) => setNewAdminId(e.target.value)} className="form-input flex-1">
            <option value="">Select secretary...</option>
            {secretaries.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <button onClick={handleTransfer} disabled={!newAdminId} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-sm hover:bg-brand-strong disabled:opacity-50">
            Transfer
          </button>
        </div>
      </div>

      <div className="bg-crit-bg border border-crit-line rounded p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-5 h-5 text-crit" />
          <h2 className="text-sm font-semibold text-crit">Danger zone</h2>
        </div>
        <p className="text-xs text-muted">Contact the platform superadmin to delete the practice or reset all data.</p>
      </div>
    </div>
  );
}
