import React, { useState } from 'react';
import { Building2, Calendar, AlertCircle } from 'lucide-react';
import { useProjects } from './ProjectsContext';

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
  const { projects, updateProjectStage } = useProjects();
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

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
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects Pipeline</h1>
          <p className="text-sm text-[#8b8b93]">Drag and drop specific site deployments through the sales cycle.</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-lg shadow-indigo-500/20">
          + New Project
        </button>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-180px)]">
        {COLUMNS.map(column => {
          const columnProjects = projects.filter(p => p.stage === column.id);
          const columnTotal = columnProjects.reduce((sum, p) => sum + p.value, 0);

          return (
            <div key={column.id} className="flex flex-col w-80 shrink-0">
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
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md ${project.origin === 'scraped' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {project.origin}
                      </span>
                      <span className="flex items-center text-xs font-semibold text-green-400">
                        ${(project.value / 1000).toFixed(0)}k
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-medium text-white mb-1">{project.name}</h4>
                    
                    <div className="flex items-center gap-1.5 text-xs text-[#8b8b93] mb-3">
                      <Building2 size={12} />
                      <span className="truncate">{project.accountName}</span>
                    </div>
                    
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
    </div>
  );
}
