import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { RoleBadge, SurgeonBadge, AnaesthetistBadge } from '@/components/Badges';
import { ReorderableList } from '@/components/ReorderableList';
import { normalisePhone } from '@/lib/utils';
import type { User, Anaesthetist, AnaesthetistPreference, Practice } from '@/types';
import {
  ArrowLeft, Search, Plus, X, Trash2, Send, ShieldAlert
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
    setSurgeons((data || []).filter((u) => u.role === 'surgeon') as User[]);
  }, [user]);

  const loadAnaesthetists = useCallback(async () => {
    const { data } = await supabase.from('anaesthetists').select('*').order('full_name');
    setAnaesthetists((data || []) as Anaesthetist[]);
  }, []);

  useEffect(() => {
    loadPractice();
    loadUsers();
    loadAnaesthetists();
  }, [loadPractice, loadUsers, loadAnaesthetists]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'practice', label: 'Practice' },
    { key: 'users', label: 'Surgeons & Secretaries' },
    { key: 'directory', label: 'Anaesthetist Directory' },
    { key: 'lists', label: 'Anaesthetist Lists' },
    { key: 'admin', label: 'Admin' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">Settings</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto mb-6 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[#3C3489] text-[#3C3489]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'practice' && <PracticeTab practice={practice} onUpdate={loadPractice} />}
        {tab === 'users' && <UsersTab users={users} currentUserId={user?.id || ''} onChanged={loadUsers} />}
        {tab === 'directory' && <DirectoryTab anaesthetists={anaesthetists} onChanged={loadAnaesthetists} />}
        {tab === 'lists' && <ListsTab surgeons={surgeons} anaesthetists={anaesthetists} />}
        {tab === 'admin' && user?.role === 'practice_admin' && <AdminTab users={users} currentUserId={user.id} onChanged={loadUsers} />}
        {tab === 'admin' && user?.role !== 'practice_admin' && (
          <p className="text-sm text-gray-400">Admin settings are only available to practice admins.</p>
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

  if (!practice) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 p-5" style={{ borderRadius: 12, borderWidth: 0.5 }}>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Practice details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Practice name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Practice ID</label>
            <input type="text" value={practice.id} disabled className="form-input bg-gray-50 text-gray-400 font-mono text-xs" />
          </div>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670]">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users, currentUserId, onChanged }: { users: User[]; currentUserId: string; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'surgeon' | 'secretary'>('surgeon');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Enter name and phone'); return; }
    setAdding(true);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const phone = normalisePhone(newPhone);

    const { data: currentUser } = await supabase.from('users').select('practice_id').eq('id', currentUserId).maybeSingle();
    const practiceId = currentUser?.practice_id;

    if (!practiceId) { toast.error('No practice found'); setAdding(false); return; }

    const { error } = await supabase.from('users').insert({
      practice_id: practiceId,
      full_name: newName.trim(),
      phone,
      role: newRole,
      invite_token: token,
      invite_expires_at: expiresAt,
      active: false,
    });

    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Phone number already registered' : 'Failed to add user');
      setAdding(false);
      return;
    }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'invite', token, phone }),
    });

    toast.success(`${newRole === 'surgeon' ? 'Surgeon' : 'Secretary'} added. Invite SMS sent.`);
    setNewName('');
    setNewPhone('');
    setShowAdd(false);
    setAdding(false);
    onChanged();
  };

  const handleResendInvite = async (u: User) => {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('users').update({ invite_token: token, invite_expires_at: expiresAt }).eq('id', u.id);
    if (error) { toast.error('Failed to resend'); return; }

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'invite', token, phone: u.phone }),
    });

    toast.success('Invite SMS resent');
    onChanged();
  };

  const handleRemove = async (u: User) => {
    if (u.id === currentUserId) { toast.error('Cannot remove yourself'); return; }
    if (!confirm(`Remove ${u.full_name}?`)) return;
    const { error } = await supabase.from('users').delete().eq('id', u.id);
    if (error) { toast.error('Failed to remove user'); return; }
    toast.success('User removed');
    onChanged();
  };

  const getStatus = (u: User) => {
    if (u.active) return { label: 'Active', class: 'bg-green-100 text-green-700' };
    if (u.invite_token) return { label: 'Invite sent', class: 'bg-amber-100 text-amber-700' };
    return { label: 'Not sent', class: 'bg-gray-100 text-gray-500' };
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => { setNewRole('surgeon'); setShowAdd(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670]">
          <Plus className="w-4 h-4" /> Add surgeon
        </button>
        <button onClick={() => { setNewRole('secretary'); setShowAdd(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670]">
          <Plus className="w-4 h-4" /> Add secretary
        </button>
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 12, borderWidth: 0.5 }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Phone</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const status = getStatus(u);
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-gray-900">{u.full_name}{isSelf && <span className="text-xs text-gray-400 ml-1">(you)</span>}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.class}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <div className="flex justify-end gap-1">
                        {!u.active && (
                          <button onClick={() => handleResendInvite(u)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded" title="Resend invite">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleRemove(u)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Add {newRole}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Full name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="form-input" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Mobile number</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-200">+65</span>
                  <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="9232 2222" className="flex-1 px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAdd} disabled={adding} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670] disabled:opacity-50">
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

function DirectoryTab({ anaesthetists, onChanged }: { anaesthetists: Anaesthetist[]; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newHospitals, setNewHospitals] = useState('');

  const filtered = anaesthetists.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.hospitals?.some((h) => h.toLowerCase().includes(q));
  });

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Enter name and phone'); return; }
    const hospitals = newHospitals.split(',').map((h) => h.trim()).filter(Boolean);
    const { error } = await supabase.from('anaesthetists').insert({
      full_name: newName.trim(),
      phone: normalisePhone(newPhone),
      hospitals,
      active: true,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Phone number already exists' : 'Failed to add');
      return;
    }
    toast.success('Anaesthetist added');
    setNewName(''); setNewPhone(''); setNewHospitals('');
    setShowAdd(false);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or hospital..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400" />
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670]">
          <Plus className="w-4 h-4" /> Add anaesthetist
        </button>
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 12, borderWidth: 0.5 }}>
        {filtered.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
            <AnaesthetistBadge />
            <div className="flex-1">
              <p className="text-sm text-gray-900">Dr {a.full_name}</p>
              <p className="text-xs text-gray-400">{a.hospitals?.join(', ') || 'No hospitals listed'} · {a.phone}</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400 p-4 text-center">No anaesthetists found</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Add anaesthetist</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Full name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="form-input" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Mobile number</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-200">+65</span>
                  <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="9232 2222" className="flex-1 px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Hospitals (comma separated)</label>
                <input type="text" value={newHospitals} onChange={(e) => setNewHospitals(e.target.value)} placeholder="Mount Novenal, Gleneagles" className="form-input" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAdd} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670]">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ListsTab({ surgeons, anaesthetists }: { surgeons: User[]; anaesthetists: Anaesthetist[] }) {
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

  const filteredAnaesthetists = anaesthetists.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.hospitals?.some((h) => h.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Select surgeon</label>
        <select value={selectedSurgeon} onChange={(e) => setSelectedSurgeon(e.target.value)} className="form-input max-w-xs">
          <option value="">Choose surgeon...</option>
          {surgeons.map((s) => <option key={s.id} value={s.id}>Dr {s.full_name}</option>)}
        </select>
      </div>

      {selectedSurgeon && (
        <div className="space-y-2">
          {prefs.length > 0 && (
            <p className="text-xs text-gray-400">Drag to reorder by preference (1 = first choice).</p>
          )}
          <ReorderableList
            items={prefs}
            onReorder={handleReorder}
            getKey={(p) => p.id}
            renderItem={(item) => (
              <div className="flex items-center gap-2">
                <AnaesthetistBadge />
                <span className="text-sm text-gray-900 flex-1">Dr {item.anaesthetist?.full_name || 'Unknown'}</span>
                <button onClick={() => remove(item.id)} className="p-1 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            )}
          />

          {prefs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No preferences set. Add an anaesthetist below.</p>
          )}

          {prefs.length < 5 && (
            <button onClick={() => setShowDirectory(true)} className="w-full p-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
              + Add from directory
            </button>
          )}
        </div>
      )}

      {showDirectory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowDirectory(false)}>
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] flex flex-col" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add anaesthetist</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAnaesthetists.map((a) => (
                <button key={a.id} onClick={() => add(a)} className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50 text-left">
                  <AnaesthetistBadge />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">Dr {a.full_name}</p>
                    <p className="text-xs text-gray-400">{a.hospitals?.join(', ') || ''}</p>
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
      <div className="bg-white border border-gray-200 p-5" style={{ borderRadius: 12, borderWidth: 0.5 }}>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Transfer admin role</h2>
        <p className="text-xs text-gray-500 mb-3">Transfer the practice admin role to another secretary. You will become a regular secretary.</p>
        <div className="flex gap-2">
          <select value={newAdminId} onChange={(e) => setNewAdminId(e.target.value)} className="form-input flex-1">
            <option value="">Select secretary...</option>
            {secretaries.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <button onClick={handleTransfer} disabled={!newAdminId} className="px-4 py-2 text-sm font-medium text-white bg-[#3C3489] rounded-lg hover:bg-[#2D2670] disabled:opacity-50">
            Transfer
          </button>
        </div>
      </div>

      <div className="bg-white border border-red-200 p-5" style={{ borderRadius: 12, borderWidth: 0.5 }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        </div>
        <p className="text-xs text-gray-500">Contact the platform superadmin to delete the practice or reset all data.</p>
      </div>
    </div>
  );
}
