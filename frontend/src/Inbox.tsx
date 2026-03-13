import { useState } from 'react';
import { Search, Filter, Inbox as InboxIcon, Send, Archive, MessageSquare, Mail, AlertCircle, Phone } from 'lucide-react';

const MOCK_MESSAGES = [
  {
    id: 1,
    contact: 'Jessica Smith',
    role: 'Site Superintendent',
    company: 'T-Construction',
    project: 'Chicago West Loop',
    type: 'sms',
    preview: "Hey Evan, yes the site plan looks good. We can start moving dirt on Tuesday next week. Let me know if you need any permits on file.",
    time: '2m ago',
    unread: true,
    history: [
      { sender: 'me', text: "Hi Jessica, reaching out to confirm if the site plan for West Loop is approved so we can schedule the dump trucks?", time: '10:00 AM' },
      { sender: 'them', text: "Hey Evan, yes the site plan looks good. We can start moving dirt on Tuesday next week. Let me know if you need any permits on file.", time: '10:15 AM' }
    ]
  },
  {
    id: 2,
    contact: 'Marcus Chen',
    role: 'Chief Technology Officer',
    company: 'Abbott Laboratories',
    project: 'Enterprise Rollout',
    type: 'email',
    preview: "Thanks for the demo earlier. Could you send over the pricing tiers for the enterprise package again?",
    time: '1h ago',
    unread: true,
    history: [
      { sender: 'me', text: "Hi Marcus, great speaking with you today. Attached is the presentation outline. Let me know if you need anything else.", time: 'Yesterday, 4:30 PM' },
      { sender: 'them', text: "Thanks for the demo earlier. Could you send over the pricing tiers for the enterprise package again? We are reviewing budgets.", time: 'Today, 9:00 AM' }
    ]
  },
  {
    id: 3,
    contact: 'Sophia Ramirez',
    role: 'Chief Revenue Officer',
    company: 'Abbott Laboratories',
    project: 'General',
    type: 'sms',
    preview: "Give me a call when you have a minute to discuss the integration timeline.",
    time: 'Yesterday',
    unread: false,
    history: [
      { sender: 'them', text: "Give me a call when you have a minute to discuss the integration timeline.", time: 'Yesterday, 2:15 PM' }
    ]
  }
];

export default function Inbox() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'archived'>('inbox');
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(1);
  const [replyText, setReplyText] = useState('');

  const selectedMsg = MOCK_MESSAGES.find(m => m.id === selectedMsgId);

  return (
    <div className="flex-1 flex overflow-hidden bg-[#141416] text-[#e2e2e5]">
      
      {/* List Pane */}
      <div className="w-[400px] border-r border-[#202022] flex flex-col bg-[#1a1a1c] shrink-0">
        <div className="p-6 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-white">Communications</h1>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-[#202022] rounded-lg text-[#8b8b93] transition-colors">
                <Filter size={18} />
              </button>
            </div>
          </div>

          <div className="relative mb-6">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b93]" />
            <input 
              type="text" 
              placeholder="Search messages..." 
              className="w-full bg-[#141416] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-[#8b8b93] transition-colors"
            />
          </div>

          <div className="flex gap-2 bg-[#141416] p-1 rounded-lg border border-white/5">
            <button 
              onClick={() => setActiveTab('inbox')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${activeTab === 'inbox' ? 'bg-[#2a2a2d] text-white shadow-sm' : 'text-[#8b8b93] hover:text-[#e2e2e5]'}`}
            >
              <InboxIcon size={14} /> Inbox
              <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">2</span>
            </button>
            <button 
              onClick={() => setActiveTab('sent')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${activeTab === 'sent' ? 'bg-[#2a2a2d] text-white shadow-sm' : 'text-[#8b8b93] hover:text-[#e2e2e5]'}`}
            >
              <Send size={14} /> Sent
            </button>
            <button 
              onClick={() => setActiveTab('archived')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${activeTab === 'archived' ? 'bg-[#2a2a2d] text-white shadow-sm' : 'text-[#8b8b93] hover:text-[#e2e2e5]'}`}
            >
              <Archive size={14} /> Archived
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {MOCK_MESSAGES.map((msg) => (
            <div 
              key={msg.id}
              onClick={() => setSelectedMsgId(msg.id)}
              className={`p-4 border-b border-white/5 cursor-pointer transition-colors relative ${selectedMsgId === msg.id ? 'bg-[#202022] border-l-2 border-l-indigo-500' : 'hover:bg-[#202022]/50 border-l-2 border-l-transparent'}`}
            >
              {msg.unread && selectedMsgId !== msg.id && (
                <div className="absolute top-4 left-2 w-2 h-2 rounded-full bg-indigo-500"></div>
              )}
              <div className="pl-3">
                <div className="flex justify-between items-start mb-1">
                  <h3 className={`font-medium ${msg.unread && selectedMsgId !== msg.id ? 'text-white' : 'text-[#e2e2e5]'}`}>{msg.contact}</h3>
                  <span className="text-xs text-[#8b8b93]">{msg.time}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-400">{msg.company}</span>
                  <span className="text-[#8b8b93] text-[10px]">•</span>
                  <span className="text-[10px] text-[#8b8b93] flex items-center gap-1">
                    {msg.type === 'sms' ? <MessageSquare size={10} /> : <Mail size={10} />}
                    {msg.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-[#8b8b93] line-clamp-2 leading-relaxed">
                  {msg.preview}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail/Conversation Pane */}
      <div className="flex-1 flex flex-col bg-[#141416]">
        {selectedMsg ? (
          <>
            {/* Thread Header */}
            <div className="h-20 shrink-0 border-b border-[#202022] bg-[#1a1a1c] px-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20">
                  {selectedMsg.contact.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{selectedMsg.contact}</h2>
                  <p className="text-sm text-[#8b8b93]">{selectedMsg.role} at {selectedMsg.company}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#202022] hover:bg-[#2a2a2d] border border-white/5 rounded-lg text-sm text-[#e2e2e5] transition-colors">
                  <Phone size={14} className="text-[#8b8b93]" /> Call
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#202022] hover:bg-[#2a2a2d] border border-white/5 rounded-lg text-sm text-[#e2e2e5] transition-colors">
                  <AlertCircle size={14} className="text-[#8b8b93]" /> Update Pipeline
                </button>
              </div>
            </div>

            {/* Verification Banner */}
            <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-8 py-2.5 flex items-center justify-between">
               <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  Linked to Project: {selectedMsg.project}
               </div>
               <button className="text-xs text-indigo-400 hover:text-indigo-300 underline">View Deals</button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
              {selectedMsg.history.map((h, i) => (
                <div key={i} className={`flex flex-col max-w-[80%] ${h.sender === 'me' ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-xs text-[#8b8b93] mb-1 px-1">{h.time}</span>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    h.sender === 'me' 
                      ? 'bg-indigo-600 text-white rounded-tr-sm' 
                      : 'bg-[#202022] text-[#e2e2e5] border border-white/5 rounded-tl-sm'
                  }`}>
                    {h.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input Area */}
            <div className="p-6 bg-[#1a1a1c] border-t border-[#202022]">
              <div className="bg-[#141416] border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500/50 transition-colors shadow-inner">
                <textarea 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${selectedMsg.contact} via ${selectedMsg.type.toUpperCase()}...`}
                  className="w-full bg-transparent p-4 text-sm text-white placeholder-[#8b8b93] resize-none focus:outline-none min-h-[100px]"
                />
                <div className="flex items-center justify-between bg-[#202022]/50 px-4 py-3 border-t border-white/5">
                  <div className="flex gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-md bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-medium transition-colors border border-indigo-500/20">
                      Draft with SMOKE AI
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-md text-[#8b8b93] hover:text-[#e2e2e5] hover:bg-[#2a2a2d] transition-colors">
                      Attach File
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                        if (replyText.trim()) {
                            setReplyText('');
                        }
                    }}
                    disabled={!replyText.trim()}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                        replyText.trim() 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                        : 'bg-[#2a2a2d] text-[#8b8b93] cursor-not-allowed border border-white/5'
                    }`}
                  >
                    <Send size={14} className={replyText.trim() ? "translate-x-0.5 transition-transform" : ""} /> Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#8b8b93]">
            <InboxIcon size={48} className="mb-4 opacity-20" />
            <p>Select a message to view the conversation</p>
          </div>
        )}
      </div>

    </div>
  );
}
