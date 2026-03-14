import { useState, useEffect } from 'react';
import { ChevronRight, Users, Loader2, Mail, Copy, Building2 } from 'lucide-react';
import { projectsApi, accountsApi, outreachApi, type Project, type Contact } from './api';

interface ProjectDetailProps {
  projectId: string;
  onNavigate: (tab: string) => void;
  onAccountClick?: (accountId: string) => void;
}

export default function ProjectDetail({ projectId, onNavigate, onAccountClick }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts'>('overview');
  const [outreachContactId, setOutreachContactId] = useState<string | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    projectsApi.get(projectId)
      .then(res => {
        setProject(res.data);
        // Fetch contacts for the project's account
        if (res.data.account_id) {
          accountsApi.getContacts(res.data.account_id)
            .then(cRes => setContacts(cRes.data))
            .catch(() => {});
        }
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleGenerateOutreach = (contactId: string) => {
    if (!project) return;
    setOutreachContactId(contactId);
    setOutreachLoading(true);
    setOutreachResult(null);
    outreachApi.generate(project.account_id, contactId)
      .then(res => {
        setOutreachResult((res.data as any).message_text || (res.data as any).message || 'Outreach generated.');
      })
      .catch(() => setOutreachResult('Failed to generate outreach.'))
      .finally(() => setOutreachLoading(false));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#141416] text-[#8b8b93]">
        <p className="text-lg mb-4">Project not found</p>
        <button onClick={() => onNavigate('deals')} className="text-indigo-400 hover:underline">Back to Pipeline</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[#8b8b93] mb-6">
          <span className="hover:text-white cursor-pointer transition-colors" onClick={() => onNavigate('deals')}>Projects Pipeline</span>
          <ChevronRight size={14} />
          <span className="text-white">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{project.name}</h1>
            <p
              className="text-lg text-[#8b8b93] flex items-center gap-2 hover:text-indigo-400 cursor-pointer transition-colors"
              onClick={() => onAccountClick?.(project.account_id)}
            >
              <Building2 size={18} /> {project.account_name || 'Unknown Account'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Origin badge */}
            <div className="text-right">
              <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Origin</p>
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md ${
                project.origin === 'signal' ? 'bg-purple-500/10 text-purple-400' :
                project.origin === 'scraped' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
              }`}>
                {project.origin === 'signal' ? 'From Signal' : project.origin}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Stage</p>
              <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/20 font-medium text-sm">
                {project.stage.charAt(0).toUpperCase() + project.stage.slice(1)}
              </div>
            </div>
            <div className="text-right ml-4">
              <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Est. Value</p>
              <p className="text-2xl font-bold text-green-400">${project.estimated_value.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-white/10 mb-8">
          <div
            onClick={() => setActiveTab('overview')}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'overview' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            Overview
          </div>
          <div
            onClick={() => setActiveTab('contacts')}
            className={`pb-3 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'contacts' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-[#8b8b93] hover:text-white'}`}
          >
            Contacts ({contacts.length})
          </div>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-6">
            <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Project Details</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Description</p>
                  <p className="text-sm text-[#e2e2e5] leading-relaxed">{project.description || 'No description provided.'}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Created</p>
                    <p className="text-sm text-[#e2e2e5]">{new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Last Updated</p>
                    <p className="text-sm text-[#e2e2e5]">{new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick contacts summary */}
            {contacts.length > 0 && (
              <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Users size={18} className="text-indigo-400" />
                  Key Contacts
                </h2>
                <div className="space-y-2">
                  {contacts.slice(0, 4).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                          {c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{c.name}</p>
                          <p className="text-[10px] text-[#8b8b93]">{c.title || 'No title'}</p>
                        </div>
                      </div>
                      <span className="text-xs text-[#8b8b93]">{c.email || ''}</span>
                    </div>
                  ))}
                </div>
                {contacts.length > 4 && (
                  <button onClick={() => setActiveTab('contacts')} className="text-xs text-indigo-400 hover:text-indigo-300 mt-3 font-medium transition-colors">
                    View all {contacts.length} contacts
                  </button>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'contacts' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users size={18} className="text-indigo-400" />
                Account Contacts
              </h2>
            </div>

            {contacts.length === 0 ? (
              <div className="text-center py-12 text-[#8b8b93]">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No contacts found for this account.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {contacts.map((c, idx) => {
                  const initials = c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                  const isPrimary = idx === 0;
                  return (
                    <div key={c.id} className={`bg-[#202022] border rounded-xl p-5 relative overflow-hidden ${isPrimary ? 'border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'border-white/5 hover:border-white/10'} transition-colors`}>
                      {isPrimary && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>}

                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isPrimary ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {initials}
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{c.name}</h3>
                            <p className="text-xs text-[#8b8b93]">{c.title || 'No title'}</p>
                          </div>
                        </div>
                        {c.role_category && (
                          <span className="bg-green-500/10 text-green-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">
                            {c.role_category}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 mb-4">
                        <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Email:</span> {c.email || '-'}</p>
                        <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Phone:</span> {c.phone || '-'}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                        <button
                          onClick={() => handleGenerateOutreach(c.id)}
                          disabled={outreachLoading && outreachContactId === c.id}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-1.5"
                        >
                          {outreachLoading && outreachContactId === c.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Mail size={12} />
                          )}
                          {outreachLoading && outreachContactId === c.id ? 'Generating...' : 'Generate Outreach'}
                        </button>
                      </div>

                      {/* Outreach result */}
                      {outreachContactId === c.id && outreachResult && (
                        <div className="mt-3 bg-[#141416] border border-white/10 rounded-lg p-3">
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
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
