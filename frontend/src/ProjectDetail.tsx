import React from 'react';
import { ChevronRight, Users, MapPin } from 'lucide-react';
import { useProjects } from './ProjectsContext';

interface ProjectDetailProps {
  projectId: string;
  onNavigate: (tab: string) => void;
}

export default function ProjectDetail({ projectId, onNavigate }: ProjectDetailProps) {
  const { projects } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'contacts'>('contacts');

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#8b8b93]">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content Area */}
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
            <p className="text-lg text-[#8b8b93] flex items-center gap-2">
              <MapPin size={18} /> {project.accountName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Stage</p>
              <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/20 font-medium">
                {project.stage.toUpperCase()}
              </div>
            </div>
            <div className="text-right ml-4">
              <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1 font-semibold">Est. Value</p>
              <p className="text-2xl font-bold text-green-400">${project.value.toLocaleString()}</p>
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
            Involved Contacts
          </div>
        </div>

        {activeTab === 'overview' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
             <h2 className="text-white font-semibold mb-4">Project Overview</h2>
             <p className="text-[#8b8b93] text-sm">General project details, plans, and requirements would live here.</p>
          </div>
        ) : activeTab === 'contacts' ? (
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users size={18} className="text-indigo-400" />
                Key Project Contacts
              </h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Primary Contact */}
              <div className="bg-[#202022] border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                      EL
                    </div>
                    <div>
                      <h3 className="text-white font-medium">Evan Larson</h3>
                      <p className="text-xs text-[#8b8b93]">Project Manager</p>
                    </div>
                  </div>
                  <span className="bg-indigo-500/10 text-indigo-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border border-indigo-500/20">
                    Primary PoC
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Email:</span> e.larson@t-construction.com</p>
                  <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Phone:</span> (555) 321-7654</p>
                </div>
                
                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                  <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                    AI Generate Outreach
                  </button>
                </div>
              </div>
              
              {/* Secondary Contact */}
              <div className="bg-[#202022] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-500/20 text-gray-400 flex items-center justify-center font-bold">
                      JS
                    </div>
                    <div>
                      <h3 className="text-white font-medium">Jessica Smith</h3>
                      <p className="text-xs text-[#8b8b93]">Site Superintendent</p>
                    </div>
                  </div>
                  <span className="bg-orange-500/10 text-orange-400 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md">
                    Site Auth
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Email:</span> j.smith@t-construction.com</p>
                  <p className="text-sm text-[#8b8b93] flex items-center gap-2"><span className="w-16">Phone:</span> (555) 234-5678</p>
                </div>
                
                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                  <button className="flex-1 bg-white/[0.03] hover:bg-white/[0.08] text-white text-xs font-medium py-2 rounded-lg transition-colors border border-white/5">
                    Draft Email
                  </button>
                  <button className="flex-1 bg-white/[0.03] hover:bg-white/[0.08] text-white text-xs font-medium py-2 rounded-lg transition-colors border border-white/5">
                    Send SMS
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
