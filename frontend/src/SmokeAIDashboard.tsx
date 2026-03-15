import React, { useState, useEffect } from 'react';
import {
  Search, MessageSquare, Send, Sparkles, Building2, AlertCircle, FileText, Bot,
  Loader2, Check, XCircle, MapPin, Calendar, TrendingUp, ArrowLeft, User, Star,
  Target, Plus, ChevronDown, Copy, Phone, Mail, LayoutList, Rows3, Table2
} from 'lucide-react';
import {
  signalsApi, aiApi, accountsApi, contactsApi, projectsApi, activitiesApi, outreachApi,
  type Signal, type Account, type Contact,
} from './api';

function getSignalType(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('osha')) return 'osha';
  if (s.includes('permit')) return 'permit';
  if (s.includes('procore')) return 'procore';
  return 'news';
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

type TierFilterValue = 'tier12' | 'tier1' | 'all';
type StatusFilterValue = 'new' | 'all';
type ViewMode = 'expanded' | 'compact' | 'table';

const DEAL_STAGES = ['discovery', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

interface SmokeAIDashboardProps {
  onAccountClick?: (accountId: string) => void;
}

export default function SmokeAIDashboard({ onAccountClick }: SmokeAIDashboardProps) {
  // Signal feed state
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<TierFilterValue>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('new');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');

  // AI chat state
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    {
      role: 'assistant',
      content: 'Hello! I am SMOKE AI. I continuously scan millions of data points across OSHA, building permits, news, and project boards. How can I help you find targets today?'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [chatSignals, setChatSignals] = useState<(Signal & { account_name?: string })[]>([]);

  // Triage panel state
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [triageAccount, setTriageAccount] = useState<Account | null>(null);
  const [triageContacts, setTriageContacts] = useState<Contact[]>([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectValue, setProjectValue] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [activityChannel, setActivityChannel] = useState('note');
  const [activitySaving, setActivitySaving] = useState(false);
  const [outreachContactId, setOutreachContactId] = useState<string | null>(null);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  const fetchSignals = () => {
    setSignalsLoading(true);
    const params: Record<string, string | number> = { limit: 30, view: 'all' };
    if (statusFilter === 'new') params.status = 'new';
    if (tierFilter === 'tier1') params.tier = 1;
    if (tierFilter === 'tier12') {
      // tier 1+2: no tier param, filter client-side
    }
    signalsApi.list(params as Record<string, string>)
      .then(res => setSignals(res.data.items))
      .catch(() => {})
      .finally(() => setSignalsLoading(false));
  };

  useEffect(() => {
    fetchSignals();
  }, [tierFilter, statusFilter]);

  const handleStatusUpdate = (signalId: string, newStatus: string) => {
    signalsApi.updateStatus(signalId, newStatus)
      .then(() => {
        setSignals(prev => prev.filter(s => s.id !== signalId));
        if (selectedSignal?.id === signalId) {
          setSelectedSignal(null);
        }
      })
      .catch(() => {});
  };

  const handleSignalClick = (signal: Signal) => {
    setSelectedSignal(signal);
    setTriageLoading(true);
    setTriageAccount(null);
    setTriageContacts([]);
    setOutreachResult(null);
    setOutreachContactId(null);
    setActionFeedback(null);
    setShowCreateContact(false);
    setShowCreateProject(false);
    setActivityNote('');
    setActivityChannel('note');

    Promise.all([
      accountsApi.get(signal.account_id),
      accountsApi.getContacts(signal.account_id),
    ]).then(([acctRes, contactsRes]) => {
      setTriageAccount(acctRes.data);
      setTriageContacts(contactsRes.data);
      // Pre-fill project form
      setProjectName(signal.project_name || signal.title);
      setProjectValue(signal.project_value ? String(signal.project_value) : '');
    }).catch(() => {})
      .finally(() => setTriageLoading(false));
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleTierUpdate = (tier: number) => {
    if (!selectedSignal) return;
    accountsApi.update(selectedSignal.account_id, { tier } as Partial<Account>)
      .then(res => {
        setTriageAccount(res.data);
        showFeedback(`Promoted to Tier ${tier}`);
      })
      .catch(() => {});
  };

  const handleStageUpdate = (stage: string) => {
    if (!selectedSignal) return;
    setShowStageDropdown(false);
    accountsApi.update(selectedSignal.account_id, { deal_stage: stage } as Partial<Account>)
      .then(res => {
        setTriageAccount(res.data);
        showFeedback(`Stage → ${stage}`);
      })
      .catch(() => {});
  };

  const handleCreateProject = () => {
    if (!selectedSignal || !projectName.trim()) return;
    setProjectSaving(true);
    projectsApi.create({
      account_id: selectedSignal.account_id,
      name: projectName.trim(),
      description: selectedSignal.detail || selectedSignal.title,
      signal_id: selectedSignal.id,
      stage: 'new',
      origin: 'signal',
      estimated_value: parseFloat(projectValue) || 0,
    })
      .then(() => {
        setShowCreateProject(false);
        showFeedback('Project created');
        handleStatusUpdate(selectedSignal.id, 'actioned');
      })
      .catch(() => {})
      .finally(() => setProjectSaving(false));
  };

  const handleCreateContact = () => {
    if (!selectedSignal || !newContact.name.trim()) return;
    setContactSaving(true);
    contactsApi.create({
      account_id: selectedSignal.account_id,
      name: newContact.name.trim(),
      title: newContact.title || undefined,
      email: newContact.email || undefined,
      phone: newContact.phone || undefined,
    })
      .then(res => {
        setTriageContacts(prev => [...prev, res.data]);
        setNewContact({ name: '', title: '', email: '', phone: '' });
        setShowCreateContact(false);
        showFeedback('Contact added');
      })
      .catch(() => {})
      .finally(() => setContactSaving(false));
  };

  const handleGenerateOutreach = (contactId: string) => {
    if (!selectedSignal) return;
    setOutreachContactId(contactId);
    setOutreachLoading(true);
    setOutreachResult(null);
    outreachApi.generate(selectedSignal.account_id, contactId)
      .then(res => {
        setOutreachResult(res.data.message_text || res.data.message || 'Outreach generated.');
      })
      .catch(() => setOutreachResult('Failed to generate outreach.'))
      .finally(() => setOutreachLoading(false));
  };

  const handleLogActivity = () => {
    if (!selectedSignal || !activityNote.trim()) return;
    setActivitySaving(true);
    activitiesApi.create({
      account_id: selectedSignal.account_id,
      channel: activityChannel,
      direction: 'outbound',
      summary: activityNote.trim(),
    })
      .then(() => {
        setActivityNote('');
        showFeedback('Activity logged');
      })
      .catch(() => {})
      .finally(() => setActivitySaving(false));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userQuery = query;
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setQuery('');
    setIsTyping(true);
    setChatSignals([]);

    try {
      const res = await aiApi.search(userQuery);
      const { message, signals: resultSignals } = res.data;
      setChatSignals(resultSignals);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: message,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error while searching. Please try again.',
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Pane - Incoming Signals Feed */}
      <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col bg-[#141416] min-h-0 flex-1 lg:flex-auto">
        <div className="p-4 lg:p-6 border-b border-white/5 bg-[#1a1a1c]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Incoming Signals</h2>
              <p className="text-sm text-[#8b8b93]">Click a signal to triage it.</p>
            </div>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filter */}
            <div className="flex bg-[#202022] rounded-lg p-0.5 border border-white/5">
              <button
                onClick={() => setStatusFilter('new')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === 'new' ? 'bg-indigo-600 text-white' : 'text-[#8b8b93] hover:text-white'}`}
              >
                New Only
              </button>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-[#8b8b93] hover:text-white'}`}
              >
                All
              </button>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Tier filter */}
            {([
              { value: 'tier12' as TierFilterValue, label: 'Tier 1+2' },
              { value: 'tier1' as TierFilterValue, label: 'Tier 1 Only' },
              { value: 'all' as TierFilterValue, label: 'All Tiers' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setTierFilter(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  tierFilter === opt.value
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    : 'text-[#8b8b93] border-transparent hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}

            <div className="ml-auto" />

            {/* View mode toggle */}
            <div className="flex bg-[#202022] rounded-lg p-0.5 border border-white/5">
              {([
                { mode: 'compact' as ViewMode, icon: <Rows3 size={14} />, title: 'Compact' },
                { mode: 'expanded' as ViewMode, icon: <LayoutList size={14} />, title: 'Expanded' },
                { mode: 'table' as ViewMode, icon: <Table2 size={14} />, title: 'Table' },
              ]).map(v => (
                <button
                  key={v.mode}
                  onClick={() => setViewMode(v.mode)}
                  title={v.title}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === v.mode ? 'bg-indigo-600 text-white' : 'text-[#8b8b93] hover:text-white'}`}
                >
                  {v.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto ${viewMode === 'table' ? 'p-0' : 'p-6'} ${viewMode === 'table' ? '' : viewMode === 'compact' ? 'space-y-1.5' : 'space-y-4'}`}>
          {signalsLoading ? (
            <div className="flex items-center justify-center py-20 text-[#8b8b93]">
              <Loader2 size={24} className="animate-spin mr-3" />
              <span>Loading signals...</span>
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8b8b93]">
              <AlertCircle size={32} className="mb-4 opacity-30" />
              <p className="text-sm">No {statusFilter === 'new' ? 'new ' : ''}signals detected yet.</p>
              <p className="text-xs mt-1">Signals will appear here as they are ingested.</p>
            </div>
          ) : viewMode === 'table' ? (
            /* ── TABLE VIEW ── */
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#1a1a1c] z-10">
                <tr className="text-[10px] text-[#8b8b93] uppercase tracking-wider border-b border-white/5">
                  <th className="py-2.5 px-4 font-semibold">Source</th>
                  <th className="py-2.5 px-2 font-semibold">Company</th>
                  <th className="py-2.5 px-2 font-semibold">Signal</th>
                  <th className="py-2.5 px-2 font-semibold">Location</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Value</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Score</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Heat</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => {
                  const isSelected = selectedSignal?.id === signal.id;
                  return (
                    <tr
                      key={signal.id}
                      onClick={() => handleSignalClick(signal)}
                      className={`border-b border-white/[0.03] cursor-pointer transition-colors text-xs ${
                        isSelected ? 'bg-indigo-500/5' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-2 px-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          getSignalType(signal.source) === 'osha' ? 'text-red-400' :
                          getSignalType(signal.source) === 'permit' ? 'text-blue-400' :
                          getSignalType(signal.source) === 'procore' ? 'text-orange-400' :
                          'text-green-400'
                        }`}>{signal.source}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className="text-indigo-400 font-medium hover:underline truncate block max-w-[140px]"
                          onClick={(e) => { e.stopPropagation(); onAccountClick?.(signal.account_id); }}
                        >
                          {signal.account_name || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-[#e2e2e5] max-w-[200px] truncate">{signal.title}</td>
                      <td className="py-2 px-2 text-[#8b8b93] whitespace-nowrap">
                        {signal.location_city ? `${signal.location_city}${signal.location_state ? `, ${signal.location_state}` : ''}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {signal.project_value != null && signal.project_value > 0 ? (
                          <span className="text-emerald-400 font-semibold">${signal.project_value >= 1_000_000 ? `${(signal.project_value / 1_000_000).toFixed(1)}M` : `${(signal.project_value / 1_000).toFixed(0)}K`}</span>
                        ) : <span className="text-[#8b8b93]">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {signal.score_contribution > 0 && (
                          <span className="text-indigo-400 font-bold">+{signal.score_contribution}</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {signal.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                        {signal.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                        {signal.heat === 'cool' && <span className="text-[#8b8b93]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : viewMode === 'compact' ? (
            /* ── COMPACT VIEW ── */
            signals.map((signal) => {
              const type = getSignalType(signal.source);
              const isSelected = selectedSignal?.id === signal.id;
              return (
                <div
                  key={signal.id}
                  onClick={() => handleSignalClick(signal)}
                  className={`bg-[#1a1a1c] border rounded-lg px-4 py-2.5 transition-colors group cursor-pointer flex items-center gap-3 ${
                    isSelected
                      ? 'border-indigo-500/50 ring-1 ring-indigo-500/20'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Source icon */}
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    type === 'osha' ? 'bg-red-500/10 text-red-500' :
                    type === 'permit' ? 'bg-blue-500/10 text-blue-500' :
                    type === 'procore' ? 'bg-orange-500/10 text-orange-500' :
                    'bg-green-500/10 text-green-500'
                  }`}>
                    {type === 'osha' ? <AlertCircle size={14} /> :
                     type === 'permit' ? <FileText size={14} /> :
                     type === 'procore' ? <Building2 size={14} /> :
                     <MessageSquare size={14} />}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {signal.account_name && (
                        <span
                          className="text-xs text-indigo-400 font-semibold hover:underline shrink-0"
                          onClick={(e) => { e.stopPropagation(); onAccountClick?.(signal.account_id); }}
                        >
                          {signal.account_name}
                        </span>
                      )}
                      <span className="text-xs text-white truncate">{signal.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#8b8b93]">
                      <span className="uppercase font-semibold tracking-wider">{signal.source}</span>
                      {signal.location_city && (
                        <>
                          <span className="opacity-30">|</span>
                          <span>{signal.location_city}{signal.location_state ? `, ${signal.location_state}` : ''}</span>
                        </>
                      )}
                      {signal.source_date ? (
                        <>
                          <span className="opacity-30">|</span>
                          <span>{new Date(signal.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </>
                      ) : (
                        <>
                          <span className="opacity-30">|</span>
                          <span>{timeAgo(signal.detected_at)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: value + badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {signal.project_value != null && signal.project_value > 0 && (
                      <span className="text-emerald-400 font-semibold text-xs">${signal.project_value >= 1_000_000 ? `${(signal.project_value / 1_000_000).toFixed(1)}M` : `${(signal.project_value / 1_000).toFixed(0)}K`}</span>
                    )}
                    {signal.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                    {signal.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                    {signal.score_contribution > 0 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        +{signal.score_contribution}
                      </span>
                    )}
                    {/* Quick actions on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusUpdate(signal.id, 'actioned'); }}
                        className="w-6 h-6 rounded flex items-center justify-center bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                        title="Mark Done"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusUpdate(signal.id, 'dismissed'); }}
                        className="w-6 h-6 rounded flex items-center justify-center bg-[#202022] text-[#8b8b93] hover:text-white transition-colors"
                        title="Dismiss"
                      >
                        <XCircle size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            /* ── EXPANDED VIEW (original) ── */
            signals.map((signal) => {
              const type = getSignalType(signal.source);
              const isSelected = selectedSignal?.id === signal.id;
              return (
                <div
                  key={signal.id}
                  onClick={() => handleSignalClick(signal)}
                  className={`bg-[#1a1a1c] border rounded-xl p-5 transition-colors group relative cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500/50 ring-1 ring-indigo-500/20'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Header: source badge + company + heat + date */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        type === 'osha' ? 'bg-red-500/10 text-red-500' :
                        type === 'permit' ? 'bg-blue-500/10 text-blue-500' :
                        type === 'procore' ? 'bg-orange-500/10 text-orange-500' :
                        'bg-green-500/10 text-green-500'
                      }`}>
                        {type === 'osha' ? <AlertCircle size={16} /> :
                         type === 'permit' ? <FileText size={16} /> :
                         type === 'procore' ? <Building2 size={16} /> :
                         <MessageSquare size={16} />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-[#8b8b93] tracking-wider uppercase">{signal.source}</span>
                        {signal.account_name && (
                          <p
                            className="text-sm text-indigo-400 font-semibold truncate hover:underline"
                            onClick={(e) => { e.stopPropagation(); onAccountClick?.(signal.account_id); }}
                          >
                            {signal.account_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {signal.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                      {signal.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                      {signal.score_contribution > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <TrendingUp size={10} />+{signal.score_contribution}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-white font-medium mb-1.5">{signal.title}</h3>

                  {/* Detail */}
                  <p className="text-sm text-[#8b8b93] mb-2.5 leading-relaxed line-clamp-2">{signal.detail || `${signal.source} signal — ${signal.signal_type}`}</p>

                  {/* Metadata row: date, location, value */}
                  <div className="flex items-center gap-3 flex-wrap text-xs mb-3">
                    {signal.source_date && (
                      <span className="flex items-center gap-1 text-[#8b8b93]">
                        <Calendar size={11} />
                        {new Date(signal.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    {!signal.source_date && (
                      <span className="flex items-center gap-1 text-[#8b8b93]">
                        <Calendar size={11} />
                        {timeAgo(signal.detected_at)}
                      </span>
                    )}
                    {signal.location_city && (
                      <span className="flex items-center gap-1 text-[#8b8b93]">
                        <MapPin size={11} />
                        {signal.location_city}{signal.location_state ? `, ${signal.location_state}` : ''}
                      </span>
                    )}
                    {signal.project_value != null && signal.project_value > 0 && (
                      <span className="text-emerald-400 font-semibold">${signal.project_value >= 1_000_000 ? `${(signal.project_value / 1_000_000).toFixed(1)}M` : `${(signal.project_value / 1_000).toFixed(0)}K`}</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStatusUpdate(signal.id, 'actioned'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      <Check size={12} />
                      Mark Done
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStatusUpdate(signal.id, 'dismissed'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#202022] text-[#8b8b93] border border-white/5 hover:bg-[#2a2a2d] hover:text-white transition-colors"
                    >
                      <XCircle size={12} />
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane — Triage Panel or AI Chat */}
      <div className="w-full lg:w-1/2 flex flex-col bg-[#141416] relative min-h-0 flex-1 lg:flex-auto">
        {selectedSignal ? (
          /* ──────── TRIAGE PANEL ──────── */
          <>
            {/* Triage Header */}
            <div className="p-6 border-b border-white/5 bg-[#1a1a1c]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedSignal(null)}
                  className="w-8 h-8 rounded-lg bg-[#202022] hover:bg-[#2a2a2d] flex items-center justify-center text-[#8b8b93] hover:text-white transition-colors border border-white/5"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      getSignalType(selectedSignal.source) === 'osha' ? 'text-red-400' :
                      getSignalType(selectedSignal.source) === 'permit' ? 'text-blue-400' :
                      getSignalType(selectedSignal.source) === 'procore' ? 'text-orange-400' :
                      'text-green-400'
                    }`}>{selectedSignal.source}</span>
                    {selectedSignal.account_name && (
                      <span
                        className="text-sm text-indigo-400 font-semibold hover:underline cursor-pointer truncate"
                        onClick={() => onAccountClick?.(selectedSignal.account_id)}
                      >
                        {selectedSignal.account_name}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white truncate">{selectedSignal.title}</h2>
                </div>
              </div>

              {/* Feedback toast */}
              {actionFeedback && (
                <div className="mt-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-xs font-medium flex items-center gap-2">
                  <Check size={14} /> {actionFeedback}
                </div>
              )}
            </div>

            {/* Triage Content — Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {triageLoading ? (
                <div className="flex items-center justify-center py-20 text-[#8b8b93]">
                  <Loader2 size={24} className="animate-spin mr-3" />
                  <span>Loading account data...</span>
                </div>
              ) : (
                <>
                  {/* Signal Detail */}
                  <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
                    <p className="text-sm text-[#e2e2e5] leading-relaxed mb-3">{selectedSignal.detail}</p>
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      {selectedSignal.source_date && (
                        <span className="flex items-center gap-1 text-[#8b8b93]">
                          <Calendar size={11} />
                          {new Date(selectedSignal.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {selectedSignal.location_city && (
                        <span className="flex items-center gap-1 text-[#8b8b93]">
                          <MapPin size={11} />
                          {selectedSignal.location_city}{selectedSignal.location_state ? `, ${selectedSignal.location_state}` : ''}
                        </span>
                      )}
                      {selectedSignal.project_value != null && selectedSignal.project_value > 0 && (
                        <span className="text-emerald-400 font-semibold">
                          ${selectedSignal.project_value >= 1_000_000 ? `${(selectedSignal.project_value / 1_000_000).toFixed(1)}M` : `${(selectedSignal.project_value / 1_000).toFixed(0)}K`}
                        </span>
                      )}
                      {selectedSignal.heat && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          selectedSignal.heat === 'hot' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          selectedSignal.heat === 'warm' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                          'bg-[#202022] text-[#8b8b93] border border-white/5'
                        }`}>{selectedSignal.heat.toUpperCase()}</span>
                      )}
                    </div>
                  </div>

                  {/* Promote Section */}
                  <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Star size={14} className="text-indigo-400" />
                      Promote Account
                    </h3>

                    {triageAccount && (
                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center border border-white/10">
                          <span className="text-white font-bold text-sm">{triageAccount.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-white font-medium truncate hover:text-indigo-400 cursor-pointer transition-colors"
                            onClick={() => onAccountClick?.(triageAccount.id)}
                          >
                            {triageAccount.name}
                          </p>
                          <p className="text-xs text-[#8b8b93]">
                            {triageAccount.hq_city ? `${triageAccount.hq_city}${triageAccount.hq_state ? `, ${triageAccount.hq_state}` : ''}` : triageAccount.segment || 'Unknown'}
                            {triageAccount.composite_score > 0 && <span className="ml-2 text-orange-400 font-bold">Score: {Math.round(triageAccount.composite_score)}</span>}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Tier buttons */}
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-xs text-[#8b8b93] w-12 shrink-0">Tier</span>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3].map(t => (
                          <button
                            key={t}
                            onClick={() => handleTierUpdate(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                              triageAccount?.tier === t
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

                    {/* Deal Stage */}
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[#8b8b93] w-12 shrink-0">Stage</span>
                      <div className="relative flex-1">
                        <button
                          onClick={() => setShowStageDropdown(!showStageDropdown)}
                          className="w-full flex items-center justify-between px-3 py-1.5 bg-[#202022] border border-white/10 rounded-lg text-xs text-white hover:border-white/20 transition-colors"
                        >
                          <span>{triageAccount?.deal_stage || 'discovery'}</span>
                          <ChevronDown size={12} className="text-[#8b8b93]" />
                        </button>
                        {showStageDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                            {DEAL_STAGES.map(stage => (
                              <button
                                key={stage}
                                onClick={() => handleStageUpdate(stage)}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#202022] transition-colors ${
                                  triageAccount?.deal_stage === stage ? 'text-indigo-400 font-medium' : 'text-[#e2e2e5]'
                                }`}
                              >
                                {stage.replace(/_/g, ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Create Project */}
                  <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Target size={14} className="text-indigo-400" />
                        Project
                      </h3>
                      {!showCreateProject && (
                        <button
                          onClick={() => setShowCreateProject(true)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1"
                        >
                          <Plus size={12} /> Create Project
                        </button>
                      )}
                    </div>

                    {showCreateProject && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-[#8b8b93] block mb-1">Project Name</label>
                          <input
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#8b8b93] block mb-1">Estimated Value ($)</label>
                          <input
                            value={projectValue}
                            onChange={e => setProjectValue(e.target.value)}
                            type="number"
                            className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowCreateProject(false)}
                            className="text-xs text-[#8b8b93] hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateProject}
                            disabled={projectSaving || !projectName.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            {projectSaving ? <Loader2 size={12} className="animate-spin" /> : <Target size={12} />}
                            {projectSaving ? 'Creating...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contacts & Outreach */}
                  <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <User size={14} className="text-indigo-400" />
                        Contacts ({triageContacts.length})
                      </h3>
                      <button
                        onClick={() => setShowCreateContact(!showCreateContact)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Contact
                      </button>
                    </div>

                    {/* Add Contact Form */}
                    {showCreateContact && (
                      <div className="bg-[#202022] border border-white/10 rounded-lg p-4 mb-3">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-[#8b8b93] block mb-1">Name *</label>
                            <input
                              value={newContact.name}
                              onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))}
                              placeholder="Jane Smith"
                              className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#8b8b93] block mb-1">Title</label>
                            <input
                              value={newContact.title}
                              onChange={e => setNewContact(c => ({ ...c, title: e.target.value }))}
                              placeholder="VP of Operations"
                              className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#8b8b93] block mb-1">Email</label>
                            <input
                              value={newContact.email}
                              onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                              placeholder="jane@company.com"
                              className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#8b8b93] block mb-1">Phone</label>
                            <input
                              value={newContact.phone}
                              onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
                              placeholder="(555) 123-4567"
                              className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setShowCreateContact(false); setNewContact({ name: '', title: '', email: '', phone: '' }); }}
                            className="text-xs text-[#8b8b93] hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateContact}
                            disabled={contactSaving || !newContact.name.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            {contactSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                            {contactSaving ? 'Saving...' : 'Add Contact'}
                          </button>
                        </div>
                      </div>
                    )}

                    {triageContacts.length === 0 && !showCreateContact ? (
                      <div className="text-center py-6">
                        <User size={24} className="mx-auto mb-2 text-[#8b8b93] opacity-30" />
                        <p className="text-sm text-[#8b8b93] mb-2">No contacts for this account.</p>
                        <button
                          onClick={() => setShowCreateContact(true)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                          Add one to start outreach
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {triageContacts.map(c => (
                          <div key={c.id} className="bg-[#202022] border border-white/5 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                                  {c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-white font-medium truncate">{c.name}</p>
                                  <p className="text-[10px] text-[#8b8b93] truncate">{c.title || 'No title'}{c.email ? ` · ${c.email}` : ''}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleGenerateOutreach(c.id)}
                                disabled={outreachLoading && outreachContactId === c.id}
                                className="text-xs bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md font-medium transition-colors border border-indigo-500/20 flex items-center gap-1 shrink-0"
                              >
                                {outreachLoading && outreachContactId === c.id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Mail size={10} />
                                )}
                                Outreach
                              </button>
                            </div>

                            {/* Outreach result for this contact */}
                            {outreachContactId === c.id && outreachResult && (
                              <div className="mt-2 bg-[#141416] border border-white/10 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] text-[#8b8b93] uppercase tracking-wider font-semibold">Generated Outreach</span>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(outreachResult)}
                                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Copy size={10} /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-[#e2e2e5] whitespace-pre-wrap leading-relaxed">{outreachResult}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Log Activity */}
                  <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <FileText size={14} className="text-indigo-400" />
                      Log Activity
                    </h3>
                    <div className="flex gap-2 mb-2">
                      {(['note', 'call', 'email', 'meeting'] as const).map(ch => (
                        <button
                          key={ch}
                          onClick={() => setActivityChannel(ch)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                            activityChannel === ch
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                              : 'text-[#8b8b93] border-white/5 hover:text-white'
                          }`}
                        >
                          {ch === 'note' && <FileText size={10} className="inline mr-1 -mt-0.5" />}
                          {ch === 'call' && <Phone size={10} className="inline mr-1 -mt-0.5" />}
                          {ch === 'email' && <Mail size={10} className="inline mr-1 -mt-0.5" />}
                          {ch === 'meeting' && <MessageSquare size={10} className="inline mr-1 -mt-0.5" />}
                          {ch.charAt(0).toUpperCase() + ch.slice(1)}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={activityNote}
                      onChange={e => setActivityNote(e.target.value)}
                      placeholder="Add a note about this signal..."
                      rows={2}
                      className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500 resize-none mb-2"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleLogActivity}
                        disabled={activitySaving || !activityNote.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {activitySaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {activitySaving ? 'Saving...' : 'Log'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Bottom action bar */}
            {!triageLoading && (
              <div className="p-4 border-t border-white/5 bg-[#1a1a1c] flex items-center gap-2">
                <button
                  onClick={() => handleStatusUpdate(selectedSignal.id, 'actioned')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                >
                  <Check size={14} />
                  Mark Actioned
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedSignal.id, 'dismissed')}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#202022] text-[#8b8b93] border border-white/5 hover:bg-[#2a2a2d] hover:text-white transition-colors"
                >
                  <XCircle size={14} />
                  Dismiss
                </button>
                <button
                  onClick={() => onAccountClick?.(selectedSignal.account_id)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                >
                  <Building2 size={14} />
                  Full Account
                </button>
              </div>
            )}
          </>
        ) : (
          /* ──────── AI CHAT (existing) ──────── */
          <>
            <div className="p-6 border-b border-white/5 bg-[#1a1a1c] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Semantic Signal Search</h2>
                <p className="text-sm text-[#8b8b93]">Ask SMOKE AI to find specific opportunities.</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                      <Bot size={16} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-[#202022] border border-white/5 text-[#e2e2e5] rounded-bl-none'
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {/* Inline signal cards from AI search */}
              {chatSignals.length > 0 && !isTyping && (
                <div className="space-y-2 pl-12">
                  <p className="text-xs text-[#8b8b93] font-medium mb-2">{chatSignals.length} signal{chatSignals.length !== 1 ? 's' : ''} found:</p>
                  {chatSignals.slice(0, 10).map((sig) => {
                    const type = getSignalType(sig.source);
                    return (
                      <div
                        key={sig.id}
                        onClick={() => handleSignalClick(sig)}
                        className="bg-[#1a1a1c] border border-white/5 rounded-lg p-3 hover:border-indigo-500/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${
                              type === 'osha' ? 'bg-red-500/10 text-red-500' :
                              type === 'permit' ? 'bg-blue-500/10 text-blue-500' :
                              type === 'procore' ? 'bg-orange-500/10 text-orange-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {type === 'osha' ? <AlertCircle size={12} /> :
                               type === 'permit' ? <FileText size={12} /> :
                               type === 'procore' ? <Building2 size={12} /> :
                               <MessageSquare size={12} />}
                            </div>
                            <span className="text-xs font-semibold text-[#8b8b93] uppercase">{sig.source}</span>
                            {sig.account_name && <span className="text-xs text-indigo-400">{sig.account_name}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {sig.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                            {sig.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                            <span className="text-[10px] text-[#8b8b93]">{timeAgo(sig.detected_at)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-white font-medium">{sig.title}</p>
                        {sig.detail && <p className="text-xs text-[#8b8b93] mt-1 line-clamp-1">{sig.detail}</p>}
                        {(sig.location_city || sig.project_value) && (
                          <div className="flex items-center gap-3 mt-1.5">
                            {sig.location_city && <span className="text-[10px] text-[#8b8b93]">{sig.location_city}{sig.location_state ? `, ${sig.location_state}` : ''}</span>}
                            {sig.project_value && <span className="text-[10px] text-emerald-400">${(sig.project_value / 1_000_000).toFixed(1)}M</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isTyping && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-[#202022] border border-white/5 rounded-2xl p-4 rounded-bl-none flex flex-col gap-2">
                    <div className="flex gap-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 bg-[#8b8b93] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#8b8b93] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#8b8b93] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-xs text-[#8b8b93]">Searching signal database...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="p-6 bg-[#1a1a1c] border-t border-white/5">
              <form onSubmit={handleSendMessage} className="relative flex items-center">
                <div className="absolute left-4 text-[#8b8b93]">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="E.g., Find me new construction permits in Texas over $5M from last week..."
                  className="w-full bg-[#0a0a0b] text-white rounded-xl pl-12 pr-32 py-4 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
                <div className="absolute right-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="hover:bg-[#202022] text-[#8b8b93] p-2 rounded-lg transition-colors"
                    title="Use predefined prompts"
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="submit"
                    disabled={!query.trim() || isTyping}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <span>Send</span>
                    <Send size={14} />
                  </button>
                </div>
              </form>
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 hide-scrollbar">
                {["Show me recent OSHA fines", "Top Procore projects in NE", "HVAC permits >$1M"].map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setQuery(suggestion)}
                    className="whitespace-nowrap bg-[#202022] hover:bg-[#2a2a2d] text-[#8b8b93] hover:text-[#e2e2e5] text-xs font-medium px-3 py-1.5 rounded-full border border-white/5 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
