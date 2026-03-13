import { useState } from 'react';
import { Network, Zap, Target, BookOpen, Building2, CheckCircle2, AlertCircle, Play } from 'lucide-react';

export default function BlueprintsDashboard() {
  const [selectedSegment, setSelectedSegment] = useState('Enterprise Tier 1');

  return (
    <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Network className="text-indigo-400" />
            Revenue Blueprints
          </h1>
          <p className="text-sm text-[#8b8b93]">Proven, data-backed engagement paths for your top segments.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-[#1a1a1c] border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
            <span className="text-[#8b8b93] text-sm">Target Segment:</span>
            <select 
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer"
            >
              <option>Enterprise Tier 1</option>
              <option>Mid-Market Commercial</option>
              <option>Public Sector</option>
            </select>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20">
            <Zap size={16} />
            Generate New Blueprint
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: The Blueprint Journey */}
        <div className="col-span-8 space-y-6">
          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">The Proven Path</h2>
                <p className="text-sm text-[#8b8b93]">Historical analysis of 142 Closed-Won deals in this segment.</p>
              </div>
              <div className="flex gap-4">
                <div className="text-right">
                  <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1">Avg Deal Size</p>
                  <p className="text-xl font-bold text-green-400">$245k</p>
                </div>
                <div className="text-right border-l border-white/10 pl-4">
                  <p className="text-xs text-[#8b8b93] uppercase tracking-wider mb-1">Win Rate</p>
                  <p className="text-xl font-bold text-indigo-400">32.4%</p>
                </div>
              </div>
            </div>

            {/* Journey Visualization */}
            <div className="relative">
              {/* Connecting Line */}
              <div className="absolute top-8 left-[28px] bottom-10 w-0.5 bg-white/5 z-0"></div>
              
              <div className="space-y-8 relative z-10">
                <JourneyNode 
                  icon={<Target />} 
                  title="Initial Awareness" 
                  description="Account intelligence identifies high-intent building permits or Procore bids."
                  stats="100% of won deals"
                  isCompleted={true}
                  color="indigo"
                />
                
                <JourneyNode 
                  icon={<BookOpen />} 
                  title="Marketing Nurture" 
                  description="Contact engages with LinkedIn Ads or Case Study downloads."
                  stats="84% of won deals"
                  isCompleted={true}
                  color="blue"
                />
                
                <JourneyNode 
                  icon={<Zap />} 
                  title="SMOKE AI Signal + Outbound" 
                  description="SMOKE AI detects spike in Intent Score (>70) and drafts hyper-personalized SMS/Email."
                  stats="92% of won deals"
                  isCompleted={true}
                  color="orange"
                />
                
                <JourneyNode 
                  icon={<Building2 />} 
                  title="Executive Multi-threading" 
                  description="Sales Rep successfully books meeting with both PM and Procurement."
                  stats="78% of won deals"
                  isCompleted={true}
                  color="purple"
                />
                
                <JourneyNode 
                  icon={<CheckCircle2 />} 
                  title="Closed Won" 
                  description="Contract signed for site trailers and equipment."
                  stats="Avg 45 days from first touch"
                  isCompleted={true}
                  color="green"
                  isLast={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Prescriptive Actions */}
        <div className="col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
            
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Play size={18} className="text-indigo-400" />
              Prescribed Plays
            </h2>
            <p className="text-sm text-[#e2e2e5] mb-6">SMOKE AI found 3 active pipeline accounts that deviated from the successful blueprint.</p>
            
            <div className="space-y-4">
              <ActionCard 
                company="Turner Construction" 
                issue="Missing Executive Multi-threading" 
                recommendation="Send SMOKE AI-drafted email to Procurement Director requesting 15-min intro."
              />
              <ActionCard 
                company="Skanska USA" 
                issue="Stalled after Marketing Nurture" 
                recommendation="Intent score is 82. Trigger AI SMS follow-up referencing the recent Permit."
              />
              <ActionCard 
                company="PCL Construction" 
                issue="No recent Marketing Touches" 
                recommendation="Add account to 'Enterprise Retargeting' LinkedIn audience."
              />
            </div>
          </div>

          <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
             <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <AlertCircle size={16} className="text-orange-400" />
                Blueprint Diagnostics
             </h3>
             <p className="text-sm text-[#8b8b93] mb-4 leading-relaxed">
                When deals in this segment fail, <strong>64%</strong> drop off between <i>Marketing Nurture</i> and <i>SMOKE AI Outbound</i>. Speed to lead is critical.
             </p>
             <button className="w-full py-2.5 bg-[#202022] hover:bg-[#2a2a2d] border border-white/5 rounded-xl text-sm font-medium text-white transition-colors">
                View Churned Deal Analysis
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JourneyNode({ icon, title, description, stats, color, isLast = false }: any) {
  const colorMap: any = {
    indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
  };

  return (
    <div className="flex gap-6 group">
      <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border ${colorMap[color]} shadow-lg z-10 bg-[#1a1a1c] relative`}>
        {icon}
      </div>
      <div className={`flex-1 pt-1 pb-2 ${!isLast ? 'border-b border-white/5' : ''}`}>
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-white font-medium text-lg">{title}</h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#202022] text-[#8b8b93] border border-white/5">
            {stats}
          </span>
        </div>
        <p className="text-sm text-[#8b8b93] leading-relaxed max-w-xl">{description}</p>
      </div>
    </div>
  );
}

function ActionCard({ company, issue, recommendation }: any) {
  return (
    <div className="bg-[#141416]/50 border border-white/10 rounded-xl p-4 hover:border-indigo-500/30 transition-colors cursor-pointer group">
      <div className="flex justify-between items-start mb-2">
        <span className="text-white font-medium text-sm">{company}</span>
        <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-md font-medium">Gap Detected</span>
      </div>
      <p className="text-xs text-[#8b8b93] mb-3"><span className="text-white/40">Issue:</span> {issue}</p>
      <div className="bg-indigo-500/10 rounded-lg p-3 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
        <p className="text-xs text-indigo-300 font-medium leading-relaxed">
          <span className="text-indigo-400 font-bold">Action:</span> {recommendation}
        </p>
      </div>
    </div>
  );
}
