import { useState, useEffect } from 'react';
import { 
  Layers, 
  LayoutDashboard, 
  TrendingUp, 
  Building2, 
  Users, 
  DollarSign, 
  Settings, 
  BookOpen, 
  Search, 
  Bell, 
  Calendar, 
  ChevronDown, 
  Paperclip, 
  Send,
  Info,
  Loader2,
  PieChart as PieChartIcon,
  MessageSquare,
  Mail,
  Check
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AccountDetail from './AccountDetail';
import CompaniesList from './CompaniesList';
import AttributionDashboard from './AttributionDashboard';
import BlueprintsDashboard from './BlueprintsDashboard';
import ProjectsBoard from './ProjectsBoard';
import ProjectDetail from './ProjectDetail';
import SmokeAIDashboard from './SmokeAIDashboard';
import Inbox from './Inbox';
import ContactsList from './ContactsList';
import ContactDetail from './ContactDetail';
import { metricsApi, outreachApi, authApi, type UserProfile } from './api';

const chartData1 = [
  { name: '0', uv: 10 }, { name: '100', uv: 25 }, { name: '200', uv: 40 }, 
  { name: '300', uv: 55 }, { name: '400', uv: 80 }, { name: '500', uv: 124 }
];

const chartData2 = [
  { name: '0', uv: 5 }, { name: '100', uv: 15 }, { name: '200', uv: 10 }, 
  { name: '300', uv: 45 }, { name: '400', uv: 30 }, { name: '500', uv: 86 }
];

const chartData3 = [
  { name: '0', uv: 2 }, { name: '1M', uv: 10 }, { name: '3M', uv: 15 }, 
  { name: '5M', uv: 35 }, { name: '7M', uv: 25 }, { name: '9M', uv: 52 }
];

const chartData4 = [
  { name: '0', uv: 100 }, { name: '10', uv: 250 }, { name: '20', uv: 180 }, 
  { name: '30', uv: 420 }, { name: '40', uv: 350 }, { name: '50', uv: 610 }
];

const pieData = [
  { name: 'OSHA Inspections', value: 45.1, color: '#10b981' },
  { name: 'Procore API', value: 30.2, color: '#ec4899' },
  { name: 'Bldg Permits', value: 12.2, color: '#f59e0b' },
  { name: 'BuildingConnected', value: 8.4, color: '#ef4444' },
  { name: 'CraneWatch', value: 4.1, color: '#3b82f6' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('smoke_activeTab') || 'dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => localStorage.getItem('smoke_selectedProjectId'));
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'me' | 'team'>('me');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string, draft?: string, account?: string}[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [metrics, setMetrics] = useState({
    activeAccounts: 124,
    newSignals: 86,
    highPriorityContacts: 52,
    outreachSent: 610
  });

  useEffect(() => {
    metricsApi.get()
      .then(res => {
        if (res.data.activeAccounts !== undefined) {
          setMetrics(res.data);
        }
      })
      .catch(err => console.error("Error fetching metrics:", err));
    // Fetch user profile if token exists
    const token = localStorage.getItem('smoke_token');
    if (token) {
      authApi.me()
        .then(res => setUserProfile(res.data))
        .catch(() => setUserProfile(null));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('smoke_activeTab', activeTab);
    if (selectedProjectId) {
      localStorage.setItem('smoke_selectedProjectId', selectedProjectId);
    } else {
      localStorage.removeItem('smoke_selectedProjectId');
    }
  }, [activeTab, selectedProjectId]);

  return (
    <div className="flex h-screen bg-[#141416] text-[#e2e2e5] font-sans overflow-hidden">
      {/* Expanded Sidebar */}
      <aside className="w-[260px] border-r border-[#202022] flex flex-col py-6 px-4 bg-[#0a0a0b] z-10 shrink-0">
        
        {/* Logo and App Name */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg tracking-tighter shadow-lg shadow-indigo-500/20">
              S
            </div>
            <span className="font-semibold text-white tracking-wide">Smoke</span>
          </div>
          <div className="w-6 h-6 rounded bg-[#202022] flex items-center justify-center cursor-pointer hover:bg-[#2a2a2d] border border-white/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8b93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 15 12 19 16 15"></polyline><polyline points="16 9 12 5 8 9"></polyline></svg>
          </div>
        </div>
        
        {/* Navigation Section 1 */}
        <div className="flex flex-col space-y-1 w-full mb-6">
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'dashboard' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} />
            <span className="text-sm font-medium">Dashboard</span>
          </div>

          <div 
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors relative ${activeTab === 'odin' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('odin')}
          >
            {activeTab === 'odin' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#3b82f6] rounded-r-md"></div>
            )}
            <div className={`flex items-center gap-3 ${activeTab === 'odin' ? 'pl-1' : ''}`}>
              <Layers size={18} className={activeTab === 'odin' ? 'text-[#3b82f6]' : ''} />
              <span className="text-sm font-medium">SMOKE AI</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
          
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'journeys' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('journeys')}
          >
            <TrendingUp size={18} />
            <span className="text-sm font-medium">Journeys</span>
          </div>
          
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'companies' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('companies')}
          >
            <Building2 size={18} />
            <span className="text-sm font-medium">Companies</span>
          </div>

          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'contacts' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('contacts')}
          >
            <Users size={18} />
            <span className="text-sm font-medium">Contacts</span>
          </div>
          
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'inbox' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('inbox')}
          >
            <Mail size={18} />
            <span className="text-sm font-medium">Inbox</span>
          </div>
          
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'attribution' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('attribution')}
          >
            <PieChartIcon size={18} />
            <span className="text-sm font-medium">Attribution</span>
          </div>

          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'blueprints' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('blueprints')}
          >
            <Layers size={18} />
            <span className="text-sm font-medium">Blueprints</span>
          </div>
          
          <div 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeTab === 'deals' ? 'bg-[#202022] text-white' : 'text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white'}`}
            onClick={() => setActiveTab('deals')}
          >
            <DollarSign size={18} />
            <span className="text-sm font-medium">Projects</span>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col w-full mt-auto space-y-1 mb-6 border-b border-white/5 pb-6">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white transition-colors">
            <Settings size={18} />
            <span className="text-sm font-medium">Settings</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[#8b8b93] hover:bg-[#1a1a1c] hover:text-white transition-colors">
            <BookOpen size={18} />
            <span className="text-sm font-medium">Guides</span>
          </div>
        </div>
        
        {/* User Profile Footer */}
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#1a1a1c] cursor-pointer transition-colors w-full group">
          <img src="https://i.pravatar.cc/150?u=a042581f4e30026704d" alt="User" className="w-10 h-10 rounded-full border border-white/10 group-hover:border-indigo-500/50 transition-colors" />
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white truncate">{userProfile?.name || 'Sales Rep'}</span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                userProfile?.role === 'director' ? 'bg-purple-500/15 text-purple-400' :
                userProfile?.role === 'manager' ? 'bg-blue-500/15 text-blue-400' :
                'bg-green-500/15 text-green-400'
              }`}>{userProfile?.role || 'rep'}</span>
            </div>
            <span className="text-xs text-[#8b8b93] truncate block">{userProfile?.email || 'rep@smoke.io'}</span>
          </div>
        </div>
      </aside>

      {activeTab === 'companyDetail' && selectedAccountId ? (
        <AccountDetail accountId={selectedAccountId} onNavigate={(tab) => setActiveTab(tab as any)} />
      ) : activeTab === 'companies' ? (
        <CompaniesList onCompanyClick={(id) => { setSelectedAccountId(id); setActiveTab('companyDetail'); }} userProfile={userProfile} />
      ) : activeTab === 'contacts' ? (
        <ContactsList
          onContactClick={(id) => {
            setSelectedContactId(id);
            setActiveTab('contactDetail');
          }}
          onCompanyClick={(id) => { setSelectedAccountId(id); setActiveTab('companyDetail'); }}
        />
      ) : activeTab === 'contactDetail' && selectedContactId ? (
        <ContactDetail contactId={selectedContactId} onNavigate={(tab) => setActiveTab(tab as any)} />
      ) : activeTab === 'attribution' ? (
        <AttributionDashboard />
      ) : activeTab === 'blueprints' ? (
        <BlueprintsDashboard />
      ) : activeTab === 'deals' ? (
        <ProjectsBoard onProjectClick={(id) => {
          setSelectedProjectId(id);
          setActiveTab('projectDetail');
        }} />
      ) : activeTab === 'projectDetail' && selectedProjectId ? (
        <ProjectDetail projectId={selectedProjectId} onNavigate={(tab) => setActiveTab(tab as any)} />
      ) : activeTab === 'odin' ? (
        <SmokeAIDashboard />
      ) : activeTab === 'inbox' ? (
        <Inbox />
      ) : (
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 relative">
        {/* Top Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
               <img src="https://i.pravatar.cc/150?u=a042581f4e30026704d" alt="Profile" className="w-12 h-12 rounded-full ring-2 ring-[#202022] group-hover:ring-indigo-500 transition-all" />
               <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#202022] rounded-full flex items-center justify-center border-2 border-[#141416]">
                  <Settings size={10} className="text-[#8b8b93]" />
               </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">{userProfile?.name || 'Sales Rep'}</h1>
              <p className="text-sm text-[#8b8b93]">Welcome back to Smoke 👋</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            
            {/* View Toggle */}
            <div className="flex bg-[#202022] p-1 rounded-xl border border-white/5 mr-2">
              <button 
                onClick={() => setViewMode('me')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'me' ? 'bg-[#3b82f6] text-white shadow-md' : 'text-[#8b8b93] hover:text-[#e2e2e5]'}`}
              >
                My View
              </button>
              <button 
                onClick={() => setViewMode('team')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'team' ? 'bg-[#10b981] text-white shadow-md' : 'text-[#8b8b93] hover:text-[#e2e2e5]'}`}
              >
                <Users size={14} /> Team View
              </button>
            </div>
            <button className="w-10 h-10 rounded-xl bg-[#202022] hover:bg-[#2a2a2d] transition-colors flex items-center justify-center text-[#8b8b93] border border-white/5">
              <Search size={18} />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`w-10 h-10 rounded-xl transition-colors flex items-center justify-center border relative ${showNotifications ? 'bg-[#2a2a2d] border-indigo-500/50 text-white' : 'bg-[#202022] hover:bg-[#2a2a2d] text-[#8b8b93] border-white/5'}`}
              >
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-[#1a1a1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#202022]/50">
                    <h3 className="text-white font-semibold">Inbox</h3>
                    <button className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                      <Check size={12} /> Mark all read
                    </button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {/* Notification Item 1 */}
                    <div className="p-4 border-b border-white/5 hover:bg-[#202022] transition-colors cursor-pointer group">
                      <div className="flex gap-3">
                        <div className="mt-1 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                          <MessageSquare size={14} />
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium mb-1">
                            Jessica Smith <span className="text-[#8b8b93] font-normal">replied via SMS</span>
                          </p>
                          <p className="text-xs text-[#8b8b93] line-clamp-2 mb-2">
                            "Hey Evan, yes the site plan looks good. We can start moving dirt on Tuesday next week. Let me know if you need any permits on file."
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Chicago West Loop</span>
                            <span className="text-[10px] text-[#8b8b93]">2m ago</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Notification Item 2 */}
                    <div className="p-4 border-b border-white/5 hover:bg-[#202022] transition-colors cursor-pointer group">
                      <div className="flex gap-3">
                        <div className="mt-1 w-8 h-8 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                          <Mail size={14} />
                        </div>
                        <div>
                          <p className="text-sm text-[#e2e2e5] font-medium mb-1">
                            Marcus Chen <span className="text-[#8b8b93] font-normal">sent an email</span>
                          </p>
                          <p className="text-xs text-[#8b8b93] line-clamp-2 mb-2">
                            "Thanks for the demo earlier. Could you send over the pricing tiers for the enterprise package again? We are reviewing budgets."
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Abbott Laboratories</span>
                            <span className="text-[10px] text-[#8b8b93]">1h ago</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[#202022]/50 text-center border-t border-white/5">
                    <button 
                      onClick={() => {
                        setActiveTab('inbox');
                        setShowNotifications(false);
                      }}
                      className="text-xs font-medium text-[#8b8b93] hover:text-white transition-colors"
                    >
                      View full inbox
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#202022] border border-white/5 text-sm cursor-pointer hover:bg-[#2a2a2d] transition-colors">
              <Calendar size={16} className="text-[#8b8b93]" />
              <span>This month</span>
              <ChevronDown size={14} className="text-[#8b8b93] ml-2" />
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-12 gap-6 pb-20">
          
            {/* AI Assistant Card (Left Span 5) */}
          <div className="col-span-5 bg-[#1a1a1c] rounded-[24px] p-8 border border-white/5 flex flex-col relative overflow-hidden group">
            {/* Subtle glow effect behind card */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -z-10 group-hover:bg-indigo-500/20 transition-all duration-700"></div>
            
            {chatMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center mb-10 mt-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a1c] to-[#2a2a2d] border border-white/10 flex items-center justify-center mb-6 shadow-xl shadow-black/40 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl blur-md -z-10"></div>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-400 via-pink-500 to-indigo-500 transform rotate-45 opacity-80"></div>
                </div>
                
                <p className="text-[#8b8b93] mb-2 text-sm text-center">Hello, I am SMOKE AI, your Sales Intelligence Agent</p>
                <h2 className="text-3xl font-semibold text-white mb-8 text-center tracking-tight">How can I help you today?</h2>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div 
                    onClick={async () => {
                      setChatMessages([{role: 'user', content: "Who should I call today?"}]);
                      setIsAiLoading(true);
                      try {
                        const res = await outreachApi.demo();
                        const data = res.data;
                        setChatMessages(prev => [...prev, {
                          role: 'assistant',
                          content: `Based on recent permit activity and Procore signals, I recommend reaching out to ${data.contact_name} at **${data.account_name}**. They have ${data.signals_used} high-value signals indicating an upcoming project need. I've drafted an email for you:`,
                          draft: data.message_text
                        }]);
                      } catch (e) {
                         setChatMessages(prev => [...prev, {role: 'assistant', content: "Sorry, I couldn't connect to the API."}]);
                      } finally {
                        setIsAiLoading(false);
                      }
                    }}
                    className="bg-[#202022] hover:bg-[#2a2a2d] transition-all p-4 rounded-xl border border-white/5 cursor-pointer hover:border-white/10 group/card"
                  >
                    <BookOpen size={16} className="text-[#8b8b93] mb-3 group-hover/card:text-indigo-400 transition-colors" />
                    <p className="text-sm text-[#e2e2e5] leading-relaxed">Who should I call today?</p>
                  </div>
                  <div className="bg-[#202022] hover:bg-[#2a2a2d] transition-all p-4 rounded-xl border border-white/5 cursor-pointer hover:border-white/10 group/card">
                    <Building2 size={16} className="text-[#8b8b93] mb-3 group-hover/card:text-indigo-400 transition-colors" />
                    <p className="text-sm text-[#e2e2e5] leading-relaxed">Show me recent permits in Tulsa</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col mb-6 overflow-y-auto pr-2 space-y-6">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-[#202022] text-[#e2e2e5] border border-white/5'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.draft && (
                      <div className="mt-3 max-w-[90%] bg-[#1a1a1c] border border-white/10 rounded-xl p-4 ml-4">
                         <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                            <span className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold">Draft Email</span>
                            <div className="flex gap-2">
                               <button className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30 transition-colors">Edit</button>
                               <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-500 transition-colors flex items-center gap-1"><Send size={10} /> Send via SendGrid</button>
                            </div>
                         </div>
                         <p className="text-sm text-[#e2e2e5] whitespace-pre-wrap font-mono leading-relaxed">{msg.draft}</p>
                      </div>
                    )}
                  </div>
                ))}
                
                {isAiLoading && (
                  <div className="flex items-center gap-2 text-[#8b8b93]">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">SMOKE AI is analyzing signals and drafting outreach...</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="relative mt-auto">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Paperclip size={18} className="text-[#8b8b93]" />
              </div>
              <input 
                type="text" 
                placeholder="Ask anything about your accounts or signals..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                     setChatMessages(prev => [...prev, {role: 'user', content: query}]);
                     setQuery('');
                     // Just a mock response for other queries
                     setTimeout(() => {
                        setChatMessages(prev => [...prev, {role: 'assistant', content: "I'm still learning! Right now, try asking me 'Who should I call today?'"}]);
                     }, 1000);
                  }
                }}
                className="w-full bg-[#141416] border border-white/10 rounded-xl py-3.5 pl-12 pr-14 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-white placeholder-[#8b8b93] transition-all"
              />
              <button 
                onClick={() => {
                  if (query.trim()) {
                     setChatMessages(prev => [...prev, {role: 'user', content: query}]);
                     setQuery('');
                     setTimeout(() => {
                        setChatMessages(prev => [...prev, {role: 'assistant', content: "I'm still learning! Right now, try asking me 'Who should I call today?'"}]);
                     }, 1000);
                  }
                }}
                className="absolute inset-y-2 right-2 w-10 h-10 bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-lg flex items-center justify-center text-white"
              >
                <Send size={16} className="ml-0.5" />
              </button>
            </div>
          </div>

          {/* Metrics Grid (Right Span 7) */}
          <div className="col-span-7 grid grid-cols-2 gap-6">
            
            {/* Metric 1 */}
            <div className="metric-card group">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <h3 className="text-[#e2e2e5] font-medium">Active Accounts</h3>
              </div>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <span className="text-3xl font-bold text-white">{metrics.activeAccounts}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium border border-[#10b981]/20 flex items-center">
                  +12.4%
                </span>
                <Info size={14} className="text-[#8b8b93]" />
              </div>
              <div className="h-24 w-full -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData1}>
                    <defs>
                      <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="uv" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorBlue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[10px] text-[#8b8b93] mt-2 px-1">
                <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="metric-card group">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <h3 className="text-[#e2e2e5] font-medium">New Signals Detected</h3>
              </div>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <span className="text-3xl font-bold text-white">{metrics.newSignals}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium border border-[#10b981]/20 flex items-center">
                  +34.2%
                </span>
                <Info size={14} className="text-[#8b8b93]" />
              </div>
              <div className="h-24 w-full -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData2}>
                    <defs>
                      <linearGradient id="colorPink" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="uv" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#colorPink)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[10px] text-[#8b8b93] mt-2 px-1 border-t border-white/5 pt-2">
                <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="metric-card group">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <h3 className="text-[#e2e2e5] font-medium">High Priority Contacts</h3>
              </div>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <span className="text-3xl font-bold text-white">{metrics.highPriorityContacts}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium border border-[#10b981]/20 flex items-center">
                  +18.3%
                </span>
                <Info size={14} className="text-[#8b8b93]" />
              </div>
              <div className="h-24 w-full -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData3}>
                    <defs>
                      <linearGradient id="colorOrange" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="uv" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorOrange)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[10px] text-[#8b8b93] mt-2 px-1 border-t border-white/5 pt-2">
                <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
              </div>
            </div>

            {/* Metric 4 */}
            <div className="metric-card group">
               <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <h3 className="text-[#e2e2e5] font-medium">Outreach Sent</h3>
              </div>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <span className="text-3xl font-bold text-white">{metrics.outreachSent}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium border border-[#10b981]/20 flex items-center">
                  +10.5%
                </span>
                <Info size={14} className="text-[#8b8b93]" />
              </div>
              <div className="h-24 w-full -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData4}>
                    <defs>
                      <linearGradient id="colorIndigo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="uv" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorIndigo)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
               <div className="flex justify-between text-[10px] text-[#8b8b93] mt-2 px-1 border-t border-white/5 pt-2">
                <span>0</span><span>200</span><span>400</span><span>600</span><span>800</span>
              </div>
            </div>

          </div>

          {/* Bottom Row */}
          
          {/* Daily Insight (Left Span 5) */}
          <div className="col-span-5 bg-[#1a1a1c] border border-white/5 rounded-[24px] p-6 text-sm">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center border border-white/10">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  Daily Insight <Info size={14} className="text-[#8b8b93]" />
                </h3>
              </div>
              <button className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-md hover:bg-gray-200 transition-colors">
                View Analysis
              </button>
            </div>
            
            <p className="text-[#8b8b93] mb-4 leading-relaxed">
              Targeted OSHA Violation follow-ups achieved the highest lead-to-meeting conversion rate at 8.5%, generating nearly 3x as many scheduled demos as standard outreach sequences.
            </p>
            
            <p className="text-[#8b8b93] leading-relaxed">
              <span className="font-semibold text-[#e2e2e5]">Key insights:</span> Reaching out to Safety Managers within 48 hours of an OSHA citation being posted on EnforceData yields the highest ROI. There is a clear opportunity to scale Sendgrid campaigns aggressively on the "Repeat Violator" segment.
            </p>
          </div>

          {/* Pipeline By Channel (Right Span 7) */}
          <div className="col-span-7 bg-[#1a1a1c] border border-white/5 rounded-[24px] p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-semibold text-white flex items-center gap-2">
                  Signals By Source <Info size={14} className="text-[#8b8b93]" />
                </h3>
                
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b93]" />
                  <input type="text" placeholder="Search..." className="bg-[#141416] border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-indigo-500 w-48 text-white" />
                </div>
            </div>

            <div className="flex-1 flex items-center pb-4">
              <div className="w-1/2 pr-4 space-y-3">
                {pieData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="text-[#e2e2e5]">{item.name}</span>
                    </div>
                    <span className="text-[#8b8b93]">{item.value}%</span>
                  </div>
                ))}
              </div>
              
              <div className="w-1/2 h-full flex items-center justify-center relative min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col pt-1 pointer-events-none">
                  <span className="text-2xl font-bold text-white tracking-tight">{metrics.newSignals}</span>
                  <span className="text-xs text-[#8b8b93]">Total Signals</span>
                </div>
              </div>
            </div>
            
          </div>

        </div>
      </main>
      )}
    </div>
  );
}
