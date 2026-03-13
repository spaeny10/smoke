import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { projectsApi, type Project as ApiProject } from './api';

export interface Project {
  id: string;
  name: string;
  accountName: string;
  value: number;
  origin: 'manual' | 'scraped';
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
    origin: p.origin as 'manual' | 'scraped',
    stage: p.stage,
  };
}

interface ProjectsContextType {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  addProject: (p: Project) => void;
  updateProjectStage: (id: string, stage: string) => void;
  loading: boolean;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi.list({ limit: 100 })
      .then(res => {
        setProjects(res.data.items.map(apiToLocal));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addProject = (project: Project) => {
    // Optimistic update
    setProjects(prev => [...prev, project]);
    // Sync to API
    projectsApi.create({
      account_id: '', // Will be set by caller if needed
      name: project.name,
      stage: project.stage,
      origin: project.origin,
      estimated_value: project.value,
    }).catch(() => {
      // Rollback on failure
      setProjects(prev => prev.filter(p => p.id !== project.id));
    });
  };

  const updateProjectStage = (id: string, stage: string) => {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, stage } : p));
    // Sync to API
    projectsApi.update(id, { stage }).catch(() => {
      // Rollback would go here in production
    });
  };

  return (
    <ProjectsContext.Provider value={{ projects, setProjects, addProject, updateProjectStage, loading }}>
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
