import React, { useState } from 'react';
import { X, KeyRound, Shield, Lock, User, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { User as UserType } from '../types/index.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserType, token?: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, mfaCode: requiresMfa ? mfaCode : undefined }),
        });
        const data = await res.json();

        if (res.ok) {
          if (data.requiresMfa) {
            setRequiresMfa(true);
            setError(null);
          } else {
            onLoginSuccess(data.user, data.token);
            onClose();
          }
        } else {
          setError(data.error || 'Authentication failed');
        }
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();

        if (res.ok) {
          onLoginSuccess(data.user, data.token);
          onClose();
        } else {
          setError(data.error || 'Registration failed');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (userType: 'dev' | 'admin') => {
    if (userType === 'dev') {
      setUsername('developer@aegislua.io');
      setPassword('robloxDev2026!');
      setRequiresMfa(false);
      setMfaCode('');
    } else {
      setUsername('admin@aegislua.internal');
      setPassword('AegisSecAdmin#9981');
      setRequiresMfa(true);
      setMfaCode('AEGIS2026MFA');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl shadow-cyan-950/20">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white text-sm">
              {requiresMfa ? 'Privileged MFA Verification' : tab === 'login' ? 'Authentication Gate' : 'Create Developer Account'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Demo Fill Buttons */}
        <div className="px-5 pt-4 pb-2 bg-slate-950/50 border-b border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 mb-2">
            One-Click Test Identity:
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('dev')}
              className="py-1.5 px-2.5 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-slate-200 text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-cyan-300">Roblox Developer</div>
              <div className="text-[10px] text-slate-400 font-mono">Standard quota & vault</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="py-1.5 px-2.5 rounded bg-slate-900 border border-slate-700 hover:border-violet-500/50 text-slate-200 text-left transition-colors cursor-pointer"
            >
              <div className="font-semibold text-violet-300">Security Admin</div>
              <div className="text-[10px] text-slate-400 font-mono">RBAC + MFA Step-Up</div>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        {!requiresMfa && (
          <div className="flex border-b border-slate-800 text-xs">
            <button
              onClick={() => { setTab('login'); setError(null); }}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                tab === 'login' ? 'border-cyan-400 text-white bg-slate-950/40' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('register'); setError(null); }}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                tab === 'register' ? 'border-cyan-400 text-white bg-slate-950/40' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Register Account
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {requiresMfa ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-800/40 text-violet-200 text-xs">
                Enter your administrative multi-factor verification key (<code className="font-mono text-cyan-300">AEGIS2026MFA</code> or <code className="font-mono text-cyan-300">998126</code>) to confirm privileged session elevation.
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">MFA Security Code</label>
                <input
                  type="text"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  placeholder="e.g. AEGIS2026MFA or 123456"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Username or Email</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  placeholder="developer@aegislua.io"
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                    placeholder="user@example.com"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  placeholder="••••••••••••"
                />
              </div>
            </>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : requiresMfa ? (
                'Verify MFA & Authorize'
              ) : tab === 'login' ? (
                'Authenticate Session'
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
