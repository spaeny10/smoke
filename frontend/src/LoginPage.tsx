import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { authApi } from './api';

interface LoginPageProps {
  onAuthSuccess: (token: string) => void;
}

export default function LoginPage({ onAuthSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await authApi.google(response.credential);
      onAuthSuccess(res.data.access_token);
    } catch {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        const res = await authApi.register({ email, password, name });
        onAuthSuccess(res.data.access_token);
      } else {
        const res = await authApi.login({ email, password });
        onAuthSuccess(res.data.access_token);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141416] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
            S
          </div>
          <span className="text-2xl font-semibold text-white tracking-wide">Smoke</span>
        </div>

        {/* Card */}
        <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white text-center mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-sm text-[#8b8b93] text-center mb-6">
            Sign in to access your construction intelligence dashboard
          </p>

          {/* Google Sign-In */}
          <div className="flex justify-center mb-6">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-in failed.')}
              theme="filled_black"
              size="large"
              text={mode === 'login' ? 'signin_with' : 'signup_with'}
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-[#8b8b93]">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-[#141416] border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#141416] border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#141416] border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* Toggle login/register */}
          <p className="text-sm text-[#8b8b93] text-center mt-6">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
