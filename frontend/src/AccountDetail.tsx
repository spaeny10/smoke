import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronRight, ExternalLink, Target, Plus, AlertCircle, Loader2, Star, Phone, Mail, MessageSquare, FileText, Send } from 'lucide-react';
import { accountsApi, activitiesApi, signalDedupApi, enrichApi, sequencesApi, projectsApi, outreachApi, signalsApi, type Account, type Contact, type Signal, type Activity, type OutreachSequence, type Project } from './api';

const intentData = [
  { date: 'May 8', score: 68 },
  { date: 'May 15', score: 71 },
  { date: 'May 22', score: 55 },
  { date: 'May 29', score: 70 },
  { date: 'Jun 5', score: 25 },
  { date: 'Jun 12', score: 22 },
  { date: 'Jun 19', score: 35 },
  { date: 'Jun 26', score: 95 },
  { date: 'Jul 3', score: 72 },
  { date: 'Jul 10', score: 58 },
  { date: 'Jul 17', score: 60 },
  { date: 'Jul 24', score: 55 },
  { date: 'Jul 31', score: 10 },
  { date: 'Aug 7', score: 77 },
];

export default function AccountDetail({ accountId, onNavigate }: { accountId: string; onNavigate?: (tab: string) => void }) {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'signals' | 'people' | 'activity'>('overview');
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ channel: 'call', direction: 'outbound', summary: '' });
  const [logSaving, setLogSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [showDedupModal, setShowDedupModal] = useState(false);
  const [dupGroups, setDupGroups] = useState<Signal[][]>([]);
  const [dedupLoading, setDedupLoading] = useState(false);
  const [availableSequences, setAvailableSequences] = useState<OutreachSequence[]>([]);
  const [enrollMenuContactId, setEnrollMenuContactId] = useState<string | null>(null);
  const [accountApiProjects, setAccountApiProjects] = useState<Project[]>([]);
  const [promotingSignalId, setPromotingSignalId] = useState<string | null>(null);
  const [outreachContactId, setOutreachContactId] = useState<string | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);
  const [dismissingSignalId, setDismissingSignalId] = useState<string | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      accountsApi.get(accountId),
      accountsApi.getContacts(accountId),
      accountsApi.getSignals(accountId),
      projectsApi.list({ account_id: accountId, limit: 100 }),
    ]).then(([acctRes, contactsRes, signalsRes, projRes]) => {
      setAccount(acctRes.data);
      setContacts(contactsRes.data);
      setSignals(signalsRes.data);
      setAccountApiProjects(projRes.data.items);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId]);

  // Set of signal IDs that already have a project created from them
  const promotedSignalIds = new Set(accountApiProjects.filter(p => p.signal_id).map(p => p.signal_id!));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading account...</span>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#141416] text-[#8b8b93]">
        <p className="text-lg mb-4">Account not found</p>
        <button onClick={() => onNavigate?.('companies')} className="text-indigo-400 hover:underline">Back to Companies</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-8">
        
        {/* Breadcrumb */}
        <div className="flex shrink-0 items-center gap-2 text-sm text-[#8b8b93] mb-6">
          <span className="hover:text-white cursor-pointer transition-colors">Companies</span>
          <ChevronRight size={14} />
          <span className="text-white">{account.name}</span>
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-6 mb-8">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center border border-white/10 shadow-lg">
            <span className="text-white font-bold text-2xl tracking-tighter">{account.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
              {account.name}
            </h1>
            <span className="text-sm text-[#8b8b93] flex items-center gap-1">
              {account.hq_city ? `${account.hq_city}${account.hq_state ? `, ${account.hq_state}` : ''}` : account.name_normalized}
            </span>
          </div>

          <div className="ml-8 border-l border-white/10 pl-8">
            <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Score</p>
            <p className="text-3xl font-bold text-orange-500">{Math.round(account.composite_score)}</p>
          </div>

          <div className="ml-8 border-l border-white/10 pl-8">
            <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Tier</p>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(t => (
                <button
                  key={t}
                  onClick={() => {
                    accountsApi.update(accountId, { tier: t }).then(res => setAccount(res.data));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                    account.tier === t
                      ? t === 1 ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                        : t === 2 ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-[#202022] text-[#e2e2e5] border-white/10'
                      : 'bg-transparent text-[#8b8b93] border-white/5 hover:bg-[#202022]'
                  }`}
                >
                  {t === 1 && <Star size={10} className="inline mr-1 -mt-0.5" />}
                  T{t}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-8 border-l border-white/10 pl-8">
            <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">AI</p>
            <button
              onClick={() => {
                setEnriching(true);
                enrichApi.enrich(accountId)
                  .then(res => setAccount(res.data))
                  .catch(() => {})
                  .finally(() => setEnriching(false));
              }}
              disabled={enriching}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {enriching ? <Loader2 size={10} className="animate-spin" /> : <Star size={10} />}
              {enriching ? 'Enriching...' : 'Enrich'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div id="navigation-tabs-container" className="flex shrink-0 items-center gap-8 border-b border-white/10 mb-8 overflow-x-auto">
          <div 
            onClick={() => setActiveTab('overview')}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'overview' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            Overview
          </div>
          <div 
            onClick={() => setActiveTab('signals')}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'signals' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            Signals
          </div>
          <div
            onClick={() => setActiveTab('people')}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'people' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            People
          </div>
          <div
            onClick={() => {
              setActiveTab('activity');
              if (activities.length === 0 && !activityLoading) {
                setActivityLoading(true);
                activitiesApi.list({ account_id: accountId }).then(res => setActivities(res.data.items)).catch(() => {}).finally(() => setActivityLoading(false));
              }
            }}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'activity' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            Activity
          </div>
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* Overview Box */}
            <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
              <h2 className="text-white font-semibold mb-4">Overview</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Deal Stage</p>
                    <p className="text-sm text-[#e2e2e5]">{account.deal_stage || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Segment</p>
                    <p className="text-sm text-[#e2e2e5]">{account.segment || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Employees</p>
                    <p className="text-sm text-[#e2e2e5]">{account.employee_count ? account.employee_count.toLocaleString() : 'Unknown'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Headquarters</p>
                    <p className="text-sm text-[#e2e2e5]">{account.hq_city ? `${account.hq_city}${account.hq_state ? `, ${account.hq_state}` : ''}` : 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Region</p>
                    <p className="text-sm text-[#e2e2e5]">{account.region || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Score Trend</p>
                    <p className="text-sm text-[#e2e2e5]">{account.score_trend || 'Stable'}</p>
                  </div>
                </div>
              </div>
              {signals.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-2 font-semibold">Recent Signals</p>
                  <p className="text-sm text-[#e2e2e5]">
                    {signals.length} signal{signals.length !== 1 ? 's' : ''} detected
                    {signals.filter(s => s.heat === 'hot').length > 0 && <> — <span className="text-red-400 font-medium">{signals.filter(s => s.heat === 'hot').length} hot</span></>}
                    {signals.filter(s => s.heat === 'warm').length > 0 && <> — <span className="text-orange-400 font-medium">{signals.filter(s => s.heat === 'warm').length} warm</span></>}
                  </p>
                </div>
              )}
              {contacts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-2 font-semibold">Key Contacts</p>
                  <p className="text-sm text-[#e2e2e5]">
                    {contacts.length} contact{contacts.length !== 1 ? 's' : ''} on file
                    {contacts.filter(c => c.role_category === 'Decision Maker').length > 0 && <> — <span className="text-green-400 font-medium">{contacts.filter(c => c.role_category === 'Decision Maker').length} decision maker{contacts.filter(c => c.role_category === 'Decision Maker').length !== 1 ? 's' : ''}</span></>}
                  </p>
                </div>
              )}
            </div>

            {/* Intent Chart Box */}
            <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 relative mb-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-white font-semibold">Intent</h2>
                <div className="text-2xl font-bold text-orange-500">🔥 77</div>
              </div>
              
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={intentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIntent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#8b8b93' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#8b8b93' }}
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      itemStyle={{ color: '#f97316' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#f97316" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#colorIntent)" 
                      activeDot={{ r: 6, fill: '#f97316', stroke: '#202022', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-medium text-white">Why is this score 77?</h3>
                  <span className="text-xs text-[#8b8b93] bg-[#202022] px-2 py-1 rounded-md border border-white/5">Past 30 Days</span>
                </div>
                
                <div className="space-y-3">
                  {/* Positive Contributors */}
                  <div className="flex items-start gap-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 hover:bg-green-500/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center font-bold text-sm shrink-0">
                      +35
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#e2e2e5] mb-1">High-Intent Executive Activity</p>
                      <p className="text-xs text-[#8b8b93] leading-relaxed">
                        CRO Sophia Ramirez and CTO Marcus Chen visited the ROI calculator and API documentation 6 times collectively between July 8-17.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 hover:bg-green-500/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center font-bold text-sm shrink-0">
                      +25
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#e2e2e5] mb-1">Permit & Procore Signals</p>
                      <p className="text-xs text-[#8b8b93] leading-relaxed">
                        Account intelligence parsed 2 newly approved building permits in Chicago and 1 active Procore Bid for a $45M commercial development.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 hover:bg-green-500/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center font-bold text-sm shrink-0">
                      +17
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#e2e2e5] mb-1">Company-wide Engagement</p>
                      <p className="text-xs text-[#8b8b93] leading-relaxed">
                        Multiple users across revenue/marketing teams watched demo replays and accessed Salesforce integration content.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Projects List */}
            <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Target size={18} className="text-indigo-400" />
                  Active Projects (Pipeline)
                </h2>
              </div>

              {accountApiProjects.length === 0 ? (
                <div className="text-center py-8 text-[#8b8b93] text-sm">No projects yet. Promote a signal to create one.</div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[#8b8b93] text-sm">
                      <th className="pb-3 font-medium">Project Name</th>
                      <th className="pb-3 font-medium">Stage</th>
                      <th className="pb-3 font-medium">Est. Value</th>
                      <th className="pb-3 font-medium">Source</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {accountApiProjects.map((p) => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 text-white font-medium">{p.name}</td>
                        <td className="py-4">
                          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                            p.stage === 'new' ? 'bg-indigo-500/10 text-indigo-400' :
                            p.stage === 'engineering' ? 'bg-blue-500/10 text-blue-400' :
                            p.stage === 'contact' ? 'bg-green-500/10 text-green-400' :
                            p.stage === 'proposal' ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-gray-500/10 text-gray-400'
                          }`}>
                            {p.stage.charAt(0).toUpperCase() + p.stage.slice(1)}
                          </span>
                        </td>
                        <td className="py-4 text-green-400 font-medium">${p.estimated_value.toLocaleString()}</td>
                        <td className="py-4">
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md ${
                            p.origin === 'signal' ? 'bg-purple-500/10 text-purple-400' :
                            p.origin === 'scraped' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
                          }`}>
                            {p.origin === 'signal' ? 'From Signal' : p.origin}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <button
                            onClick={() => onNavigate?.('deals')}
                            className="text-xs text-indigo-400 font-medium hover:text-indigo-300 transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-md">
                            View Pipeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </>
        ) : activeTab === 'signals' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                📡 Raw Digested Signals
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDedupLoading(true);
                    setShowDedupModal(true);
                    signalDedupApi.findDuplicates(accountId)
                      .then(res => setDupGroups(res.data))
                      .catch(() => setDupGroups([]))
                      .finally(() => setDedupLoading(false));
                  }}
                  className="text-xs bg-[#202022] text-[#8b8b93] hover:text-white px-2 py-1 rounded-md border border-white/5 font-medium transition-colors"
                >
                  Deduplicate
                </button>
                <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-1 rounded-md border border-orange-500/20 font-medium">
                  High Priority
                </span>
                <span className="text-xs bg-[#202022] text-[#8b8b93] px-2 py-1 rounded-md border border-white/5 font-medium">
                  Past 30 Days
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {signals.length === 0 ? (
                <div className="text-center py-12 text-[#8b8b93] text-sm">No signals found for this account.</div>
              ) : signals.map((sig) => {
                const isPromoted = promotedSignalIds.has(sig.id);
                const isPromoting = promotingSignalId === sig.id;
                const src = sig.source.toLowerCase();
                const isOsha = src.includes('osha');
                const isProcore = src.includes('procore');
                const isPermit = src.includes('permit');
                const iconColor = isOsha ? 'text-red-400 bg-red-500/10' : isProcore ? 'text-orange-400 bg-orange-500/10' : isPermit ? 'text-blue-400 bg-blue-500/10' : 'text-green-400 bg-green-500/10';
                const borderColor = sig.heat === 'hot' ? 'border-red-500/20 hover:border-red-500/40' : sig.heat === 'warm' ? 'border-orange-500/20 hover:border-orange-500/40' : 'border-white/5 hover:border-white/10';
                const icon = isOsha ? <AlertCircle size={20} /> : isProcore ? <Target size={20} /> : isPermit ? <FileText size={20} /> : <ExternalLink size={20} />;
                return (
                  <div key={sig.id} className={`bg-[#202022] border ${borderColor} rounded-xl p-5 flex gap-4 transition-colors`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
                      {icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className={`text-xs font-bold uppercase tracking-wider block mb-1 ${isOsha ? 'text-red-400' : isProcore ? 'text-orange-400' : isPermit ? 'text-blue-400' : 'text-green-400'}`}>{sig.source}</span>
                          <h3 className="text-white font-medium text-base">{sig.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {sig.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                          {sig.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                          <span className="text-xs text-[#8b8b93]">
                            {sig.source_date ? new Date(sig.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : new Date(sig.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      {sig.detail && <p className="text-sm text-[#8b8b93] leading-relaxed mb-3">{sig.detail}</p>}
                      <div className="flex items-center gap-3 flex-wrap text-xs mb-4">
                        {sig.location_city && (
                          <span className="text-[#8b8b93]">{sig.location_city}{sig.location_state ? `, ${sig.location_state}` : ''}</span>
                        )}
                        {sig.project_value != null && sig.project_value > 0 && (
                          <span className="text-emerald-400 font-semibold">${sig.project_value >= 1_000_000 ? `${(sig.project_value / 1_000_000).toFixed(1)}M` : `${(sig.project_value / 1_000).toFixed(0)}K`}</span>
                        )}
                        {sig.score_contribution > 0 && (
                          <span className="text-indigo-400 font-bold">+{sig.score_contribution}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                        {isPromoted ? (
                          <span className="bg-indigo-500/10 text-indigo-400 text-xs font-semibold px-4 py-2 rounded-lg border border-indigo-500/20 flex items-center gap-2">
                            <Target size={14} /> Active in Projects
                          </span>
                        ) : (
                          <>
                            <button
                              disabled={isPromoting}
                              onClick={() => {
                                setPromotingSignalId(sig.id);
                                projectsApi.create({
                                  account_id: accountId,
                                  name: sig.project_name || sig.title,
                                  description: sig.detail || sig.title,
                                  signal_id: sig.id,
                                  stage: 'new',
                                  origin: 'signal',
                                  estimated_value: sig.project_value || 0,
                                }).then(res => {
                                  setAccountApiProjects(prev => [...prev, res.data]);
                                }).catch(() => {})
                                  .finally(() => setPromotingSignalId(null));
                              }}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                            >
                              {isPromoting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                              {isPromoting ? 'Creating...' : 'Promote to Project'}
                            </button>
                            <button
                              disabled={dismissingSignalId === sig.id}
                              onClick={() => {
                                setDismissingSignalId(sig.id);
                                signalsApi.updateStatus(sig.id, 'dismissed')
                                  .then(() => setSignals(prev => prev.filter(s => s.id !== sig.id)))
                                  .catch(() => {})
                                  .finally(() => setDismissingSignalId(null));
                              }}
                              className="text-[#8b8b93] hover:text-white disabled:opacity-50 text-xs font-medium px-4 py-2 rounded-lg transition-colors border border-white/5"
                            >
                              {dismissingSignalId === sig.id ? 'Dismissing...' : 'Dismiss'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'activity' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText size={18} className="text-indigo-400" />
                Activity Log
              </h2>
              <button
                onClick={() => setShowLogForm(!showLogForm)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Plus size={14} /> Log Activity
              </button>
            </div>

            {showLogForm && (
              <div className="bg-[#202022] border border-white/10 rounded-xl p-5 mb-6">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <label className="text-xs text-[#8b8b93] block mb-1.5">Channel</label>
                    <select
                      value={logForm.channel}
                      onChange={e => setLogForm(f => ({ ...f, channel: e.target.value }))}
                      className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-[#8b8b93] block mb-1.5">Direction</label>
                    <select
                      value={logForm.direction}
                      onChange={e => setLogForm(f => ({ ...f, direction: e.target.value }))}
                      className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="outbound">Outbound</option>
                      <option value="inbound">Inbound</option>
                    </select>
                  </div>
                </div>
                <textarea
                  placeholder="What happened?"
                  value={logForm.summary}
                  onChange={e => setLogForm(f => ({ ...f, summary: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500 mb-3 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowLogForm(false); setLogForm({ channel: 'call', direction: 'outbound', summary: '' }); }} className="text-xs text-[#8b8b93] hover:text-white px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
                  <button
                    disabled={logSaving || !logForm.summary.trim()}
                    onClick={() => {
                      setLogSaving(true);
                      activitiesApi.create({ account_id: accountId, channel: logForm.channel, direction: logForm.direction, summary: logForm.summary })
                        .then(res => {
                          setActivities(prev => [res.data, ...prev]);
                          setLogForm({ channel: 'call', direction: 'outbound', summary: '' });
                          setShowLogForm(false);
                        })
                        .catch(() => {})
                        .finally(() => setLogSaving(false));
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {logSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {activityLoading ? (
              <div className="flex items-center justify-center py-12 text-[#8b8b93]">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm">Loading activities...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12 text-[#8b8b93] text-sm">No activities logged yet.</div>
            ) : (
              <div className="space-y-3">
                {activities.map(a => {
                  const icon = a.channel === 'call' ? <Phone size={14} /> : a.channel === 'email' ? <Mail size={14} /> : a.channel === 'meeting' ? <MessageSquare size={14} /> : <FileText size={14} />;
                  const color = a.channel === 'call' ? 'text-green-400 bg-green-500/10' : a.channel === 'email' ? 'text-blue-400 bg-blue-500/10' : a.channel === 'meeting' ? 'text-purple-400 bg-purple-500/10' : 'text-[#8b8b93] bg-[#202022]';
                  return (
                    <div key={a.id} className="flex gap-3 p-3 rounded-xl bg-[#202022] border border-white/5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#8b8b93]">{a.channel}</span>
                          <span className="text-[10px] text-[#8b8b93]">{a.direction}</span>
                          {a.is_auto_logged && <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-medium">Auto</span>}
                        </div>
                        <p className="text-sm text-[#e2e2e5]">{a.summary}</p>
                        <span className="text-[10px] text-[#8b8b93] mt-1 block">
                          {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'people' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                👥 Key Contacts
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDiscoverLoading(true);
                    setDiscoverMsg(null);
                    accountsApi.discoverContacts(accountId)
                      .then(res => {
                        setDiscoverMsg(res.data.message);
                        // Auto-refresh contacts after delays to pick up new results
                        setTimeout(() => accountsApi.getContacts(accountId).then(r => setContacts(r.data)).catch(() => {}), 5000);
                        setTimeout(() => accountsApi.getContacts(accountId).then(r => setContacts(r.data)).catch(() => {}), 15000);
                      })
                      .catch(() => setDiscoverMsg('Failed to start discovery.'))
                      .finally(() => setDiscoverLoading(false));
                  }}
                  disabled={discoverLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {discoverLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                  {discoverLoading ? 'Discovering...' : 'Discover Contacts'}
                </button>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20">
                  <Plus size={14} /> Add Contact
                </button>
              </div>
            </div>

            {discoverMsg && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {discoverMsg}
              </div>
            )}

            {contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#8b8b93]">
                <p className="text-sm">No contacts found for this account.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {contacts.map((c) => {
                  const initials = c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                  return (
                    <div key={c.id} className="bg-[#202022] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                            {initials}
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{c.name}</h3>
                            <p className="text-xs text-[#8b8b93]">{c.title || 'No title'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.source && c.source.includes('linkedin') && (
                            <span className="bg-blue-500/10 text-blue-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">LinkedIn</span>
                          )}
                          {c.source === 'company_website' && (
                            <span className="bg-purple-500/10 text-purple-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">Website</span>
                          )}
                          {c.source === 'csv' && (
                            <span className="bg-gray-500/10 text-gray-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">CSV</span>
                          )}
                          {c.role_category && (
                            <span className="bg-green-500/10 text-green-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">
                              {c.role_category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Email:</span> {c.email || '-'}</p>
                        <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Phone:</span> {c.phone || '-'}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                        <button
                          onClick={() => {
                            setOutreachContactId(c.id);
                            setOutreachLoading(true);
                            setOutreachResult(null);
                            outreachApi.generate(accountId, c.id)
                              .then(res => setOutreachResult((res.data as any).message_text || (res.data as any).message || 'Outreach generated.'))
                              .catch(() => setOutreachResult('Failed to generate outreach.'))
                              .finally(() => setOutreachLoading(false));
                          }}
                          disabled={outreachLoading && outreachContactId === c.id}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-1.5"
                        >
                          {outreachLoading && outreachContactId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                          {outreachLoading && outreachContactId === c.id ? 'Generating...' : 'Draft Email'}
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => {
                              if (enrollMenuContactId === c.id) {
                                setEnrollMenuContactId(null);
                              } else {
                                setEnrollMenuContactId(c.id);
                                if (availableSequences.length === 0) {
                                  sequencesApi.list().then(res => setAvailableSequences(res.data)).catch(() => {});
                                }
                              }
                            }}
                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-medium py-2 px-3 rounded-lg transition-colors border border-indigo-500/20 flex items-center gap-1"
                          >
                            <Send size={10} /> Sequence
                          </button>
                          {enrollMenuContactId === c.id && (
                            <div className="absolute bottom-full right-0 mb-1 w-52 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                              {availableSequences.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-[#8b8b93]">No sequences yet</div>
                              ) : availableSequences.map(seq => (
                                <button
                                  key={seq.id}
                                  onClick={() => {
                                    sequencesApi.enroll(seq.id, { contact_id: c.id, account_id: accountId })
                                      .then(() => setEnrollMenuContactId(null))
                                      .catch(() => {});
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-[#e2e2e5] hover:bg-[#202022] transition-colors truncate"
                                >
                                  {seq.name} ({seq.steps.length} steps)
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Outreach result */}
                      {outreachContactId === c.id && outreachResult && (
                        <div className="mt-3 bg-[#141416] border border-white/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-[#8b8b93] uppercase tracking-wider font-semibold">Generated Outreach</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(outreachResult)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-xs text-[#e2e2e5] whitespace-pre-wrap leading-relaxed">{outreachResult}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Dedup Modal */}
      {showDedupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowDedupModal(false)}>
          <div className="bg-[#1a1a1c] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
              <h2 className="text-lg font-semibold text-white">Duplicate Signals</h2>
              <button onClick={() => setShowDedupModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors">
                <AlertCircle size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {dedupLoading ? (
                <div className="flex items-center justify-center py-12 text-[#8b8b93]">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span className="text-sm">Scanning for duplicates...</span>
                </div>
              ) : dupGroups.length === 0 ? (
                <div className="text-center py-12 text-[#8b8b93] text-sm">No duplicate signals found.</div>
              ) : (
                <div className="space-y-4">
                  {dupGroups.map((group, gi) => (
                    <div key={gi} className="bg-[#202022] border border-white/5 rounded-xl p-4">
                      <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-3 font-medium">
                        {group[0]?.source} — "{group[0]?.title}" ({group.length} duplicates)
                      </p>
                      <div className="space-y-2">
                        {group.map((sig, si) => (
                          <div key={sig.id} className="flex items-center justify-between text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="text-[#e2e2e5] truncate block">{sig.title}</span>
                              <span className="text-[10px] text-[#8b8b93]">{new Date(sig.detected_at).toLocaleDateString()}</span>
                            </div>
                            {si === 0 ? (
                              <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded font-medium ml-2 shrink-0">Keep</span>
                            ) : (
                              <button
                                onClick={() => {
                                  signalDedupApi.merge(group[0].id, [sig.id]).then(() => {
                                    setDupGroups(prev => {
                                      const updated = prev.map((g, idx) => idx === gi ? g.filter(s => s.id !== sig.id) : g);
                                      return updated.filter(g => g.length > 1);
                                    });
                                    setSignals(prev => prev.filter(s => s.id !== sig.id));
                                  }).catch(() => {});
                                }}
                                className="text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-0.5 rounded font-medium ml-2 shrink-0 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {group.length > 1 && (
                        <button
                          onClick={() => {
                            const removeIds = group.slice(1).map(s => s.id);
                            signalDedupApi.merge(group[0].id, removeIds).then(() => {
                              setDupGroups(prev => prev.filter((_, idx) => idx !== gi));
                              setSignals(prev => prev.filter(s => !removeIds.includes(s.id)));
                            }).catch(() => {});
                          }}
                          className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                          Merge all — keep oldest
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right Properties Sidebar */}
      <div className="w-80 border-l border-[#202022] bg-[#141416] p-6 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-semibold text-white">Properties</h2>
          <ChevronRight size={16} className="text-[#8b8b93] cursor-pointer" />
        </div>
        
        <div className="space-y-5">
          <PropertyRow label="Company Name" value={account.name} icon="🏢" />
          <PropertyRow label="Stage" value={account.deal_stage} icon="📊" />
          <PropertyRow label="Segment" value={account.segment || '-'} icon="🏗️" />
          <PropertyRow label="Region" value={account.region || '-'} icon="🌎" />
          <PropertyRow label="Website" value={account.website || '-'} icon="🌐" />
          <PropertyRow label="Employees" value={account.employee_count ? account.employee_count.toLocaleString() : '-'} icon="👥" />
          <PropertyRow label="Score Trend" value={account.score_trend} icon="📈" />
          <PropertyRow label="City" value={account.hq_city || '-'} icon="📍" />
          <PropertyRow label="State" value={account.hq_state || '-'} icon="🗺️" />
          <PropertyRow label="Contacts" value={String(contacts.length)} icon="👤" />
          <PropertyRow label="Signals" value={String(signals.length)} icon="📡" />
        </div>
      </div>
    </div>
  );
}
function PropertyRow({ label, value, icon }: { label: string, value: string, icon: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <div className="flex items-center gap-2 text-[#8b8b93]">
        <span className="opacity-70 text-xs">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="text-white font-medium max-w-[50%] text-right truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
