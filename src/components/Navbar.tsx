import React from 'react';
import { Shield, Lock, Terminal, History, Archive, CheckCircle2, BookOpen, LogOut, KeyRound } from 'lucide-react';
import { User as UserType } from '../types/index.ts';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserType | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Single text element wordmark with icon */}
        <div 
          onClick={() => setActiveTab('studio')}
          className="flex items-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0 group"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400/50 transition-colors">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              AegisLua
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                Luau
              </span>
            </span>
          </div>
        </div>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'studio'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Studio
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'vault'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            <Archive className="w-4 h-4" />
            Recovery Vault
          </button>

          <button
            onClick={() => setActiveTab('tests')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tests'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Security Tests
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'docs'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Documentation
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 border ${
                activeTab === 'admin'
                  ? 'bg-violet-950/70 border-violet-500/50 text-violet-300 font-semibold'
                  : 'border-violet-900/40 text-violet-400 hover:bg-violet-950/40'
              }`}
            >
              <Lock className="w-4 h-4" />
              Admin Console
            </button>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-200">
                  {currentUser.username}
                </span>
                <span className="text-[11px] font-mono text-slate-400 capitalize">
                  {currentUser.role} · Quota: {currentUser.jobsUsedToday}/{currentUser.dailyJobQuota}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Log out of session"
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors border border-slate-800"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 shadow-sm shadow-cyan-500/10"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Sign In / Access
            </button>
          )}
        </div>
      </div>

      {/* Mobile navigation tab strip */}
      <div className="flex md:hidden overflow-x-auto border-t border-slate-800/80 px-2 py-1.5 gap-1 text-xs">
        <button
          onClick={() => setActiveTab('studio')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'studio' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
        >
          Studio
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'history' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('vault')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'vault' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
        >
          Vault
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'tests' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
        >
          Security Tests
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'docs' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
        >
          Docs
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'admin' ? 'bg-violet-950 text-violet-300 font-semibold' : 'text-violet-400'}`}
          >
            Admin
          </button>
        )}
      </div>
    </header>
  );
};
