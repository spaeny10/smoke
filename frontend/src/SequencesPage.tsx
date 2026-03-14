import { useState, useEffect } from 'react';
import { Plus, Loader2, ChevronRight, Trash2, Play, Pause, CheckCircle2, X } from 'lucide-react';
import { sequencesApi, type OutreachSequence, type SequenceStep, type SequenceEnrollment } from './api';

export default function SequencesPage() {
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(OutreachSequence & { enrollment_count: number; active_count: number }) | null>(null);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSteps, setNewSteps] = useState<SequenceStep[]>([
    { step: 1, channel: 'email', delay_days: 0, template: '' },
  ]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    sequencesApi.list()
      .then(res => setSequences(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    if (!newName.trim() || newSteps.some(s => !s.template.trim())) return;
    setCreating(true);
    sequencesApi.create({ name: newName.trim(), steps: newSteps })
      .then(res => {
        setSequences(prev => [res.data, ...prev]);
        setNewName('');
        setNewSteps([{ step: 1, channel: 'email', delay_days: 0, template: '' }]);
        setShowCreate(false);
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this loop?')) return;
    sequencesApi.delete(id).then(() => {
      setSequences(prev => prev.filter(s => s.id !== id));
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
    }).catch(() => {});
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    Promise.all([
      sequencesApi.get(id),
      sequencesApi.enrollments(id),
    ]).then(([detRes, enrRes]) => {
      setDetail(detRes.data);
      setEnrollments(enrRes.data);
    }).catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const toggleEnrollmentStatus = (enrollment: SequenceEnrollment) => {
    const newStatus = enrollment.status === 'active' ? 'paused' : 'active';
    sequencesApi.updateEnrollment(enrollment.id, { status: newStatus })
      .then(res => {
        setEnrollments(prev => prev.map(e => e.id === enrollment.id ? res.data : e));
      })
      .catch(() => {});
  };

  const addStep = () => {
    setNewSteps(prev => [...prev, {
      step: prev.length + 1,
      channel: 'email',
      delay_days: prev.length > 0 ? 3 : 0,
      template: '',
    }]);
  };

  const removeStep = (idx: number) => {
    if (newSteps.length <= 1) return;
    setNewSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step: i + 1 })));
  };

  const updateStep = (idx: number, field: keyof SequenceStep, value: string | number) => {
    setNewSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading loops...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Loops</h1>
          <p className="text-sm text-[#8b8b93]">Automated outreach loops for contacts and projects.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm text-white transition-colors"
        >
          <Plus size={16} />
          New Loop
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-[#1a1a1c] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
              <h2 className="text-lg font-semibold text-white">Create Loop</h2>
              <button onClick={() => !creating && setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8b8b93] mb-1.5">Loop Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Post-Signal Outreach"
                  className="w-full bg-[#0a0a0b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-[#8b8b93]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b8b93] mb-2">Steps</label>
                <div className="space-y-3">
                  {newSteps.map((step, idx) => (
                    <div key={idx} className="bg-[#202022] border border-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-indigo-400">Step {step.step}</span>
                        {newSteps.length > 1 && (
                          <button onClick={() => removeStep(idx)} className="text-[#8b8b93] hover:text-red-400 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-[10px] text-[#8b8b93] block mb-1">Channel</label>
                          <select
                            value={step.channel}
                            onChange={e => updateStep(idx, 'channel', e.target.value)}
                            className="w-full bg-[#141416] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="call">Call</option>
                            <option value="linkedin">LinkedIn</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8b8b93] block mb-1">Delay (days)</label>
                          <input
                            type="number"
                            min={0}
                            value={step.delay_days}
                            onChange={e => updateStep(idx, 'delay_days', parseInt(e.target.value) || 0)}
                            className="w-full bg-[#141416] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <textarea
                        placeholder="Message template..."
                        value={step.template}
                        onChange={e => updateStep(idx, 'template', e.target.value)}
                        rows={2}
                        className="w-full bg-[#141416] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-[#8b8b93] focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStep}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1"
                >
                  <Plus size={12} /> Add Step
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 shrink-0">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || newSteps.some(s => !s.template.trim())}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {creating ? 'Creating...' : 'Create Loop'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Sequence List */}
        <div className={selectedId ? 'col-span-5' : 'col-span-12'}>
          {sequences.length === 0 ? (
            <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-12 text-center">
              <p className="text-[#8b8b93] mb-4">No loops yet. Create your first automated outreach loop.</p>
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm text-white transition-colors">
                Create Loop
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sequences.map(seq => (
                <div
                  key={seq.id}
                  onClick={() => openDetail(seq.id)}
                  className={`bg-[#1a1a1c] border rounded-2xl p-5 cursor-pointer transition-all hover:border-white/10 ${
                    selectedId === seq.id ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-medium">{seq.name}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(seq.id); }}
                        className="text-[#8b8b93] hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} className="text-[#8b8b93]" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#8b8b93]">
                    <span>{seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}</span>
                    <span>{new Date(seq.created_at).toLocaleDateString()}</span>
                  </div>
                  {/* Step previews */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {seq.steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          s.channel === 'email' ? 'bg-blue-500/10 text-blue-400' :
                          s.channel === 'sms' ? 'bg-green-500/10 text-green-400' :
                          s.channel === 'call' ? 'bg-orange-500/10 text-orange-400' :
                          'bg-purple-500/10 text-purple-400'
                        }`}>{s.channel}</span>
                        {i < seq.steps.length - 1 && <span className="text-[#8b8b93] text-[10px]">→</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sequence Detail */}
        {selectedId && (
          <div className="col-span-7">
            {detailLoading ? (
              <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-12 flex items-center justify-center text-[#8b8b93]">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : detail ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">{detail.name}</h2>
                    <button onClick={() => { setSelectedId(null); setDetail(null); }} className="text-[#8b8b93] hover:text-white transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-[#202022] rounded-lg px-3 py-2 border border-white/5">
                      <span className="text-[#8b8b93] text-xs block">Steps</span>
                      <span className="text-white font-bold text-lg">{detail.steps.length}</span>
                    </div>
                    <div className="bg-[#202022] rounded-lg px-3 py-2 border border-white/5">
                      <span className="text-[#8b8b93] text-xs block">Enrolled</span>
                      <span className="text-white font-bold text-lg">{detail.enrollment_count}</span>
                    </div>
                    <div className="bg-[#202022] rounded-lg px-3 py-2 border border-white/5">
                      <span className="text-[#8b8b93] text-xs block">Active</span>
                      <span className="text-green-400 font-bold text-lg">{detail.active_count}</span>
                    </div>
                  </div>
                </div>

                {/* Steps */}
                <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
                  <h3 className="text-white font-medium mb-4">Steps</h3>
                  <div className="space-y-3">
                    {detail.steps.map((s: SequenceStep, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {s.step}
                        </div>
                        <div className="flex-1 bg-[#202022] border border-white/5 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              s.channel === 'email' ? 'bg-blue-500/10 text-blue-400' :
                              s.channel === 'sms' ? 'bg-green-500/10 text-green-400' :
                              s.channel === 'call' ? 'bg-orange-500/10 text-orange-400' :
                              'bg-purple-500/10 text-purple-400'
                            }`}>{s.channel}</span>
                            {s.delay_days > 0 && (
                              <span className="text-[10px] text-[#8b8b93]">+{s.delay_days} day{s.delay_days !== 1 ? 's' : ''}</span>
                            )}
                          </div>
                          <p className="text-xs text-[#e2e2e5] whitespace-pre-wrap">{s.template}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enrollments */}
                <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
                  <h3 className="text-white font-medium mb-4">Enrollments</h3>
                  {enrollments.length === 0 ? (
                    <p className="text-sm text-[#8b8b93] text-center py-6">No contacts enrolled yet. Enroll contacts from the Account Detail page.</p>
                  ) : (
                    <div className="space-y-2">
                      {enrollments.map(enr => (
                        <div key={enr.id} className="flex items-center justify-between p-3 bg-[#202022] border border-white/5 rounded-xl">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`w-2 h-2 rounded-full ${
                                enr.status === 'active' ? 'bg-green-400' :
                                enr.status === 'paused' ? 'bg-yellow-400' :
                                enr.status === 'completed' ? 'bg-blue-400' :
                                'bg-red-400'
                              }`} />
                              <span className="text-xs text-[#e2e2e5] font-medium capitalize">{enr.status}</span>
                              <span className="text-[10px] text-[#8b8b93]">Step {enr.current_step}/{detail.steps.length}</span>
                            </div>
                            <span className="text-[10px] text-[#8b8b93]">{new Date(enr.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {enr.status === 'active' ? (
                              <button onClick={() => toggleEnrollmentStatus(enr)} className="p-1 text-[#8b8b93] hover:text-yellow-400 transition-colors" title="Pause">
                                <Pause size={14} />
                              </button>
                            ) : enr.status === 'paused' ? (
                              <button onClick={() => toggleEnrollmentStatus(enr)} className="p-1 text-[#8b8b93] hover:text-green-400 transition-colors" title="Resume">
                                <Play size={14} />
                              </button>
                            ) : (
                              <CheckCircle2 size={14} className="text-blue-400" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
