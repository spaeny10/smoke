import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { Target, TrendingUp, Users, DollarSign, Loader2 } from 'lucide-react';
import { reportsApi, type SignalsBySource, type SignalsByState, type SignalsOverTime, type TopAccount, type PipelineSummary } from './api';

const SOURCE_COLORS: Record<string, string> = {
  permit: '#818cf8',
  osha: '#10b981',
  procore: '#ec4899',
  usaspending: '#f59e0b',
  news: '#3b82f6',
};

export default function AttributionDashboard() {
  const [bySource, setBySource] = useState<SignalsBySource[]>([]);
  const [byState, setByState] = useState<SignalsByState[]>([]);
  const [overTime, setOverTime] = useState<SignalsOverTime[]>([]);
  const [topAccounts, setTopAccounts] = useState<TopAccount[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      reportsApi.signalsBySource(),
      reportsApi.signalsByState(),
      reportsApi.signalsOverTime(30),
      reportsApi.topAccounts(10),
      reportsApi.pipelineSummary(),
    ]).then(([srcRes, stateRes, timeRes, topRes, pipRes]) => {
      setBySource(srcRes.data);
      setByState(stateRes.data);
      setOverTime(timeRes.data);
      setTopAccounts(topRes.data);
      setPipeline(pipRes.data);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSignals = bySource.reduce((sum, s) => sum + s.count, 0);
  const totalAccounts = pipeline ? pipeline.tiers.reduce((sum, t) => sum + t.count, 0) : 0;
  const signalsThisWeek = overTime.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const highScoreAccounts = topAccounts.filter(a => a.composite_score >= 50).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading reports...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Attribution Reporting</h1>
          <p className="text-sm text-[#8b8b93]">Real-time signal analytics and pipeline intelligence.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <KPICard title="Total Signals" value={String(totalSignals)} icon={<Target size={20} className="text-indigo-400" />} />
        <KPICard title="Total Accounts" value={String(totalAccounts)} icon={<Users size={20} className="text-blue-400" />} />
        <KPICard title="Signals This Week" value={String(signalsThisWeek)} icon={<TrendingUp size={20} className="text-orange-400" />} />
        <KPICard title="High-Score Accounts" value={String(highScoreAccounts)} icon={<DollarSign size={20} className="text-green-400" />} />
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Signals Over Time (Area Chart) */}
        <div className="col-span-8 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-6">Signals Over Time (Last 30 Days)</h2>
          <div className="h-72 w-full">
            {overTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8b8b93' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b8b93' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="count" name="Signals" stroke="#818cf8" fillOpacity={1} fill="url(#colorSignals)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[#8b8b93] text-sm">No signal data yet</div>
            )}
          </div>
        </div>

        {/* Signals by Source (Pie Chart) */}
        <div className="col-span-4 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-6">Signals by Source</h2>
          <div className="h-52 w-full">
            {bySource.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {bySource.map((entry) => (
                      <Cell key={entry.source} fill={SOURCE_COLORS[entry.source] || '#8b8b93'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[#8b8b93] text-sm">No data</div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {bySource.map(s => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[s.source] || '#8b8b93' }} />
                  <span className="text-[#e2e2e5] capitalize">{s.source}</span>
                </div>
                <span className="text-[#8b8b93]">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Signals by State (Bar Chart) */}
        <div className="col-span-6 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-6">Signals by State</h2>
          <div className="h-72 w-full">
            {byState.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={byState.slice(0, 10)} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8b8b93' }} />
                  <YAxis type="category" dataKey="state" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#e2e2e5' }} width={40} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }} />
                  <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[#8b8b93] text-sm">No state data</div>
            )}
          </div>
        </div>

        {/* Pipeline Summary */}
        <div className="col-span-6 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-6">Pipeline Summary</h2>
          {pipeline && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs text-[#8b8b93] uppercase tracking-wider mb-3 font-medium">By Tier</h3>
                <div className="space-y-2">
                  {pipeline.tiers.map(t => {
                    const maxCount = Math.max(...pipeline.tiers.map(x => x.count), 1);
                    const label = t.tier === 0 ? 'Discovered' : t.tier === 1 ? 'Tier 1' : t.tier === 2 ? 'Tier 2' : 'Tier 3';
                    const color = t.tier === 0 ? 'bg-purple-500' : t.tier === 1 ? 'bg-orange-500' : t.tier === 2 ? 'bg-blue-500' : 'bg-[#8b8b93]';
                    return (
                      <div key={t.tier} className="flex items-center gap-3">
                        <span className="text-xs text-[#e2e2e5] w-20">{label}</span>
                        <div className="flex-1 h-5 bg-[#202022] rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${(t.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#8b8b93] w-8 text-right">{t.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="text-xs text-[#8b8b93] uppercase tracking-wider mb-3 font-medium">By Deal Stage</h3>
                <div className="grid grid-cols-2 gap-2">
                  {pipeline.stages.map(s => (
                    <div key={s.stage} className="bg-[#202022] rounded-lg px-3 py-2 border border-white/5">
                      <span className="text-[#8b8b93] text-xs block">{s.stage}</span>
                      <span className="text-white font-bold text-lg">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Accounts Table */}
      <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
         <h2 className="text-white font-semibold mb-6">Top Accounts by Score</h2>
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="border-b border-white/5 text-[#8b8b93] text-sm">
                     <th className="pb-3 font-medium">Company</th>
                     <th className="pb-3 font-medium">Tier</th>
                     <th className="pb-3 font-medium">Stage</th>
                     <th className="pb-3 font-medium">Segment</th>
                     <th className="pb-3 font-medium">Signals</th>
                     <th className="pb-3 font-medium text-right">Score</th>
                  </tr>
               </thead>
               <tbody className="text-sm">
                  {topAccounts.map(a => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 text-white font-medium">{a.name}</td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          a.tier === 1 ? 'bg-orange-500/10 text-orange-400' :
                          a.tier === 2 ? 'bg-blue-500/10 text-blue-400' :
                          'bg-[#202022] text-[#8b8b93]'
                        }`}>T{a.tier}</span>
                      </td>
                      <td className="py-4 text-[#8b8b93]">{a.deal_stage}</td>
                      <td className="py-4 text-[#e2e2e5]">{a.segment || '-'}</td>
                      <td className="py-4 text-[#e2e2e5]">{a.signal_count}</td>
                      <td className="py-4 text-right font-medium">
                        <span className={a.composite_score >= 50 ? 'text-orange-400' : 'text-[#e2e2e5]'}>
                          {Math.round(a.composite_score)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {topAccounts.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-[#8b8b93]">No account data yet</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

    </div>
  );
}

function KPICard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#202022] flex items-center justify-center border border-white/5">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm text-[#8b8b93] mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-white">{value}</h3>
      </div>
    </div>
  );
}
