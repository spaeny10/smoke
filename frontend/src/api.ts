import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smoke_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('smoke_token');
    }
    return Promise.reject(error);
  }
);

// ── Types ───────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface Account {
  id: string;
  name: string;
  name_normalized: string;
  hq_address: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_zip: string | null;
  region: string | null;
  employee_count: number | null;
  segment: string | null;
  composite_score: number;
  score_trend: string;
  deal_stage: string;
  assigned_rep_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  name: string;
  title: string | null;
  role_category: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source: string | null;
  email_verified: boolean;
  created_at: string;
  account_name: string | null;
}

export interface Project {
  id: string;
  account_id: string;
  primary_contact_id: string | null;
  name: string;
  description: string | null;
  stage: string;
  origin: string;
  estimated_value: number;
  created_at: string;
  updated_at: string;
  account_name: string | null;
}

export interface Signal {
  id: string;
  account_id: string;
  source: string;
  signal_type: string;
  heat: string;
  title: string;
  detail: string | null;
  score_contribution: number;
  project_name: string | null;
  project_value: number | null;
  location_city: string | null;
  location_state: string | null;
  detected_at: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  team_id: string | null;
  created_at: string;
}

// ── API functions ───────────────────────────────────────

export interface ImportResult {
  message: string;
  results: {
    auto_matched: number;
    flagged_for_review: number;
    manual_review_required: number;
    new_accounts_created: number;
    contacts_added: number;
    errors: string[];
  };
}

export const accountsApi = {
  list: (params?: { search?: string; segment?: string; deal_stage?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Account>>('/api/accounts', { params }),
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ImportResult>('/accounts/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  get: (id: string) =>
    api.get<Account>(`/api/accounts/${id}`),
  create: (data: Partial<Account>) =>
    api.post<Account>('/api/accounts', data),
  update: (id: string, data: Partial<Account>) =>
    api.put<Account>(`/api/accounts/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/accounts/${id}`),
  getContacts: (id: string) =>
    api.get<Contact[]>(`/api/accounts/${id}/contacts`),
  getSignals: (id: string) =>
    api.get<Signal[]>(`/api/accounts/${id}/signals`),
  getProjects: (id: string) =>
    api.get<Project[]>(`/api/accounts/${id}/projects`),
};

export const contactsApi = {
  list: (params?: { search?: string; account_id?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Contact>>('/api/contacts', { params }),
  get: (id: string) =>
    api.get<Contact>(`/api/contacts/${id}`),
  create: (data: { account_id: string; name: string; title?: string; role_category?: string; email?: string; phone?: string }) =>
    api.post<Contact>('/api/contacts', data),
  update: (id: string, data: Partial<Contact>) =>
    api.put<Contact>(`/api/contacts/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/contacts/${id}`),
};

export const projectsApi = {
  list: (params?: { search?: string; stage?: string; account_id?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Project>>('/api/projects', { params }),
  get: (id: string) =>
    api.get<Project>(`/api/projects/${id}`),
  create: (data: { account_id: string; name: string; description?: string; stage?: string; origin?: string; estimated_value?: number }) =>
    api.post<Project>('/api/projects', data),
  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/api/projects/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/projects/${id}`),
};

export const signalsApi = {
  list: (params?: { account_id?: string; source?: string; heat?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Signal>>('/api/signals', { params }),
  get: (id: string) =>
    api.get<Signal>(`/api/signals/${id}`),
};

export const metricsApi = {
  get: () =>
    api.get<{ activeAccounts: number; newSignals: number; highPriorityContacts: number; outreachSent: number }>('/api/metrics'),
};

export const outreachApi = {
  generate: (accountId: string, contactId: string) =>
    api.post('/api/outreach/generate', { account_id: accountId, contact_id: contactId }),
  demo: () =>
    api.get('/api/demo/outreach'),
};

export const authApi = {
  register: (data: { email: string; password: string; name: string; team_id?: string }) =>
    api.post<{ access_token: string; token_type: string }>('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; token_type: string }>('/api/auth/login', data),
  me: () =>
    api.get<UserProfile>('/api/auth/me'),
};

export default api;
