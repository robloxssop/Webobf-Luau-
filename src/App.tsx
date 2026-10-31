import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { StudioEditor } from './components/StudioEditor.tsx';
import { OutputViewer } from './components/OutputViewer.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { RecoveryVaultPanel } from './components/RecoveryVaultPanel.tsx';
import { SecurityTestsPanel } from './components/SecurityTestsPanel.tsx';
import { AdminConsole } from './components/AdminConsole.tsx';
import { DocGuide } from './components/DocGuide.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { User, ObfuscationOptions, ObfuscationResult, JobRecord } from './types/index.ts';
import { Shield, Lock, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('studio');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aegis_token'));
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<ObfuscationResult | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // Guard: Automatically redirect non-admin users away from Recovery Vault
  useEffect(() => {
    if (activeTab === 'vault' && !isAdmin) {
      setActiveTab('studio');
    }
  }, [activeTab, isAdmin]);

  // Check current session on mount, or auto-initialize standard developer demo session
  useEffect(() => {
    const checkOrInitSession = async () => {
      try {
        const savedToken = localStorage.getItem('aegis_token');
        const headers: Record<string, string> = {};
        if (savedToken) {
          headers['Authorization'] = `Bearer ${savedToken}`;
        }
        const res = await fetch('/api/auth/me', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser(data.user);
            return;
          }
        }
        // Auto-login as standard developer for instant out-of-the-box readiness
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'developer@aegislua.io',
            password: 'robloxDev2026!',
          }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          setCurrentUser(loginData.user);
          if (loginData.token) {
            setToken(loginData.token);
            localStorage.setItem('aegis_token', loginData.token);
          }
        }
      } catch (err) {
        console.error('Session check failed:', err);
      }
    };
    checkOrInitSession();
  }, []);

  const handleObfuscate = async (sourceCode: string, options: ObfuscationOptions) => {
    // If not authenticated, auto-login first
    if (!currentUser) {
      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'developer@aegislua.io',
            password: 'robloxDev2026!',
          }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          setCurrentUser(loginData.user);
        }
      } catch (e) {
        setAuthModalOpen(true);
        return;
      }
    }

    setIsProcessing(true);
    setNotification(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/obfuscate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceCode, options }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data);
        if (data.success) {
          setNotification({
            type: 'success',
            message: `AST obfuscation completed successfully in ${data.transformationTimeMs}ms.`,
          });
          // Decrement daily quota locally for immediate UI update
          setCurrentUser(prev => prev ? { ...prev, jobsUsedToday: prev.jobsUsedToday + 1 } : null);
        } else {
          setNotification({
            type: 'error',
            message: 'Obfuscation failed: Review syntax diagnostics.',
          });
        }
      } else {
        setNotification({
          type: 'error',
          message: data.error || 'Server error during transformation processing',
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Network communication failure',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectJob = (job: JobRecord) => {
    const syntheticResult: ObfuscationResult = {
      jobId: job.id,
      success: job.status === 'completed',
      obfuscatedCode: job.obfuscatedCode,
      originalSizeBytes: job.originalSizeBytes,
      obfuscatedSizeBytes: job.obfuscatedSizeBytes,
      transformationTimeMs: 14,
      diagnostics: [
        {
          severity: 'info',
          rule: 'cached-job-replay',
          message: `Loaded previously processed job "${job.projectName}" from database.`,
        },
      ],
      profile: job.profile,
      preset: job.preset,
      mode: 'direct_luau',
      recoveryVaultId: job.hasRecoveryVault ? `vault_${job.id.slice(4)}` : undefined,
      astValid: true,
    };
    setResult(syntheticResult);
    setActiveTab('studio');
    window.scrollTo({ top: 500, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch('/api/auth/logout', { method: 'POST', headers });
    } catch (err) {
      console.error(err);
    }
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem('aegis_token');
    if (activeTab === 'admin') {
      setActiveTab('studio');
    }
    setNotification({
      type: 'success',
      message: 'Session revoked and logged out securely.',
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Global Notification Banner */}
      {notification && (
        <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
          notification.type === 'success'
            ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-200'
            : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
        }`}>
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              )}
              {notification.message}
            </span>
            <button
              onClick={() => setNotification(null)}
              className="text-xs hover:opacity-80 px-1 font-mono"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'studio' && (
          <div className="space-y-8">
            {/* Hero / Studio Header */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Roblox Luau Obfuscation Studio
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Scope-aware AST protection for Roblox Studio experiences and environment-specific scripts. Zero regex reliance, authenticated recovery vault, and strict compatibility validation.
              </p>
            </div>

            {/* Input Editor */}
            <StudioEditor
              onObfuscate={handleObfuscate}
              isProcessing={isProcessing}
              result={result}
            />

            {/* Output Result Viewer (if processed) */}
            {result && (
              <div className="pt-2">
                <OutputViewer result={result} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryPanel onSelectJob={handleSelectJob} />
        )}

        {activeTab === 'vault' && isAdmin && (
          <RecoveryVaultPanel />
        )}

        {activeTab === 'tests' && (
          <SecurityTestsPanel />
        )}

        {activeTab === 'docs' && (
          <DocGuide />
        )}

        {activeTab === 'admin' && (
          <AdminConsole />
        )}
      </main>

      {/* Footer conforming to Universal Design Anti-Slop Discipline */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-400">AegisLua Platform</span>
            <span>·</span>
            <span>Luau AST Transformation Engine</span>
            <span>·</span>
            <span>AES-256-GCM Vault</span>
          </div>

          <div className="text-[11px] text-slate-400">
            For intellectual property protection. Server authority required for game anti-cheat.
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(user, returnedToken) => {
          setCurrentUser(user);
          if (returnedToken) {
            setToken(returnedToken);
            localStorage.setItem('aegis_token', returnedToken);
          }
          setNotification({
            type: 'success',
            message: `Authenticated as ${user.username} (${user.role}).`,
          });
        }}
      />
    </div>
  );
}
