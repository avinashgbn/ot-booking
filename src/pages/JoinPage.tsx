import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { normalisePhone } from '@/lib/utils';
import { Activity, Lock, Check } from 'lucide-react';
import type { User, Practice } from '@/types';

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [expired, setExpired] = useState(false);
  const [fullName, setFullName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setExpired(true);
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('invite_token', token)
        .maybeSingle();

      if (userError || !userData) {
        setExpired(true);
        setLoading(false);
        return;
      }

      const u = userData as User;

      if (u.invite_expires_at && new Date(u.invite_expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (u.active) {
        toast('Your account is already active. Please sign in.');
        navigate('/login');
        return;
      }

      setUser(u);
      setFullName(u.full_name);

      if (u.practice_id) {
        const { data: pData } = await supabase
          .from('practices')
          .select('*')
          .eq('id', u.practice_id)
          .maybeSingle();
        if (pData) setPractice(pData as Practice);
      }

      setLoading(false);
    })();
  }, [token, navigate]);

  const handleActivate = async () => {
    if (!user || !token) return;
    if (pin.length !== 4) {
      toast.error('PIN must be 4 digits');
      return;
    }
    if (!fullName.trim()) {
      toast.error('Please enter your full name');
      return;
    }

    setSubmitting(true);

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activate-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        token,
        full_name: fullName.trim(),
        pin,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      toast.error(err.error || 'Activation failed. Please try again.');
      setSubmitting(false);
      return;
    }

    toast.success('Account activated. Please sign in.');
    setSubmitting(false);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">This link has expired</h1>
          <p className="text-sm text-gray-500">Contact your practice admin to resend your invite.</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const rolePillClass = user.role === 'surgeon'
    ? 'bg-[#EEEDFE] text-[#3C3489]'
    : 'bg-[#E1F5EE] text-[#085041]';
  const roleLabel = user.role === 'surgeon' ? 'Surgeon' : 'Secretary';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[#3C3489] flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-gray-900">OT Booking</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6" style={{ borderRadius: 12 }}>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Activate your account</h1>
          <p className="text-sm text-gray-500 mb-6">Confirm your details and set your PIN</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Practice</label>
              <input
                type="text"
                value={practice?.name || ''}
                disabled
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Mobile number</label>
              <input
                type="text"
                value={user.phone}
                disabled
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${rolePillClass}`}>
                  {roleLabel}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your full name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!editingName}
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-600"
                />
                {!editingName ? (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="px-3 py-2.5 text-sm font-medium text-[#3C3489] border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Update
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="px-3 py-2.5 text-sm font-medium text-[#3C3489] border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Tap Update if your admin spelled your name differently.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Set your 4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 tracking-widest"
              />
            </div>

            <button
              onClick={handleActivate}
              disabled={submitting}
              className="w-full bg-[#3C3489] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#2D2670] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Activating...' : 'Confirm and activate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
