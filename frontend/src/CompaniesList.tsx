import { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw, Filter, Loader2, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { accountsApi, type Account, type ImportResult } from './api';

function getScoreDisplay(score: number) {
  if (score >= 75) return { text: 'On Fire', color: 'text-red-500', bg: 'bg-red-500/10', icon: '\u2604\uFE0F' };
  if (score >= 50) return { text: 'Hot', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: '\uD83D\uDD25' };
  if (score >= 25) return { text: 'Warm', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: '\u2600\uFE0F' };
  return { text: 'Cold', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: '\u2744\uFE0F' };
}

const ICON_COLORS = ['bg-blue-800', 'bg-blue-600', 'bg-yellow-600', 'bg-green-600', 'bg-red-800', 'bg-gray-700', 'bg-zinc-800', 'bg-green-500', 'bg-stone-600', 'bg-indigo-600'];

const generateBars = () => {
  return Array.from({ length: 30 }).map(() => Math.floor(Math.random() * 80) + 10);
};

export default function CompaniesList({ onCompanyClick }: { onCompanyClick: (id: string) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = (searchTerm?: string) => {
    setLoading(true);
    accountsApi.list({ search: searchTerm || undefined, limit: 100 })
      .then(res => {
        setAccounts(res.data.items);
        setTotal(res.data.total);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAccounts(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchAccounts(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
          <div className="flex items-center">
            <button className="flex items-center justify-between text-sm py-2 px-3 hover:bg-[#202022] rounded-md transition-colors min-w-[140px]">
              <span className="font-medium text-[#e2e2e5]">All Companies</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8b93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
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
              onClick={() => { setShowImport(true); setImportResult(null); setImportError(''); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm text-white transition-colors"
            >
              <Upload size={14} />
              Import CSV
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2">
           <button className="flex items-center gap-2 px-3 py-1.5 bg-[#202022] border border-white/5 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#2a2a2d] transition-colors">
              <Filter size={14} className="text-[#8b8b93]" />
              Filters
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#202022] rounded-lg text-sm text-[#8b8b93] transition-colors">
              Columns
            </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 text-xs font-medium text-[#8b8b93] uppercase tracking-wider">
        <div className="col-span-4 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Company</div>
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
            const initial = account.name.charAt(0).toUpperCase();
            const iconBg = ICON_COLORS[idx % ICON_COLORS.length];
            const dateStr = new Date(account.updated_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

            return (
              <div
                key={account.id}
                onClick={() => onCompanyClick(account.id)}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-[#1a1a1c] cursor-pointer transition-colors group items-center"
              >
                <div className="col-span-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0`}>
                    {initial}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-[#e2e2e5] font-medium text-sm truncate group-hover:text-indigo-400 transition-colors">{account.name}</h3>
                    <p className="text-xs text-[#8b8b93] truncate">{account.hq_city ? `${account.hq_city}${account.hq_state ? `, ${account.hq_state}` : ''}` : account.name_normalized}</p>
                  </div>
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
