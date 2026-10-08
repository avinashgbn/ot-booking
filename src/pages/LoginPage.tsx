import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth';
import { normalisePhone } from '@/lib/utils';
import { Activity, ArrowRight } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithPin } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || pin.length !== 4) {
      toast.error('Enter your mobile number and 4-digit PIN');
      return;
    }
    setLoading(true);
    const normalised = normalisePhone(phone);
    const { error } = await signInWithPin(normalised, pin);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Welcome back');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-10 h-10 rounded-sm bg-brand flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-ink">OT Booking</span>
        </div>

        <div className="bg-surface rounded border border-line p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-6">Enter your mobile number and PIN</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1.5">Mobile number</label>
              <div className="flex items-center bg-surface-2 border border-line rounded-sm overflow-hidden">
                <span className="px-3 py-2.5 text-sm text-muted border-r border-line">+65</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9232 2222"
                  className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1.5">4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="form-input tracking-widest"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-2.5 rounded-sm text-sm font-medium hover:bg-brand-strong disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/superadmin/login" className="text-xs text-muted-2 hover:text-muted">
              Superadmin login
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-2 mt-4">
          Forgot your PIN? Contact your practice admin.
        </p>
      </div>
    </div>
  );
}
