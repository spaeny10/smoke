import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
  website: string | null;
  region: string | null;
  employee_count: number | null;
  segment: string | null;
  tier: number;
  composite_score: number;
  score_trend: string;
  deal_stage: string;
  assigned_rep_id: string | null;
  next_step_text: string | null;
  next_step_due: string | null;
  next_step_assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountLocation {
  id: string;
  account_id: string;
  label: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_hq: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  location_id: string | null;
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
  location_label: string | null;
}

export interface Project {
  id: string;
  account_id: string;
  primary_contact_id: string | null;
  signal_id: string | null;
  location_id: string | null;
  name: string;
  description: string | null;
  stage: string;
  origin: string;
  estimated_value: number;
  created_at: string;
  updated_at: string;
  account_name: string | null;
  location_label: string | null;
  primary_contact_name: string | null;
}

export interface Signal {
  id: string;
  account_id: string | null;
  source: string;
  signal_type: string;
  heat: string;
  status: string;
  title: string;
  detail: string | null;
  score_contribution: number;
  project_name: string | null;
  project_value: number | null;
  location_city: string | null;
  location_state: string | null;
  detected_at: string;
  created_at: string;
  source_date: string | null;
  account_name: string | null;
}

export interface PriorityQueueItem {
  account: Account;
  priority_score: number;
  reasons: string[];
  recent_signals: Signal[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  team_id: string | null;
  created_at: string;
}

export interface TeamRead {
  id: string;
  name: string;
  created_at: string;
}

export interface TeamWithMembers extends TeamRead {
  members: UserProfile[];
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
  list: (params?: { search?: string; segment?: string; deal_stage?: string; tier?: number; view?: string; offset?: number; limit?: number }) =>
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
  create: (data: Partial<Account>, force?: boolean) =>
    api.post<Account>(`/api/accounts${force ? '?force=true' : ''}`, data),
  checkDuplicate: (name: string) =>
    api.get<{ has_duplicate: boolean; matches: Array<{ id: string; name: string; score: number; category: string }> }>('/api/accounts/check-duplicate', { params: { name } }),
  update: (id: string, data: Partial<Account>) =>
    api.put<Account>(`/api/accounts/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/accounts/${id}`),
  discoveredCount: () =>
    api.get<{ count: number }>('/api/accounts/discovered/count'),
  priorityQueue: (params?: { view?: string; limit?: number }) =>
    api.get<{ items: PriorityQueueItem[] }>('/api/accounts/priority-queue', { params }),
  getContacts: (id: string) =>
    api.get<Contact[]>(`/api/accounts/${id}/contacts`),
  getSignals: (id: string) =>
    api.get<Signal[]>(`/api/accounts/${id}/signals`),
  getProjects: (id: string) =>
    api.get<Project[]>(`/api/accounts/${id}/projects`),
  discoverContacts: (id: string) =>
    api.post<{ status: string; message: string }>(`/api/accounts/${id}/discover-contacts`),
  merge: (keepId: string, mergeId: string) =>
    api.post<{ status: string; kept: Account; contacts_moved: number; signals_moved: number; projects_moved: number }>(`/api/accounts/merge?keep_id=${keepId}&merge_id=${mergeId}`),
  getLocations: (id: string) =>
    api.get<AccountLocation[]>(`/api/accounts/${id}/locations`),
  createLocation: (id: string, data: { label: string; address?: string; city?: string; state?: string; zip?: string; is_hq?: boolean }) =>
    api.post<AccountLocation>(`/api/accounts/${id}/locations`, data),
  updateLocation: (accountId: string, locationId: string, data: Partial<AccountLocation>) =>
    api.put<AccountLocation>(`/api/accounts/${accountId}/locations/${locationId}`, data),
  deleteLocation: (accountId: string, locationId: string) =>
    api.delete(`/api/accounts/${accountId}/locations/${locationId}`),
};

export const contactsApi = {
  list: (params?: { search?: string; account_id?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Contact>>('/api/contacts', { params }),
  get: (id: string) =>
    api.get<Contact>(`/api/contacts/${id}`),
  create: (data: { account_id: string; name: string; title?: string; role_category?: string; email?: string; phone?: string; location_id?: string }) =>
    api.post<Contact>('/api/contacts', data),
  update: (id: string, data: Partial<Contact>) =>
    api.put<Contact>(`/api/contacts/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/contacts/${id}`),
  findEmail: (id: string) =>
    api.post<{ email: string | null; method: string; candidates: string[]; contact?: Contact }>(`/api/contacts/${id}/find-email`),
};

export const projectsApi = {
  list: (params?: { search?: string; stage?: string; account_id?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Project>>('/api/projects', { params }),
  get: (id: string) =>
    api.get<Project>(`/api/projects/${id}`),
  create: (data: { account_id: string; name: string; description?: string; signal_id?: string; location_id?: string; stage?: string; origin?: string; estimated_value?: number }) =>
    api.post<Project>('/api/projects', data),
  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/api/projects/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/projects/${id}`),
};

export const signalsApi = {
  list: (params?: { account_id?: string; source?: string; heat?: string; status?: string; location_state?: string; tier?: number; view?: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Signal>>('/api/signals', { params }),
  get: (id: string) =>
    api.get<Signal>(`/api/signals/${id}`),
  updateStatus: (id: string, status: string) =>
    api.patch<Signal>(`/api/signals/${id}/status`, { status }),
};

export interface MetricTrends {
  accounts: number[];
  signals: number[];
  contacts: number[];
  outreach: number[];
}

export const metricsApi = {
  get: () =>
    api.get<{ activeAccounts: number; newSignals: number; highPriorityContacts: number; outreachSent: number }>('/api/metrics'),
  trends: () =>
    api.get<MetricTrends>('/api/metrics/trends'),
};

export const outreachApi = {
  generate: (accountId: string, contactId: string) =>
    api.post('/api/outreach/generate', { account_id: accountId, contact_id: contactId }),
  demo: () =>
    api.get('/api/demo/outreach'),
};

export interface AISearchResponse {
  message: string;
  signals: (Signal & { account_name?: string })[];
  filters_used: Record<string, unknown>;
}

export const aiApi = {
  search: (query: string) =>
    api.post<AISearchResponse>('/api/ai/search', { query }),
};

export const authApi = {
  register: (data: { email: string; password: string; name: string; team_id?: string }) =>
    api.post<{ access_token: string; token_type: string }>('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; token_type: string }>('/api/auth/login', data),
  google: (credential: string) =>
    api.post<{ access_token: string; token_type: string }>('/api/auth/google', { credential }),
  me: () =>
    api.get<UserProfile>('/api/auth/me'),
};

export const teamsApi = {
  list: () =>
    api.get<TeamWithMembers[]>('/api/teams'),
  create: (data: { name: string }) =>
    api.post<TeamRead>('/api/teams', data),
  delete: (id: string) =>
    api.delete(`/api/teams/${id}`),
};

export const usersApi = {
  list: () =>
    api.get<UserProfile[]>('/api/users'),
  update: (id: string, data: { role?: string; team_id?: string | null }) =>
    api.put<UserProfile>(`/api/users/${id}`, data),
};

// ── Signal Gates ────────────────────────────────────────

export interface SignalGateConditions {
  states?: string[];
  sources?: string[];
  min_value?: number | null;
  max_value?: number | null;
  segments?: string[];
  min_employee_count?: number | null;
  max_employee_count?: number | null;
}

export interface SignalGate {
  id: string;
  name: string;
  description: string | null;
  conditions: SignalGateConditions;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const signalGatesApi = {
  list: () =>
    api.get<SignalGate[]>('/api/signal-gates'),
  create: (data: { name: string; description?: string; conditions: SignalGateConditions; enabled?: boolean }) =>
    api.post<SignalGate>('/api/signal-gates', data),
  update: (id: string, data: Partial<{ name: string; description: string; conditions: SignalGateConditions; enabled: boolean }>) =>
    api.put<SignalGate>(`/api/signal-gates/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/signal-gates/${id}`),
  enforce: () =>
    api.post<{ removed: number; message: string }>('/api/signal-gates/enforce'),
};

// ── Pipelines ───────────────────────────────────────────

export interface PipelineScanStatus {
  running: boolean;
  last_run: string | null;
  last_result: {
    permits: number;
    contracts: number;
    news: number;
    osha: number;
    jobtitles: number;
    sam: number;
    fema: number;
    sec: number;
    epa: number;
    procore: number;
    total_new: number;
  } | null;
  error: string | null;
}

export const pipelinesApi = {
  run: () =>
    api.post<{ status: string; message: string }>('/api/pipelines/run'),
  status: () =>
    api.get<PipelineScanStatus>('/api/pipelines/status'),
};

// ── Notifications ────────────────────────────────────────

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export const notificationsApi = {
  list: () =>
    api.get<AppNotification[]>('/api/notifications'),
  unreadCount: () =>
    api.get<{ count: number }>('/api/notifications/unread-count'),
  markRead: (id: string) =>
    api.patch<AppNotification>(`/api/notifications/${id}/read`),
  markAllRead: () =>
    api.post('/api/notifications/read-all'),
};

// ── Activities ───────────────────────────────────────────

export interface Activity {
  id: string;
  account_id: string;
  contact_id: string | null;
  user_id: string | null;
  channel: string;
  direction: string;
  summary: string;
  is_auto_logged: boolean;
  created_at: string;
}

export const activitiesApi = {
  list: (params: { account_id: string; offset?: number; limit?: number }) =>
    api.get<PaginatedResponse<Activity>>('/api/activities', { params }),
  create: (data: { account_id: string; channel: string; direction: string; summary: string; contact_id?: string }) =>
    api.post<Activity>('/api/activities', data),
};

// ── Bulk Actions ─────────────────────────────────────────

export const bulkApi = {
  updateAccounts: (ids: string[], updates: { tier?: number; assigned_rep_id?: string; deal_stage?: string }) =>
    api.post<{ updated: number }>('/api/accounts/bulk-update', { ids, updates }),
  deleteAccounts: (ids: string[]) =>
    api.post<{ deleted: number }>('/api/accounts/bulk-delete', { ids }),
};

// ── Schedule Config ──────────────────────────────────────

export interface ScheduleConfig {
  id: string | null;
  task_name: string;
  cron_expression: string;
  enabled: boolean;
  last_triggered: string | null;
}

export const scheduleApi = {
  get: () =>
    api.get<ScheduleConfig>('/api/pipelines/schedule'),
  update: (data: { cron_expression?: string; enabled?: boolean }) =>
    api.put<ScheduleConfig>('/api/pipelines/schedule', data),
};

// ── Saved Views ─────────────────────────────────────────

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  entity: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export const savedViewsApi = {
  list: (entity: string) =>
    api.get<SavedView[]>('/api/saved-views', { params: { entity } }),
  create: (data: { name: string; entity: string; filters: Record<string, unknown> }) =>
    api.post<SavedView>('/api/saved-views', data),
  delete: (id: string) =>
    api.delete(`/api/saved-views/${id}`),
};

// ── Signal Dedup ────────────────────────────────────────

export const signalDedupApi = {
  findDuplicates: (accountId: string) =>
    api.get<Signal[][]>(`/api/signals/duplicates`, { params: { account_id: accountId } }),
  merge: (keepId: string, removeIds: string[]) =>
    api.post<{ kept: string; deleted: number }>('/api/signals/merge', { keep_id: keepId, remove_ids: removeIds }),
};

// ── Reports ─────────────────────────────────────────────

export interface SignalsBySource { source: string; count: number; }
export interface SignalsByState { state: string; count: number; }
export interface SignalsOverTime { date: string; count: number; }
export interface TopAccount {
  id: string;
  name: string;
  tier: number;
  composite_score: number;
  deal_stage: string;
  segment: string | null;
  signal_count: number;
}
export interface PipelineSummary {
  tiers: { tier: number; count: number }[];
  stages: { stage: string; count: number }[];
}

export const reportsApi = {
  signalsBySource: () =>
    api.get<SignalsBySource[]>('/api/reports/signals-by-source'),
  signalsByState: (params?: { view?: string }) =>
    api.get<SignalsByState[]>('/api/reports/signals-by-state', { params }),
  signalsOverTime: (days?: number) =>
    api.get<SignalsOverTime[]>('/api/reports/signals-over-time', { params: { days } }),
  pipelineSummary: () =>
    api.get<PipelineSummary>('/api/reports/pipeline-summary'),
  topAccounts: (limit?: number) =>
    api.get<TopAccount[]>('/api/reports/top-accounts', { params: { limit } }),
};

// ── Enrichment ──────────────────────────────────────────

export const enrichApi = {
  enrich: (accountId: string) =>
    api.post<Account>(`/api/accounts/${accountId}/enrich`),
  bulkEnrich: (ids: string[]) =>
    api.post<{ enriched: number }>('/api/accounts/bulk-enrich', { ids }),
};

// ── Sequences ───────────────────────────────────────────

export interface SequenceStep {
  step: number;
  channel: string;
  delay_days: number;
  template: string;
}

export interface OutreachSequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  created_by: string | null;
  created_at: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  contact_id: string;
  account_id: string;
  current_step: number;
  status: string;
  next_send_at: string | null;
  created_at: string;
}

export const sequencesApi = {
  list: () =>
    api.get<OutreachSequence[]>('/api/sequences'),
  create: (data: { name: string; steps: SequenceStep[] }) =>
    api.post<OutreachSequence>('/api/sequences', data),
  get: (id: string) =>
    api.get<OutreachSequence & { enrollment_count: number; active_count: number }>(`/api/sequences/${id}`),
  delete: (id: string) =>
    api.delete(`/api/sequences/${id}`),
  enroll: (sequenceId: string, data: { contact_id: string; account_id: string }) =>
    api.post<SequenceEnrollment>(`/api/sequences/${sequenceId}/enroll`, data),
  enrollments: (sequenceId: string) =>
    api.get<SequenceEnrollment[]>(`/api/sequences/${sequenceId}/enrollments`),
  updateEnrollment: (enrollmentId: string, data: { status?: string }) =>
    api.patch<SequenceEnrollment>(`/api/sequences/enrollments/${enrollmentId}`, data),
};

// ── Global Search ───────────────────────────────────────

export interface GlobalSearchResult {
  accounts: { id: string; name: string; tier: number; deal_stage: string }[];
  contacts: { id: string; name: string; email: string | null; account_id: string }[];
  signals: { id: string; title: string; source: string; account_id: string }[];
}

export const searchApi = {
  search: (q: string) =>
    api.get<GlobalSearchResult>('/api/search', { params: { q } }),
};

// ── Export ───────────────────────────────────────────────

export const exportApi = {
  accounts: () => `${API_BASE}/api/export/accounts`,
  contacts: () => `${API_BASE}/api/export/contacts`,
  signals: () => `${API_BASE}/api/export/signals`,
};

export default api;
