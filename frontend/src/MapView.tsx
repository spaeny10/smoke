import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { reportsApi, signalsApi, type SignalsByState, type Signal } from './api';

// Simplified US state paths (bounding boxes as rectangles for a grid-style map)
const STATE_GRID: { abbr: string; name: string; row: number; col: number }[] = [
  { abbr: 'AK', name: 'Alaska', row: 0, col: 0 },
  { abbr: 'ME', name: 'Maine', row: 0, col: 10 },
  { abbr: 'WI', name: 'Wisconsin', row: 1, col: 5 },
  { abbr: 'VT', name: 'Vermont', row: 1, col: 9 },
  { abbr: 'NH', name: 'New Hampshire', row: 1, col: 10 },
  { abbr: 'WA', name: 'Washington', row: 2, col: 0 },
  { abbr: 'ID', name: 'Idaho', row: 2, col: 1 },
  { abbr: 'MT', name: 'Montana', row: 2, col: 2 },
  { abbr: 'ND', name: 'North Dakota', row: 2, col: 3 },
  { abbr: 'MN', name: 'Minnesota', row: 2, col: 4 },
  { abbr: 'IL', name: 'Illinois', row: 2, col: 5 },
  { abbr: 'MI', name: 'Michigan', row: 2, col: 6 },
  { abbr: 'NY', name: 'New York', row: 2, col: 8 },
  { abbr: 'MA', name: 'Massachusetts', row: 2, col: 9 },
  { abbr: 'CT', name: 'Connecticut', row: 2, col: 10 },
  { abbr: 'OR', name: 'Oregon', row: 3, col: 0 },
  { abbr: 'NV', name: 'Nevada', row: 3, col: 1 },
  { abbr: 'WY', name: 'Wyoming', row: 3, col: 2 },
  { abbr: 'SD', name: 'South Dakota', row: 3, col: 3 },
  { abbr: 'IA', name: 'Iowa', row: 3, col: 4 },
  { abbr: 'IN', name: 'Indiana', row: 3, col: 5 },
  { abbr: 'OH', name: 'Ohio', row: 3, col: 6 },
  { abbr: 'PA', name: 'Pennsylvania', row: 3, col: 7 },
  { abbr: 'NJ', name: 'New Jersey', row: 3, col: 8 },
  { abbr: 'RI', name: 'Rhode Island', row: 3, col: 9 },
  { abbr: 'CA', name: 'California', row: 4, col: 0 },
  { abbr: 'UT', name: 'Utah', row: 4, col: 1 },
  { abbr: 'CO', name: 'Colorado', row: 4, col: 2 },
  { abbr: 'NE', name: 'Nebraska', row: 4, col: 3 },
  { abbr: 'MO', name: 'Missouri', row: 4, col: 4 },
  { abbr: 'KY', name: 'Kentucky', row: 4, col: 5 },
  { abbr: 'WV', name: 'West Virginia', row: 4, col: 6 },
  { abbr: 'VA', name: 'Virginia', row: 4, col: 7 },
  { abbr: 'MD', name: 'Maryland', row: 4, col: 8 },
  { abbr: 'DE', name: 'Delaware', row: 4, col: 9 },
  { abbr: 'AZ', name: 'Arizona', row: 5, col: 1 },
  { abbr: 'NM', name: 'New Mexico', row: 5, col: 2 },
  { abbr: 'KS', name: 'Kansas', row: 5, col: 3 },
  { abbr: 'AR', name: 'Arkansas', row: 5, col: 4 },
  { abbr: 'TN', name: 'Tennessee', row: 5, col: 5 },
  { abbr: 'NC', name: 'North Carolina', row: 5, col: 6 },
  { abbr: 'SC', name: 'South Carolina', row: 5, col: 7 },
  { abbr: 'DC', name: 'D.C.', row: 5, col: 8 },
  { abbr: 'OK', name: 'Oklahoma', row: 6, col: 3 },
  { abbr: 'LA', name: 'Louisiana', row: 6, col: 4 },
  { abbr: 'MS', name: 'Mississippi', row: 6, col: 5 },
  { abbr: 'AL', name: 'Alabama', row: 6, col: 6 },
  { abbr: 'GA', name: 'Georgia', row: 6, col: 7 },
  { abbr: 'HI', name: 'Hawaii', row: 7, col: 0 },
  { abbr: 'TX', name: 'Texas', row: 7, col: 3 },
  { abbr: 'FL', name: 'Florida', row: 7, col: 7 },
];

function getColor(count: number, maxCount: number): string {
  if (count === 0) return '#1a1a1c';
  const ratio = Math.min(count / Math.max(maxCount, 1), 1);
  if (ratio > 0.6) return '#4f46e5';
  if (ratio > 0.3) return '#6366f1';
  if (ratio > 0.1) return '#818cf8';
  return '#a5b4fc';
}

export default function MapView() {
  const [byState, setByState] = useState<SignalsByState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateSignals, setStateSignals] = useState<Signal[]>([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  useEffect(() => {
    reportsApi.signalsByState()
      .then(res => setByState(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stateMap: Record<string, number> = {};
  byState.forEach(s => { stateMap[s.state] = s.count; });
  const maxCount = byState.length > 0 ? Math.max(...byState.map(s => s.count)) : 1;

  const handleStateClick = (abbr: string) => {
    setSelectedState(abbr);
    setSigLoading(true);
    signalsApi.list({ offset: 0, limit: 20 })
      .then(res => {
        // Filter client-side by state since signals API may not have state filter
        setStateSignals(res.data.items.filter(s => s.location_state === abbr));
      })
      .catch(() => setStateSignals([]))
      .finally(() => setSigLoading(false));
  };

  const hoveredInfo = hoveredState ? STATE_GRID.find(s => s.abbr === hoveredState) : null;
  const hoveredCount = hoveredState ? (stateMap[hoveredState] || 0) : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading map data...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Signal Map</h1>
        <p className="text-sm text-[#8b8b93]">Geographic distribution of signals across the United States.</p>
      </div>

      {/* Grid-based US Map */}
      <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-8 mb-8 relative">
        {hoveredInfo && (
          <div className="absolute top-4 right-4 bg-[#202022] border border-white/10 rounded-lg px-3 py-2 z-10">
            <span className="text-white font-medium text-sm">{hoveredInfo.name}</span>
            <span className="text-[#8b8b93] text-sm ml-2">{hoveredCount} signal{hoveredCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: 'repeat(11, 52px)', gridTemplateRows: 'repeat(8, 40px)' }}>
          {Array.from({ length: 8 * 11 }).map((_, idx) => {
            const row = Math.floor(idx / 11);
            const col = idx % 11;
            const state = STATE_GRID.find(s => s.row === row && s.col === col);
            if (!state) return <div key={idx} />;
            const count = stateMap[state.abbr] || 0;
            const isSelected = selectedState === state.abbr;
            return (
              <div
                key={state.abbr}
                onClick={() => handleStateClick(state.abbr)}
                onMouseEnter={() => setHoveredState(state.abbr)}
                onMouseLeave={() => setHoveredState(null)}
                className={`flex items-center justify-center rounded-lg cursor-pointer transition-all text-xs font-bold border ${
                  isSelected ? 'border-white/40 ring-2 ring-indigo-500/50' : 'border-white/5 hover:border-white/20'
                }`}
                style={{ backgroundColor: getColor(count, maxCount), gridRow: row + 1, gridColumn: col + 1 }}
                title={`${state.name}: ${count} signals`}
              >
                <span className={count > 0 ? 'text-white' : 'text-[#8b8b93]'}>{state.abbr}</span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-white/5">
          <span className="text-xs text-[#8b8b93]">Signal density:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#1a1a1c] border border-white/10" />
            <span className="text-[10px] text-[#8b8b93]">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#a5b4fc]" />
            <span className="text-[10px] text-[#8b8b93]">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#818cf8]" />
            <span className="text-[10px] text-[#8b8b93]">Med</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#6366f1]" />
            <span className="text-[10px] text-[#8b8b93]">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#4f46e5]" />
            <span className="text-[10px] text-[#8b8b93]">Max</span>
          </div>
        </div>
      </div>

      {/* State Signals List */}
      {selectedState && (
        <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">
              Signals in {STATE_GRID.find(s => s.abbr === selectedState)?.name || selectedState}
            </h2>
            <button onClick={() => setSelectedState(null)} className="text-xs text-[#8b8b93] hover:text-white transition-colors">Clear</button>
          </div>
          {sigLoading ? (
            <div className="flex items-center justify-center py-8 text-[#8b8b93]">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : stateSignals.length === 0 ? (
            <div className="text-center py-8 text-[#8b8b93] text-sm">No signals found for this state.</div>
          ) : (
            <div className="space-y-2">
              {stateSignals.map(sig => (
                <div key={sig.id} className="flex items-center gap-4 p-3 bg-[#202022] border border-white/5 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">{sig.source}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        sig.heat === 'hot' ? 'bg-red-500/10 text-red-400' :
                        sig.heat === 'warm' ? 'bg-orange-500/10 text-orange-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>{sig.heat}</span>
                    </div>
                    <p className="text-sm text-[#e2e2e5] truncate">{sig.title}</p>
                    <p className="text-[10px] text-[#8b8b93] mt-0.5">{sig.location_city}{sig.location_city && sig.location_state ? ', ' : ''}{sig.location_state}</p>
                  </div>
                  <span className="text-[10px] text-[#8b8b93] shrink-0">{new Date(sig.detected_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
