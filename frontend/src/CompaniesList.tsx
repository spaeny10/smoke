import { useState, useEffect } from 'react';
import { Search, RefreshCw, Download, Filter, Loader2 } from 'lucide-react';
import { accountsApi, type Account } from './api';

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

            <button className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors">
              <Download size={14} className="text-[#8b8b93]" />
              Download CSV
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
    </div>
  );
}
