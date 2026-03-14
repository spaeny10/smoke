import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { projectsApi, type Project as ApiProject } from './api';

export interface Project {
  id: string;
  name: string;
  accountName: string;
  value: number;
  origin: string;
  dueDate?: string;
  stage: string;
  signalId?: string;
}

function apiToLocal(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    accountName: p.account_name || 'Unknown',
    value: p.estimated_value,
    origin: p.origin,
    stage: p.stage,
    signalId: p.signal_id || undefined,
  };
}

interface ProjectsContextType {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  addProject: (p: Project) => void;
  updateProjectStage: (id: string, stage: string) => void;
  refresh: () => void;
  loading: boolean;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    projectsApi.list({ limit: 100 })
      .then(res => {
        setProjects(res.data.items.map(apiToLocal));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const addProject = (project: Project) => {
    // Optimistic update
    setProjects(prev => [...prev, project]);
  };

  const updateProjectStage = (id: string, stage: string) => {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, stage } : p));
    // Sync to API
    projectsApi.update(id, { stage }).catch(() => {
      // Rollback: re-fetch on failure
      fetchProjects();
    });
  };

  return (
    <ProjectsContext.Provider value={{ projects, setProjects, addProject, updateProjectStage, refresh: fetchProjects, loading }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
}
