import React, { useState } from 'react';
import { Building2, Calendar, AlertCircle, X, Loader2, MapPin } from 'lucide-react';
import { useProjects } from './ProjectsContext';
import { projectsApi, accountsApi, type Account } from './api';

// Types

interface Column {
  id: string;
  title: string;
}

const COLUMNS: Column[] = [
  { id: 'new', title: 'New Signal' },
  { id: 'contact', title: 'Contacting' },
  { id: 'engineering', title: 'Engineering/Site Plan' },
  { id: 'proposal', title: 'Proposal Sent' },
  { id: 'won', title: 'Closed Won' },
  { id: 'lost', title: 'Closed Lost' },
];

interface ProjectsBoardProps {
  onProjectClick?: (id: string) => void;
}

export default function ProjectsBoard({ onProjectClick }: ProjectsBoardProps = {}) {
  const { projects, updateProjectStage, refresh } = useProjects();
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', account_search: '', account_id: '', account_name: '', estimated_value: '', stage: 'new', description: '' });
  const [createSaving, setCreateSaving] = useState(false);
  const [accountResults, setAccountResults] = useState<Account[]>([]);
  const [accountSearching, setAccountSearching] = useState(false);

  const handleAccountSearch = (query: string) => {
    setCreateForm(f => ({ ...f, account_search: query, account_id: '', account_name: '' }));
    if (query.length < 2) { setAccountResults([]); return; }
    setAccountSearching(true);
    accountsApi.list({ search: query, limit: 8 })
      .then(res => setAccountResults(res.data.items))
      .catch(() => setAccountResults([]))
      .finally(() => setAccountSearching(false));
  };

  const handleCreateProject = () => {
    if (!createForm.name.trim() || !createForm.account_id) return;
    setCreateSaving(true);
    projectsApi.create({
      account_id: createForm.account_id,
      name: createForm.name,
      description: createForm.description || undefined,
      stage: createForm.stage,
      origin: 'manual',
      estimated_value: Number(createForm.estimated_value) || 0,
    }).then(() => {
      refresh();
      setShowCreateModal(false);
      setCreateForm({ name: '', account_search: '', account_id: '', account_name: '', estimated_value: '', stage: 'new', description: '' });
    }).catch(() => {})
      .finally(() => setCreateSaving(false));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedProjectId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires some data to be set
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    
    if (draggedProjectId) {
      updateProjectStage(draggedProjectId, targetStage);
    }
    setDraggedProjectId(null);
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8">
      <div className="flex justify-between items-center mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects Pipeline</h1>
          <p className="text-sm text-[#8b8b93]">Drag and drop specific site deployments through the sales cycle.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
        >
          + New Project
        </button>
      </div>

      <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4 h-[calc(100vh-140px)] lg:h-[calc(100vh-180px)]">
        {COLUMNS.map(column => {
          const columnProjects = projects.filter(p => p.stage === column.id);
          const columnTotal = columnProjects.reduce((sum, p) => sum + p.value, 0);

          return (
            <div key={column.id} className="flex flex-col w-72 md:w-80 shrink-0">
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-sm font-medium text-[#e2e2e5]">{column.title}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#8b8b93]">${(columnTotal / 1000).toFixed(0)}k</span>
                  <span className="bg-[#202022] text-[#8b8b93] text-xs font-medium px-2 py-0.5 rounded-full border border-white/5">
                    {columnProjects.length}
                  </span>
                </div>
              </div>
              
              <div 
                className="flex-1 bg-[#1a1a1c]/50 border border-white/5 rounded-2xl p-2 transition-colors min-h-[200px]"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {columnProjects.map(project => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, project.id)}
                    onClick={() => onProjectClick?.(project.id)}
                    className={`bg-[#202022] p-4 rounded-xl mb-3 border border-white/5 hover:border-white/10 transition-all cursor-grab active:cursor-grabbing ${draggedProjectId === project.id ? 'opacity-50 border-indigo-500/50 shadow-xl shadow-indigo-500/10' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md ${
                        project.origin === 'signal' ? 'bg-purple-500/10 text-purple-400' :
                        project.origin === 'scraped' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {project.origin === 'signal' ? 'From Signal' : project.origin}
                      </span>
                      <span className="flex items-center text-xs font-semibold text-green-400">
                        ${(project.value / 1000).toFixed(0)}k
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-medium text-white mb-1">{project.name}</h4>
                    
                    <div className="flex items-center gap-1.5 text-xs text-[#8b8b93] mb-1">
                      <Building2 size={12} />
                      <span className="truncate">{project.accountName}</span>
                    </div>
                    {project.locationLabel && (
                      <div className="flex items-center gap-1.5 text-xs text-orange-400/70 mb-3">
                        <MapPin size={11} />
                        <span className="truncate">{project.locationLabel}</span>
                      </div>
                    )}
                    {!project.locationLabel && <div className="mb-3" />}
                    
                    <div className="flex justify-between items-center text-xs text-[#8b8b93] pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1">
                        <AlertCircle size={12} className={project.dueDate ? "text-orange-400" : ""} />
                      </div>
                      {project.dueDate && (
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>{project.dueDate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {columnProjects.length === 0 && (
                  <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl mx-1 pointer-events-none">
                    <span className="text-xs text-[#8b8b93]">Drop here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[#1a1a1c] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">New Project</h2>
              <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold block mb-1.5">Project Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Chicago Office Solar Install"
                  className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="relative">
                <label className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold block mb-1.5">Account *</label>
                {createForm.account_id ? (
                  <div className="flex items-center gap-2 bg-[#141416] border border-indigo-500/30 rounded-lg px-3 py-2">
                    <Building2 size={14} className="text-indigo-400" />
                    <span className="text-sm text-white flex-1">{createForm.account_name}</span>
                    <button onClick={() => setCreateForm(f => ({ ...f, account_id: '', account_name: '', account_search: '' }))} className="text-[#8b8b93] hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={createForm.account_search}
                      onChange={e => handleAccountSearch(e.target.value)}
                      placeholder="Search for an account..."
                      className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                    />
                    {accountSearching && <Loader2 size={14} className="animate-spin absolute right-3 top-9 text-[#8b8b93]" />}
                    {accountResults.length > 0 && !createForm.account_id && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                        {accountResults.map(a => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setCreateForm(f => ({ ...f, account_id: a.id, account_name: a.name, account_search: '' }));
                              setAccountResults([]);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors flex items-center gap-2"
                          >
                            <Building2 size={12} className="text-[#8b8b93]" />
                            {a.name}
                            {a.hq_city && <span className="text-[10px] text-[#8b8b93] ml-auto">{a.hq_city}{a.hq_state ? `, ${a.hq_state}` : ''}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold block mb-1.5">Stage</label>
                  <select
                    value={createForm.stage}
                    onChange={e => setCreateForm(f => ({ ...f, stage: e.target.value }))}
                    className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold block mb-1.5">Estimated Value ($)</label>
                  <input
                    type="number"
                    value={createForm.estimated_value}
                    onChange={e => setCreateForm(f => ({ ...f, estimated_value: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8b8b93] uppercase tracking-wider font-semibold block mb-1.5">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional project description..."
                  rows={2}
                  className="w-full bg-[#141416] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowCreateModal(false)} className="text-sm text-[#8b8b93] hover:text-white px-4 py-2 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleCreateProject}
                disabled={createSaving || !createForm.name.trim() || !createForm.account_id}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                {createSaving && <Loader2 size={14} className="animate-spin" />}
                {createSaving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
