import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, Send, Sparkles, Building2, AlertCircle, FileText, Bot, Loader2, Check, XCircle } from 'lucide-react';
import { signalsApi, type Signal } from './api';

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

export default function SmokeAIDashboard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<TierFilterValue>('tier12');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('new');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    {
      role: 'assistant',
      content: 'Hello! I am SMOKE AI. I continuously scan millions of data points across OSHA, building permits, news, and project boards. How can I help you find targets today?'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const fetchSignals = () => {
    setSignalsLoading(true);
    const params: Record<string, string | number> = { limit: 30 };
    if (statusFilter === 'new') params.status = 'new';
    if (tierFilter === 'tier1') params.tier = 1;
    // tier12 = tier 1 + 2, which we do client-side since API takes a single tier value
    // For tier12 we fetch without tier filter and filter client-side
    if (tierFilter === 'tier12') {
      // We'll fetch all and filter client-side, or just skip tier param
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
      })
      .catch(() => {});
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setQuery('');
    setIsTyping(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I found 3 relevant signals matching your criteria. I've highlighted them for you. It looks like Turner Construction is active right now—I recommend reaching out to their regional VP.`
      }]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Pane - Incoming Signals Feed */}
      <div className="w-1/2 border-r border-white/5 flex flex-col bg-[#141416]">
        <div className="p-6 border-b border-white/5 bg-[#1a1a1c]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Incoming Signals</h2>
              <p className="text-sm text-[#8b8b93]">Real-time feed of detected market events.</p>
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
          ) : (
            signals.map((signal) => {
              const type = getSignalType(signal.source);
              return (
                <div key={signal.id} className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors group relative">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
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
                      <div>
                        <span className="text-xs font-semibold text-[#8b8b93] tracking-wider uppercase">{signal.source}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8b8b93]">{timeAgo(signal.detected_at)}</span>
                      {/* Heat badge */}
                      {signal.heat === 'hot' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">HOT</span>}
                      {signal.heat === 'warm' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">WARM</span>}
                    </div>
                  </div>
                  <h3 className="text-white font-medium mb-2 group-hover:text-indigo-400 transition-colors">{signal.title}</h3>
                  <p className="text-sm text-[#8b8b93] line-clamp-2 mb-3">{signal.detail || `${signal.source} signal — ${signal.signal_type}`}</p>

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

      {/* Right Pane - SMOKE AI Semantic Search */}
      <div className="w-1/2 flex flex-col bg-[#141416] relative">
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
      </div>
    </div>
  );
}
