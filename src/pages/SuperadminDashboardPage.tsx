import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { Practice, User, SuperadminAudit, Booking } from '@/types';
import { Activity, ArrowLeft, Building2, Users, Calendar, ExternalLink, Plus, X } from 'lucide-react';
import { normalisePhone, formatDate, formatDateTime } from '@/lib/utils';

export function SuperadminDashboardPage() {
  const navigate = useNavigate();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [audit, setAudit] = useState<SuperadminAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPracticeId, setOpenPracticeId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: pData } = await supabase.from('practices').select('*').order('created_at', { ascending: false });
    setPractices((pData || []) as Practice[]);

    const { data: uData } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    setUsers((uData || []) as User[]);

    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const { data: bData } = await supabase.from('bookings').select('*').gte('created_at', firstOfMonth);
    setBookings((bData || []) as Booking[]);

    const { data: aData } = await supabase.from('superadmin_audit').select('*').order('performed_at', { ascending: false }).limit(20);
    setAudit((aData || []) as SuperadminAudit[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { navigate('/superadmin/login'); return; }
      const { data: userData } = await supabase.from('users').select('role').eq('id', authUser.id).maybeSingle();
      if (userData?.role !== 'superadmin') { navigate('/superadmin/login'); return; }
      fetchData();
    })();
  }, [navigate, fetchData]);

  const handleOpenPractice = async (practice: Practice) => {
    setOpenPracticeId(practice.id);
    await supabase.from('superadmin_audit').insert({
      action: 'open_practice',
      target_practice_id: practice.id,
      notes: `Opened practice: ${practice.name}`,
    });
    toast.success(`Viewing ${practice.name}`);
  };

  const handleCreatePractice = async (name: string, adminName: string, adminPhone: string) => {
    const phone = normalisePhone(adminPhone);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: practice, error: pError } = await supabase
      .from('practices').insert({ name }).select().single();
    if (pError || !practice) { toast.error('Failed to create practice'); return; }

    const { data: adminUser, error: uError } = await supabase.from('users').insert({
      practice_id: practice.id,
      full_name: adminName.trim(),
      phone,
      role: 'practice_admin',
      invite_token: token,
      invite_expires_at: expiresAt,
      active: false,
    }).select().single();

    if (uError || !adminUser) {
      toast.error(uError?.message.includes('duplicate') ? 'Phone already registered' : 'Failed to create admin');
      await supabase.from('practices').delete().eq('id', practice.id);
      return;
    }

    await supabase.from('practices').update({ admin_user_id: adminUser.id }).eq('id', practice.id);

    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ type: 'invite', token, phone, appUrl: window.location.origin }),
    });

    await supabase.from('superadmin_audit').insert({
      action: 'create_practice',
      target_practice_id: practice.id,
      notes: `Created practice "${name}" with admin ${adminName}`,
    });

    toast.success('Practice created. Invite sent via WhatsApp to admin.');
    setShowCreate(false);
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  const stats = {
    practices: practices.length,
    users: users.length,
    bookingsThisMonth: bookings.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/superadmin/login')} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-base font-semibold text-gray-900">Superadmin Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Building2 className="w-4 h-4" />} label="Total practices" value={stats.practices} />
          <StatCard icon={<Users className="w-4 h-4" />} label="Total users" value={stats.users} />
          <StatCard icon={<Calendar className="w-4 h-4" />} label="Bookings this month" value={stats.bookingsThisMonth} />
        </div>

        {/* Practices table */}
        <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 12, borderWidth: 0.5 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">All practices</h2>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> New practice
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Admin</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Users</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Bookings</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Created</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {practices.map((p) => {
                const practiceUsers = users.filter((u) => u.practice_id === p.id);
                const admin = practiceUsers.find((u) => u.id === p.admin_user_id) || practiceUsers.find((u) => u.role === 'practice_admin');
                return (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-gray-900 font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-gray-600">{admin?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{practiceUsers.length}</td>
                    <td className="px-5 py-3 text-gray-600">{bookings.filter((b) => b.practice_id === p.id).length}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleOpenPractice(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        <ExternalLink className="w-3 h-3" /> Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {practices.length === 0 && <p className="text-sm text-gray-400 p-6 text-center">No practices yet.</p>}
        </div>

        {/* Audit log */}
        <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 12, borderWidth: 0.5 }}>
          <h2 className="text-sm font-semibold text-gray-900 px-5 py-4 border-b border-gray-100">Recent actions</h2>
          {audit.length === 0 ? (
            <p className="text-sm text-gray-400 p-5 text-center">No actions logged.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {audit.map((a) => (
                <div key={a.id} className="px-5 py-3 text-sm">
                  <p className="text-gray-900">{a.action || '—'}</p>
                  <p className="text-xs text-gray-400">{a.notes} · {formatDateTime(a.performed_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <CreatePracticeModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreatePractice}
        />
      )}
    </div>
  );
}

function CreatePracticeModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, adminName: string, adminPhone: string) => void }) {
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !adminName.trim() || !adminPhone.trim()) { toast.error('Fill in all fields'); return; }
    setSaving(true);
    await onCreate(name.trim(), adminName.trim(), adminPhone.trim());
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Create new practice</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Practice name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Novena Surgical Group" className="form-input" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Admin name</label>
            <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g. Sarah Chen" className="form-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Admin mobile number</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-200">+65</span>
              <input type="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="9232 2222" className="flex-1 px-3 py-2.5 text-sm outline-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">An invite will be sent via WhatsApp to this number.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create & send invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 12, borderWidth: 0.5 }}>
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="text-2xl font-semibold mt-1 text-gray-900">{value}</p>
    </div>
  );
}
