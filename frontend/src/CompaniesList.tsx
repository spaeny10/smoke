import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCw, Loader2, Upload, X, CheckCircle2, AlertCircle, Star, ChevronDown, Plus, ArrowUpCircle } from 'lucide-react';
import { accountsApi, bulkApi, usersApi, savedViewsApi, enrichApi, type Account, type ImportResult, type UserProfile, type SavedView } from './api';

function getScoreDisplay(score: number) {
  if (score >= 75) return { text: 'On Fire', color: 'text-red-500', bg: 'bg-red-500/10', icon: '\u2604\uFE0F' };
  if (score >= 50) return { text: 'Hot', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: '\uD83D\uDD25' };
  if (score >= 25) return { text: 'Warm', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: '\u2600\uFE0F' };
  return { text: 'Cold', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: '\u2744\uFE0F' };
}

function getTierDisplay(tier: number) {
  if (tier === 0) return { label: 'NEW', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
  if (tier === 1) return { label: 'T1', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
  if (tier === 2) return { label: 'T2', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
  return { label: 'T3', color: 'text-[#8b8b93]', bg: 'bg-[#202022]', border: 'border-white/5' };
}

const ICON_COLORS = ['bg-blue-800', 'bg-blue-600', 'bg-yellow-600', 'bg-green-600', 'bg-red-800', 'bg-gray-700', 'bg-zinc-800', 'bg-green-500', 'bg-stone-600', 'bg-indigo-600'];

const generateBars = () => {
  return Array.from({ length: 30 }).map(() => Math.floor(Math.random() * 80) + 10);
};

interface CompaniesListProps {
  onCompanyClick: (id: string) => void;
  userProfile?: UserProfile | null;
}

export default function CompaniesList({ onCompanyClick, userProfile }: CompaniesListProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [viewScope, setViewScope] = useState<string>('mine');
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', hq_city: '', hq_state: '', segment: '', tier: 1 });
  const [addSaving, setAddSaving] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [promoteMenuId, setPromoteMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTierMenu, setBulkTierMenu] = useState(false);
  const [bulkAssignMenu, setBulkAssignMenu] = useState(false);
  const [reps, setReps] = useState<UserProfile[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [showSaveViewInput, setShowSaveViewInput] = useState(false);
  const [viewName, setViewName] = useState('');
  const [dupWarning, setDupWarning] = useState<{ id: string; name: string; score: number } | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  const handleBulkTier = (tier: number) => {
    bulkApi.updateAccounts(Array.from(selectedIds), { tier }).then(() => {
      setSelectedIds(new Set());
      setBulkTierMenu(false);
      fetchAccounts(search);
    });
  };

  const handleBulkAssign = (repId: string) => {
    bulkApi.updateAccounts(Array.from(selectedIds), { assigned_rep_id: repId }).then(() => {
      setSelectedIds(new Set());
      setBulkAssignMenu(false);
      fetchAccounts(search);
    });
  };

  const [bulkEnriching, setBulkEnriching] = useState(false);

  const handleBulkEnrich = () => {
    setBulkEnriching(true);
    enrichApi.bulkEnrich(Array.from(selectedIds)).then(() => {
      setSelectedIds(new Set());
      fetchAccounts(search);
    }).catch(() => {}).finally(() => setBulkEnriching(false));
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} account(s)? This cannot be undone.`)) return;
    bulkApi.deleteAccounts(Array.from(selectedIds)).then(() => {
      setSelectedIds(new Set());
      fetchAccounts(search);
    });
  };

  const fetchAccounts = (searchTerm?: string) => {
    setLoading(true);
    accountsApi.list({
      search: searchTerm || undefined,
      tier: tierFilter ?? undefined,
      view: userProfile ? viewScope : undefined,
      limit: 100,
    })
      .then(res => {
        setAccounts(res.data.items);
        setTotal(res.data.total);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  };

  const fetchDiscoveredCount = () => {
    accountsApi.discoveredCount()
      .then(res => setDiscoveredCount(res.data.count))
      .catch(() => {});
  };

  useEffect(() => {
    fetchDiscoveredCount();
    savedViewsApi.list('accounts').then(res => setSavedViews(res.data)).catch(() => {});
  }, []);
  useEffect(() => { fetchAccounts(); }, [tierFilter, viewScope]);

  useEffect(() => {
    const timer = setTimeout(() => fetchAccounts(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Debounced duplicate check when typing in Add Company modal
  const checkDuplicate = useCallback((name: string) => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    if (!name.trim() || name.trim().length < 3) {
      setDupWarning(null);
      setCheckingDup(false);
      return;
    }
    setCheckingDup(true);
    dupTimerRef.current = setTimeout(() => {
      accountsApi.checkDuplicate(name.trim())
        .then(res => {
          if (res.data.has_duplicate && res.data.matches.length > 0) {
            const m = res.data.matches[0];
            setDupWarning({ id: m.id, name: m.name, score: m.score });
          } else {
            setDupWarning(null);
          }
        })
        .catch(() => setDupWarning(null))
        .finally(() => setCheckingDup(false));
    }, 400);
  }, []);

  const handleFileUpload = (file: File) => {
    setImporting(true);
    setImportError('');
    setImportResult(null);
    accountsApi.importCsv(file)
      .then(res => {
        setImportResult(res.data);
        fetchAccounts(search);
      })
      .catch(err => {
        setImportError(err.response?.data?.detail || 'Upload failed. Please check your CSV format.');
      })
      .finally(() => setImporting(false));
  };

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    accountsApi.create({
      name: addForm.name.trim(),
      hq_city: addForm.hq_city || undefined,
      hq_state: addForm.hq_state || undefined,
      segment: addForm.segment || undefined,
      tier: addForm.tier,
    } as Parameters<typeof accountsApi.create>[0], !!dupWarning)
      .then(() => {
        setShowAddCompany(false);
        setAddForm({ name: '', hq_city: '', hq_state: '', segment: '', tier: 1 });
        setDupWarning(null);
        fetchAccounts(search);
      })
      .catch((err) => {
        // Handle 409 race condition
        if (err.response?.status === 409 && err.response?.data?.detail?.matches) {
          const m = err.response.data.detail.matches[0];
          setDupWarning({ id: m.id, name: m.name, score: m.score });
        }
      })
      .finally(() => setAddSaving(false));
  };

  const handlePromote = (accountId: string, newTier: number) => {
    accountsApi.update(accountId, { tier: newTier })
      .then(() => {
        setPromoteMenuId(null);
        fetchAccounts(search);
        fetchDiscoveredCount();
      })
      .catch(() => {});
  };

  const handleSaveView = () => {
    if (!viewName.trim()) return;
    const filters: Record<string, unknown> = {};
    if (search) filters.search = search;
    if (tierFilter !== null) filters.tier = tierFilter;
    if (viewScope) filters.viewScope = viewScope;
    savedViewsApi.create({ name: viewName.trim(), entity: 'accounts', filters }).then(res => {
      setSavedViews(prev => [res.data, ...prev]);
      setViewName('');
      setShowSaveViewInput(false);
    }).catch(() => {});
  };

  const applyView = (view: SavedView) => {
    const f = view.filters as Record<string, unknown>;
    setSearch((f.search as string) || '');
    setTierFilter(f.tier !== undefined ? (f.tier as number) : null);
    if (f.viewScope) setViewScope(f.viewScope as string);
    setShowViewsDropdown(false);
  };

  const deleteView = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    savedViewsApi.delete(id).then(() => setSavedViews(prev => prev.filter(v => v.id !== id))).catch(() => {});
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#141416] text-[#e2e2e5]">

      {/* Header Area */}
      <div className="p-6 pb-2 border-b border-white/5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-8 h-8 rounded-md bg-[#202022] flex items-center justify-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b8b93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white inline-block">Companies</h1>
            <span className="text-sm text-[#8b8b93] ml-3">{total} results</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center relative">
            <button
              onClick={() => setShowScopeMenu(!showScopeMenu)}
              className="flex items-center justify-between text-sm py-2 px-3 hover:bg-[#202022] rounded-md transition-colors min-w-[160px]"
            >
              <span className="font-medium text-[#e2e2e5]">
                {viewScope === 'mine' ? 'My Accounts' : viewScope === 'team' ? 'Team Accounts' : 'All Accounts'}
              </span>
              <ChevronDown size={14} className="text-[#8b8b93]" />
            </button>
            {showScopeMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                <button onClick={() => { setViewScope('mine'); setShowScopeMenu(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-[#202022] transition-colors ${viewScope === 'mine' ? 'text-indigo-400' : 'text-[#e2e2e5]'}`}>
                  My Accounts
                </button>
                {userProfile && ['manager', 'director'].includes(userProfile.role) && (
                  <button onClick={() => { setViewScope('team'); setShowScopeMenu(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-[#202022] transition-colors ${viewScope === 'team' ? 'text-indigo-400' : 'text-[#e2e2e5]'}`}>
                    Team Accounts
                  </button>
                )}
                {userProfile?.role === 'director' && (
                  <button onClick={() => { setViewScope('all'); setShowScopeMenu(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-[#202022] transition-colors ${viewScope === 'all' ? 'text-indigo-400' : 'text-[#e2e2e5]'}`}>
                    All Accounts
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b93]" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#1a1a1c] border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-500 w-64 text-white hover:border-white/20 transition-colors placeholder-[#8b8b93]"
              />
            </div>

            <button onClick={() => fetchAccounts(search)} className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors">
              <RefreshCw size={14} className="text-[#8b8b93]" />
              Refresh
            </button>

            <button
              onClick={() => setShowAddCompany(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm text-white transition-colors"
            >
              <Plus size={14} />
              Add Company
            </button>

            <button
              onClick={() => { setShowImport(true); setImportResult(null); setImportError(''); }}
              className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors"
            >
              <Upload size={14} />
              Import CSV
            </button>

            {/* Saved Views */}
            <div className="relative">
              <button
                onClick={() => setShowViewsDropdown(!showViewsDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors"
              >
                <Star size={14} className="text-[#8b8b93]" />
                Views
                {savedViews.length > 0 && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">{savedViews.length}</span>
                )}
                <ChevronDown size={12} className="text-[#8b8b93]" />
              </button>
              {showViewsDropdown && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                  {savedViews.map(v => (
                    <div key={v.id} onClick={() => applyView(v)} className="flex items-center justify-between px-3 py-2 text-sm text-[#e2e2e5] hover:bg-[#202022] cursor-pointer transition-colors group">
                      <span className="truncate">{v.name}</span>
                      <button onClick={(e) => deleteView(v.id, e)} className="opacity-0 group-hover:opacity-100 text-[#8b8b93] hover:text-red-400 transition-all">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {savedViews.length === 0 && <div className="px-3 py-2 text-xs text-[#8b8b93]">No saved views yet</div>}
                  <div className="border-t border-white/5 mt-1 pt-1">
                    {showSaveViewInput ? (
                      <div className="px-3 py-2 flex gap-2">
                        <input
                          type="text"
                          placeholder="View name..."
                          value={viewName}
                          onChange={e => setViewName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                          className="flex-1 bg-[#0a0a0b] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8b8b93]"
                          autoFocus
                        />
                        <button onClick={handleSaveView} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Save</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowSaveViewInput(true)} className="w-full text-left px-3 py-2 text-xs text-indigo-400 hover:bg-[#202022] transition-colors flex items-center gap-1.5">
                        <Plus size={12} /> Save current view
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tier filter chips */}
        <div className="flex items-center gap-2 mb-2">
          {/* Discovered chip with count badge */}
          <button
            onClick={() => setTierFilter(0)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 ${
              tierFilter === 0
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : 'bg-transparent text-[#8b8b93] border-white/5 hover:bg-[#202022]'
            }`}
          >
            <ArrowUpCircle size={10} />
            Discovered
            {discoveredCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300">
                {discoveredCount}
              </span>
            )}
          </button>

          <div className="w-px h-5 bg-white/10" />

          {[
            { value: null, label: 'All Tiers' },
            { value: 1, label: 'Tier 1 — Target' },
            { value: 2, label: 'Tier 2 — Pipeline' },
            { value: 3, label: 'Tier 3 — General' },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setTierFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                tierFilter === opt.value
                  ? opt.value === 1 ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                    : opt.value === 2 ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : opt.value === 3 ? 'bg-[#202022] text-[#e2e2e5] border-white/10'
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                  : 'bg-transparent text-[#8b8b93] border-white/5 hover:bg-[#202022]'
              }`}
            >
              {opt.value === 1 && <Star size={10} className="inline mr-1" />}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 text-xs font-medium text-[#8b8b93] uppercase tracking-wider">
        <div className="col-span-3 flex items-center gap-2 cursor-pointer hover:text-[#e2e2e5]">
          <input
            type="checkbox"
            checked={accounts.length > 0 && selectedIds.size === accounts.length}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-indigo-500 cursor-pointer"
          />
          Company
        </div>
        <div className="col-span-1 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Tier</div>
        <div className="col-span-3 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Stage</div>
        <div className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5] pl-6">Score</div>
        <div className="col-span-3 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-[#e2e2e5]">30 Days Activity</div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#8b8b93]">
            <Loader2 size={24} className="animate-spin mr-3" />
            <span>Loading companies...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8b8b93]">
            <p className="text-lg mb-2">No companies found</p>
            <p className="text-sm">Import accounts via CSV or create one to get started.</p>
          </div>
        ) : (
          accounts.map((account, idx) => {
            const scoreDisplay = getScoreDisplay(account.composite_score);
            const tierDisplay = getTierDisplay(account.tier);
            const initial = account.name.charAt(0).toUpperCase();
            const iconBg = ICON_COLORS[idx % ICON_COLORS.length];
            const dateStr = new Date(account.updated_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

            return (
              <div
                key={account.id}
                onClick={() => onCompanyClick(account.id)}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-[#1a1a1c] cursor-pointer transition-colors group items-center"
              >
                <div className="col-span-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(account.id)}
                    onChange={() => {}}
                    onClick={(e) => toggleSelect(account.id, e)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-indigo-500 cursor-pointer shrink-0"
                  />
                  <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0`}>
                    {initial}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-[#e2e2e5] font-medium text-sm truncate group-hover:text-indigo-400 transition-colors">{account.name}</h3>
                    <p className="text-xs text-[#8b8b93] truncate">{account.hq_city ? `${account.hq_city}${account.hq_state ? `, ${account.hq_state}` : ''}` : account.name_normalized}</p>
                  </div>
                </div>

                <div className="col-span-1 flex items-center relative">
                  {account.tier === 0 ? (
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPromoteMenuId(promoteMenuId === account.id ? null : account.id); }}
                        className="px-2 py-0.5 rounded text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors flex items-center gap-1"
                      >
                        <ArrowUpCircle size={10} />
                        Promote
                      </button>
                      {promoteMenuId === account.id && (
                        <div className="absolute top-full left-0 mt-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 py-1 w-36">
                          {[
                            { tier: 1, label: 'Tier 1 — Target', color: 'text-orange-400' },
                            { tier: 2, label: 'Tier 2 — Pipeline', color: 'text-blue-400' },
                            { tier: 3, label: 'Tier 3 — General', color: 'text-[#e2e2e5]' },
                          ].map(opt => (
                            <button
                              key={opt.tier}
                              onClick={(e) => { e.stopPropagation(); handlePromote(account.id, opt.tier); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-[#202022] transition-colors ${opt.color}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${tierDisplay.bg} ${tierDisplay.color} border ${tierDisplay.border}`}>
                      {account.tier === 1 && <Star size={9} className="inline mr-0.5 -mt-0.5" />}
                      {tierDisplay.label}
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex flex-col justify-center">
                  <span className="text-[#e2e2e5] font-medium text-sm">{account.deal_stage}</span>
                  <span className="text-xs text-[#8b8b93]">{dateStr}</span>
                </div>

                <div className="col-span-2 flex items-center pl-6">
                  <div className={`px-2.5 py-1 ${scoreDisplay.bg} ${scoreDisplay.color} rounded-full text-xs border border-white/5 flex items-center gap-1.5 inline-flex font-medium min-w-[70px]`}>
                     <span className="opacity-80">{scoreDisplay.icon}</span> {scoreDisplay.text}
                  </div>
                </div>

                <div className="col-span-3 flex justify-end h-8 items-end gap-[2px]">
                  {generateBars().map((height, i) => (
                    <div key={i} className="w-1.5 bg-[#10b981] rounded-t-sm opacity-80" style={{ height: `${height}%` }}></div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-[#1a1a1c] border-t border-white/10 px-6 py-3 flex items-center gap-4 z-30 shadow-xl">
          <span className="text-sm text-white font-medium">{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#8b8b93] hover:text-white transition-colors">
            <X size={14} className="inline mr-1" />Clear
          </button>
          <div className="w-px h-5 bg-white/10" />

          {/* Set Tier */}
          <div className="relative">
            <button
              onClick={() => { setBulkTierMenu(!bulkTierMenu); setBulkAssignMenu(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#202022] border border-white/10 rounded-lg text-xs text-[#e2e2e5] hover:bg-[#2a2a2d] transition-colors"
            >
              Set Tier <ChevronDown size={12} />
            </button>
            {bulkTierMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-40 py-1 w-40">
                {[{ tier: 1, label: 'Tier 1' }, { tier: 2, label: 'Tier 2' }, { tier: 3, label: 'Tier 3' }].map(o => (
                  <button key={o.tier} onClick={() => handleBulkTier(o.tier)} className="w-full text-left px-3 py-2 text-xs text-[#e2e2e5] hover:bg-[#202022] transition-colors">{o.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Assign Rep */}
          <div className="relative">
            <button
              onClick={() => {
                setBulkAssignMenu(!bulkAssignMenu);
                setBulkTierMenu(false);
                if (reps.length === 0) usersApi.list().then(res => setReps(res.data)).catch(() => {});
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#202022] border border-white/10 rounded-lg text-xs text-[#e2e2e5] hover:bg-[#2a2a2d] transition-colors"
            >
              Assign Rep <ChevronDown size={12} />
            </button>
            {bulkAssignMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-40 py-1 w-48 max-h-40 overflow-y-auto">
                {reps.map(r => (
                  <button key={r.id} onClick={() => handleBulkAssign(r.id)} className="w-full text-left px-3 py-2 text-xs text-[#e2e2e5] hover:bg-[#202022] transition-colors truncate">{r.name}</button>
                ))}
                {reps.length === 0 && <div className="px-3 py-2 text-xs text-[#8b8b93]">Loading...</div>}
              </div>
            )}
          </div>

          {/* Enrich */}
          <button
            onClick={handleBulkEnrich}
            disabled={bulkEnriching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
          >
            {bulkEnriching ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
            {bulkEnriching ? 'Enriching...' : 'Enrich'}
          </button>

          {/* Delete */}
          {userProfile?.role === 'director' && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition-colors ml-auto"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => { if (!addSaving) { setShowAddCompany(false); setDupWarning(null); } }}>
          <div className="bg-[#1a1a1c] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">Add Company</h2>
              <button onClick={() => { if (!addSaving) { setShowAddCompany(false); setDupWarning(null); } }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddCompany} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Company Name *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={e => { setAddForm(f => ({ ...f, name: e.target.value })); checkDuplicate(e.target.value); }}
                  placeholder="e.g. Turner Construction"
                  className="w-full bg-[#0a0a0b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-[#8b8b93]"
                  required
                  autoFocus
                />
                {checkingDup && <p className="text-xs text-[#8b8b93] mt-1">Checking for duplicates...</p>}
                {dupWarning && (
                  <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-400 font-medium">
                      Similar company found: "{dupWarning.name}" ({Math.round(dupWarning.score)}% match)
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        type="button"
                        onClick={() => onCompanyClick(dupWarning.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                      >
                        View existing
                      </button>
                      <span className="text-xs text-[#8b8b93]">or click "Add Anyway" below</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">City</label>
                  <input
                    type="text"
                    value={addForm.hq_city}
                    onChange={e => setAddForm(f => ({ ...f, hq_city: e.target.value }))}
                    placeholder="New York"
                    className="w-full bg-[#0a0a0b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-[#8b8b93]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">State</label>
                  <input
                    type="text"
                    value={addForm.hq_state}
                    onChange={e => setAddForm(f => ({ ...f, hq_state: e.target.value }))}
                    placeholder="NY"
                    maxLength={2}
                    className="w-full bg-[#0a0a0b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-[#8b8b93]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Segment</label>
                <select
                  value={addForm.segment}
                  onChange={e => setAddForm(f => ({ ...f, segment: e.target.value }))}
                  className="w-full bg-[#0a0a0b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select segment...</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Multifamily">Multifamily</option>
                  <option value="Mixed">Mixed</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Tier</label>
                <div className="flex gap-2">
                  {[
                    { value: 1, label: 'Tier 1 — Target', active: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
                    { value: 2, label: 'Tier 2 — Pipeline', active: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                    { value: 3, label: 'Tier 3 — General', active: 'bg-[#202022] text-[#e2e2e5] border-white/10' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAddForm(f => ({ ...f, tier: opt.value }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                        addForm.tier === opt.value ? opt.active : 'bg-transparent text-[#8b8b93] border-white/5 hover:bg-[#202022]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={!addForm.name.trim() || addSaving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {addSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {addSaving ? 'Creating...' : dupWarning ? 'Add Anyway' : 'Add Company'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => !importing && setShowImport(false)}>
          <div className="bg-[#1a1a1c] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">Import Companies & Contacts</h2>
              <button onClick={() => !importing && setShowImport(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Result display */}
              {importResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-green-400">
                    <CheckCircle2 size={24} />
                    <span className="text-lg font-medium">Import Complete</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#202022] rounded-lg p-3 border border-white/5">
                      <p className="text-2xl font-bold text-white">{importResult.results.new_accounts_created}</p>
                      <p className="text-xs text-[#8b8b93]">New companies created</p>
                    </div>
                    <div className="bg-[#202022] rounded-lg p-3 border border-white/5">
                      <p className="text-2xl font-bold text-white">{importResult.results.contacts_added}</p>
                      <p className="text-xs text-[#8b8b93]">Contacts added</p>
                    </div>
                    <div className="bg-[#202022] rounded-lg p-3 border border-white/5">
                      <p className="text-2xl font-bold text-white">{importResult.results.auto_matched}</p>
                      <p className="text-xs text-[#8b8b93]">Auto-matched to existing</p>
                    </div>
                    <div className="bg-[#202022] rounded-lg p-3 border border-white/5">
                      <p className="text-2xl font-bold text-white">{importResult.results.flagged_for_review}</p>
                      <p className="text-xs text-[#8b8b93]">Flagged for review</p>
                    </div>
                  </div>
                  {importResult.results.errors.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <p className="text-sm text-red-400 font-medium mb-1">{importResult.results.errors.length} row error(s)</p>
                      <div className="text-xs text-red-400/70 max-h-20 overflow-y-auto space-y-1">
                        {importResult.results.errors.map((err, i) => <p key={i}>{err}</p>)}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setShowImport(false)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : importError ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-red-400">
                    <AlertCircle size={24} />
                    <span className="text-lg font-medium">Import Failed</span>
                  </div>
                  <p className="text-sm text-[#8b8b93]">{importError}</p>
                  <button
                    onClick={() => { setImportError(''); }}
                    className="w-full py-2.5 bg-[#202022] hover:bg-[#2a2a2d] text-white rounded-lg text-sm font-medium transition-colors border border-white/5"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {/* Format instructions */}
                  <div className="bg-[#202022] rounded-lg p-4 border border-white/5">
                    <p className="text-sm text-white font-medium mb-2">CSV Format</p>
                    <p className="text-xs text-[#8b8b93] mb-2">Required column: <code className="bg-[#141416] px-1.5 py-0.5 rounded text-indigo-400">company_name</code></p>
                    <p className="text-xs text-[#8b8b93] mb-1">Address: <code className="bg-[#141416] px-1.5 py-0.5 rounded text-[#e2e2e5]">address, city, state, zip</code></p>
                    <p className="text-xs text-[#8b8b93]">Contacts: <code className="bg-[#141416] px-1.5 py-0.5 rounded text-[#e2e2e5]">contact_name, title, contact_email, contact_phone</code></p>
                  </div>

                  {/* Upload area */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${importing ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 hover:border-indigo-500/30 cursor-pointer'}`}
                    onClick={() => !importing && fileInputRef.current?.click()}
                  >
                    {importing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 size={32} className="animate-spin text-indigo-400" />
                        <p className="text-sm text-[#8b8b93]">Processing your CSV...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Upload size={32} className="text-[#8b8b93]" />
                        <p className="text-sm text-white font-medium">Click to select a CSV file</p>
                        <p className="text-xs text-[#8b8b93]">Companies will be fuzzy-matched to avoid duplicates</p>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
