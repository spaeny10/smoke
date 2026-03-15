import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Pencil, Loader2, Filter, MapPin, DollarSign, Building2, Users, X, ChevronDown, Radar, CheckCircle2, AlertTriangle } from 'lucide-react';
import { signalGatesApi, pipelinesApi, scheduleApi, type SignalGate, type SignalGateConditions, type PipelineScanStatus, type ScheduleConfig, type UserProfile } from './api';

interface SignalTuningTabProps {
  userProfile: UserProfile;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const SOURCES = [
  { value: 'permit', label: 'Permits' },
  { value: 'usaspending', label: 'Contracts' },
  { value: 'news', label: 'News' },
  { value: 'osha', label: 'OSHA' },
  { value: 'procore', label: 'Procore' },
  { value: 'sam', label: 'SAM.gov' },
  { value: 'fema', label: 'FEMA' },
  { value: 'sec', label: 'SEC EDGAR' },
  { value: 'epa', label: 'EPA' },
];

const SEGMENTS = ['Commercial', 'Multifamily', 'Mixed'];

function formatCurrency(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

function conditionSummary(c: SignalGateConditions): string[] {
  const pills: string[] = [];
  if (c.states?.length) pills.push(c.states.length <= 3 ? c.states.join(', ') : `${c.states.length} states`);
  if (c.sources?.length) pills.push(c.sources.map(s => SOURCES.find(x => x.value === s)?.label ?? s).join(', '));
  if (c.min_value != null && c.max_value != null) pills.push(`${formatCurrency(c.min_value)} – ${formatCurrency(c.max_value)}`);
  else if (c.min_value != null) pills.push(`≥ ${formatCurrency(c.min_value)}`);
  else if (c.max_value != null) pills.push(`≤ ${formatCurrency(c.max_value)}`);
  if (c.segments?.length) pills.push(c.segments.join(', '));
  if (c.min_employee_count != null || c.max_employee_count != null) {
    const min = c.min_employee_count;
    const max = c.max_employee_count;
    if (min != null && max != null) pills.push(`${min}–${max} employees`);
    else if (min != null) pills.push(`≥ ${min} employees`);
    else if (max != null) pills.push(`≤ ${max} employees`);
  }
  return pills;
}

export default function SignalTuningTab({ userProfile }: SignalTuningTabProps) {
  const [gates, setGates] = useState<SignalGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGate, setEditingGate] = useState<SignalGate | null>(null);
  const [saving, setSaving] = useState(false);

  const isDirector = userProfile.role === 'director';

  // Scan state
  const [scanStatus, setScanStatus] = useState<PipelineScanStatus | null>(null);
  const [scanStarting, setScanStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Schedule state
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);

  useEffect(() => {
    if (isDirector) {
      scheduleApi.get().then(res => setScheduleConfig(res.data)).catch(() => {});
    }
  }, [isDirector]);

  const fetchScanStatus = useCallback(() => {
    if (!isDirector) return;
    pipelinesApi.status()
      .then(res => setScanStatus(res.data))
      .catch(() => {});
  }, [isDirector]);

  // Poll while scan is running
  useEffect(() => {
    if (!isDirector) return;
    fetchScanStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isDirector, fetchScanStatus]);

  useEffect(() => {
    if (scanStatus?.running) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchScanStatus, 3000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [scanStatus?.running, fetchScanStatus]);

  const handleRunScan = () => {
    setScanStarting(true);
    pipelinesApi.run()
      .then(() => {
        setScanStatus(prev => prev ? { ...prev, running: true } : { running: true, last_run: null, last_result: null, error: null });
        fetchScanStatus();
      })
      .catch(() => {})
      .finally(() => setScanStarting(false));
  };

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStates, setFormStates] = useState<string[]>([]);
  const [formSources, setFormSources] = useState<string[]>([]);
  const [formMinValue, setFormMinValue] = useState('');
  const [formMaxValue, setFormMaxValue] = useState('');
  const [formSegments, setFormSegments] = useState<string[]>([]);
  const [formMinEmployees, setFormMinEmployees] = useState('');
  const [formMaxEmployees, setFormMaxEmployees] = useState('');
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  const fetchGates = () => {
    setLoading(true);
    signalGatesApi.list()
      .then(res => setGates(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchGates(); }, []);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormStates([]);
    setFormSources([]);
    setFormMinValue('');
    setFormMaxValue('');
    setFormSegments([]);
    setFormMinEmployees('');
    setFormMaxEmployees('');
    setEditingGate(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (gate: SignalGate) => {
    setEditingGate(gate);
    setFormName(gate.name);
    setFormDescription(gate.description || '');
    const c = gate.conditions;
    setFormStates(c.states || []);
    setFormSources(c.sources || []);
    setFormMinValue(c.min_value != null ? String(c.min_value) : '');
    setFormMaxValue(c.max_value != null ? String(c.max_value) : '');
    setFormSegments(c.segments || []);
    setFormMinEmployees(c.min_employee_count != null ? String(c.min_employee_count) : '');
    setFormMaxEmployees(c.max_employee_count != null ? String(c.max_employee_count) : '');
    setShowForm(true);
  };

  const buildConditions = (): SignalGateConditions => {
    const c: SignalGateConditions = {};
    if (formStates.length) c.states = formStates;
    if (formSources.length) c.sources = formSources;
    if (formMinValue) c.min_value = parseFloat(formMinValue);
    if (formMaxValue) c.max_value = parseFloat(formMaxValue);
    if (formSegments.length) c.segments = formSegments;
    if (formMinEmployees) c.min_employee_count = parseInt(formMinEmployees);
    if (formMaxEmployees) c.max_employee_count = parseInt(formMaxEmployees);
    return c;
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    setSaving(true);
    const payload = { name: formName.trim(), description: formDescription.trim() || undefined, conditions: buildConditions() };

    const promise = editingGate
      ? signalGatesApi.update(editingGate.id, payload)
      : signalGatesApi.create(payload);

    promise
      .then(() => { setShowForm(false); resetForm(); fetchGates(); })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleToggle = (gate: SignalGate) => {
    signalGatesApi.update(gate.id, { enabled: !gate.enabled })
      .then(() => fetchGates())
      .catch(() => {});
  };

  const handleDelete = (gate: SignalGate) => {
    if (!confirm(`Delete gate "${gate.name}"?`)) return;
    signalGatesApi.delete(gate.id)
      .then(() => fetchGates())
      .catch(() => {});
  };

  const toggleArrayItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3">
        <Filter size={18} className="text-indigo-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-indigo-300 font-medium">How Signal Gates Work</p>
          <p className="text-xs text-indigo-300/70 mt-1">
            Gates filter which signals appear across the platform. A signal is shown if it matches <strong>any</strong> enabled gate.
            When no gates are enabled, all signals are visible.
          </p>
        </div>
      </div>

      {/* Add Gate button */}
      {isDirector && (
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
          >
            <Filter size={16} />
            Add Gate
          </button>
        </div>
      )}

      {/* Gate cards */}
      {gates.length === 0 ? (
        <div className="text-center py-20 text-[#8b8b93]">
          <Filter size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">No signal gates configured</p>
          <p className="text-sm mt-1">Create a gate to filter signals by geography, value, or segment</p>
        </div>
      ) : (
        gates.map(gate => {
          const pills = conditionSummary(gate.conditions);
          return (
            <div key={gate.id} className="bg-[#1a1a1c] rounded-[24px] border border-white/5 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${gate.enabled ? 'bg-emerald-500/15' : 'bg-[#202022]'}`}>
                    <Filter size={16} className={gate.enabled ? 'text-emerald-400' : 'text-[#8b8b93]'} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">{gate.name}</h3>
                    {gate.description && <p className="text-xs text-[#8b8b93] truncate">{gate.description}</p>}
                  </div>
                </div>

                {isDirector && (
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(gate)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${gate.enabled ? 'bg-emerald-600' : 'bg-[#333]'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${gate.enabled ? 'translate-x-5' : ''}`} />
                    </button>
                    <button
                      onClick={() => openEdit(gate)}
                      className="p-2 text-[#8b8b93] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      title="Edit gate"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(gate)}
                      className="p-2 text-[#8b8b93] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete gate"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}

                {!isDirector && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${gate.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#202022] text-[#8b8b93]'}`}>
                    {gate.enabled ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>

              {/* Condition pills */}
              {pills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {pills.map((pill, i) => (
                    <span key={i} className="text-xs text-[#8b8b93] bg-[#202022] px-2.5 py-1 rounded-full border border-white/5">
                      {pill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Run Scan section */}
      {isDirector && (
        <div className="bg-[#1a1a1c] rounded-[24px] border border-white/5 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${scanStatus?.running ? 'bg-amber-500/15' : 'bg-indigo-600/15'}`}>
                <Radar size={16} className={scanStatus?.running ? 'text-amber-400 animate-pulse' : 'text-indigo-400'} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Signal Scan</h3>
                <p className="text-xs text-[#8b8b93]">
                  {scanStatus?.running
                    ? 'Scanning pipelines for new signals...'
                    : scanStatus?.last_run
                      ? `Last run: ${new Date(scanStatus.last_run).toLocaleString()}`
                      : 'Run all pipelines to fetch new signals'}
                </p>
              </div>
            </div>

            <button
              onClick={handleRunScan}
              disabled={scanStarting || scanStatus?.running}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 px-5 rounded-xl transition-colors disabled:opacity-50"
            >
              {scanStatus?.running ? (
                <><Loader2 size={15} className="animate-spin" /> Scanning...</>
              ) : scanStarting ? (
                <><Loader2 size={15} className="animate-spin" /> Starting...</>
              ) : (
                <><Radar size={15} /> Run Scan</>
              )}
            </button>
          </div>

          {/* Last result */}
          {scanStatus?.last_result && !scanStatus.running && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {scanStatus.last_result.total_new} new signals found
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Permits', count: scanStatus.last_result.permits },
                  { label: 'Contracts', count: scanStatus.last_result.contracts },
                  { label: 'News', count: scanStatus.last_result.news },
                  { label: 'OSHA', count: scanStatus.last_result.osha },
                ].map(p => (
                  <div key={p.label} className="bg-[#141416] rounded-xl p-3 text-center border border-white/5">
                    <div className="text-lg font-semibold text-white">{p.count}</div>
                    <div className="text-[10px] text-[#8b8b93] uppercase tracking-wider">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {scanStatus?.error && !scanStatus.running && (
            <div className="mt-4 pt-4 border-t border-white/5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{scanStatus.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Schedule Config */}
      {isDirector && scheduleConfig && (
        <div className="bg-[#1a1a1c] rounded-[24px] border border-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-600/15">
                <Radar size={16} className="text-green-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Auto-Scan Schedule</h3>
                <p className="text-xs text-[#8b8b93]">Automatically run signal pipelines on a schedule</p>
              </div>
            </div>
            <button
              onClick={() => {
                const newEnabled = !scheduleConfig.enabled;
                scheduleApi.update({ enabled: newEnabled }).then(res => setScheduleConfig(res.data));
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${scheduleConfig.enabled ? 'bg-green-600' : 'bg-[#333]'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduleConfig.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {scheduleConfig.enabled && (
            <div className="flex items-center gap-3 mt-3">
              <label className="text-xs text-[#8b8b93]">Schedule:</label>
              <select
                value={scheduleConfig.cron_expression}
                onChange={e => {
                  scheduleApi.update({ cron_expression: e.target.value }).then(res => setScheduleConfig(res.data));
                }}
                className="bg-[#141416] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="0 */6 * * *">Every 6 hours</option>
                <option value="0 6 * * *">Daily at 6:00 AM</option>
                <option value="0 0 * * *">Daily at midnight</option>
                <option value="0 6 * * 1">Weekly Monday 6:00 AM</option>
              </select>
              {scheduleConfig.last_triggered && (
                <span className="text-[10px] text-[#8b8b93]">Last: {new Date(scheduleConfig.last_triggered).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="bg-[#1a1a1c] rounded-[24px] border border-white/10 p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-5">{editingGate ? 'Edit Gate' : 'Create Signal Gate'}</h3>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Gate Name</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Texas Large Projects"
                autoFocus
                className="w-full bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Description (optional)</label>
              <input
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Brief description of this gate"
                className="w-full bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="border-t border-white/5 pt-5 space-y-5">
              {/* States */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#8b8b93] mb-2">
                  <MapPin size={13} /> States
                </label>
                {formStates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formStates.map(st => (
                      <span key={st} className="flex items-center gap-1 text-xs bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-full">
                        {st}
                        <button onClick={() => toggleArrayItem(formStates, st, setFormStates)} className="hover:text-white"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStateDropdown(!showStateDropdown)}
                    className="w-full flex items-center justify-between bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-[#8b8b93] hover:border-white/20 transition-colors"
                  >
                    <span>{formStates.length ? `${formStates.length} selected` : 'Select states...'}</span>
                    <ChevronDown size={14} className={`transition-transform ${showStateDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showStateDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-[#202022] border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto p-2">
                      <div className="grid grid-cols-5 gap-1">
                        {US_STATES.map(st => (
                          <button
                            key={st}
                            onClick={() => toggleArrayItem(formStates, st, setFormStates)}
                            className={`text-xs py-1.5 rounded-lg transition-colors ${formStates.includes(st) ? 'bg-indigo-600 text-white' : 'text-[#8b8b93] hover:bg-white/5 hover:text-white'}`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sources */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#8b8b93] mb-2">
                  <Filter size={13} /> Signal Sources
                </label>
                <div className="flex flex-wrap gap-2">
                  {SOURCES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => toggleArrayItem(formSources, s.value, setFormSources)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${formSources.includes(s.value) ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'border-white/10 text-[#8b8b93] hover:border-white/20 hover:text-white'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Value */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#8b8b93] mb-2">
                  <DollarSign size={13} /> Project Value Range
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={formMinValue}
                    onChange={e => setFormMinValue(e.target.value)}
                    placeholder="Min ($)"
                    className="flex-1 bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[#555] text-sm">–</span>
                  <input
                    type="number"
                    value={formMaxValue}
                    onChange={e => setFormMaxValue(e.target.value)}
                    placeholder="Max ($)"
                    className="flex-1 bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Segments */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#8b8b93] mb-2">
                  <Building2 size={13} /> Account Segment
                </label>
                <div className="flex flex-wrap gap-2">
                  {SEGMENTS.map(seg => (
                    <button
                      key={seg}
                      onClick={() => toggleArrayItem(formSegments, seg, setFormSegments)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${formSegments.includes(seg) ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'border-white/10 text-[#8b8b93] hover:border-white/20 hover:text-white'}`}
                    >
                      {seg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Employee Count */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#8b8b93] mb-2">
                  <Users size={13} /> Employee Count Range
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={formMinEmployees}
                    onChange={e => setFormMinEmployees(e.target.value)}
                    placeholder="Min"
                    className="flex-1 bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[#555] text-sm">–</span>
                  <input
                    type="number"
                    value={formMaxEmployees}
                    onChange={e => setFormMaxEmployees(e.target.value)}
                    placeholder="Max"
                    className="flex-1 bg-[#141416] border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-white/5">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2.5 text-sm text-[#8b8b93] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingGate ? 'Update Gate' : 'Create Gate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
