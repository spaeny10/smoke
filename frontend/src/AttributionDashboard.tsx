import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Target, TrendingUp, Users, DollarSign, Filter, ChevronDown, Download } from 'lucide-react';

const revenueData = [
  { month: 'Jan', organic: 4000, paid: 2400, outbound: 2400 },
  { month: 'Feb', organic: 3000, paid: 1398, outbound: 2210 },
  { month: 'Mar', organic: 2000, paid: 9800, outbound: 2290 },
  { month: 'Apr', organic: 2780, paid: 3908, outbound: 2000 },
  { month: 'May', organic: 1890, paid: 4800, outbound: 2181 },
  { month: 'Jun', organic: 2390, paid: 3800, outbound: 2500 },
  { month: 'Jul', organic: 3490, paid: 4300, outbound: 2100 },
];

const signalROI = [
  { name: 'Procore Bids', roi: 450, cost: 1200, revenue: 6600 },
  { name: 'OSHA Permits', roi: 320, cost: 800, revenue: 3360 },
  { name: 'Dodge Data', roi: 210, cost: 2000, revenue: 6200 },
  { name: 'Website Intent', roi: 180, cost: 500, revenue: 1400 },
];

export default function AttributionDashboard() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Attribution Reporting</h1>
          <p className="text-sm text-[#8b8b93]">Track which campaigns, signals, and channels drive the most revenue.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-[#202022] hover:bg-[#2a2a2d] border border-white/5 rounded-xl text-sm text-[#e2e2e5] transition-colors">
            <Filter size={16} className="text-[#8b8b93]" />
            Filters
          </button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#202022] border border-white/5 text-sm cursor-pointer hover:bg-[#2a2a2d] transition-colors">
            <span>Last 6 Months</span>
            <ChevronDown size={14} className="text-[#8b8b93]" />
          </div>
          <button className="w-10 h-10 rounded-xl bg-[#202022] hover:bg-[#2a2a2d] transition-colors flex items-center justify-center text-[#8b8b93] border border-white/5">
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <KPICard title="Total Pipeline Sourced" value="$12.4M" change="+14.2%" icon={<Target size={20} className="text-indigo-400" />} />
        <KPICard title="Closed Won Revenue" value="$3.2M" change="+8.1%" icon={<DollarSign size={20} className="text-green-400" />} />
        <KPICard title="Customer Acquisition Cost" value="$4,200" change="-12.5%" icon={<TrendingUp size={20} className="text-orange-400" />} />
        <KPICard title="Total Touches to Close" value="14.2" change="-2.1" icon={<Users size={20} className="text-blue-400" />} />
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Revenue by Channel (Area Chart) */}
        <div className="col-span-8 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-white font-semibold">Revenue by Touchpoint Channel (Last Touch)</h2>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#202022] border border-white/5 text-xs text-[#8b8b93] cursor-pointer hover:bg-[#2a2a2d]">
              <span>Model: Last Touch</span>
              <ChevronDown size={12} />
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrganic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b8b93' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b8b93' }} tickFormatter={(value) => `$${value/1000}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                <Area type="monotone" dataKey="organic" name="Organic Inbound" stroke="#818cf8" fillOpacity={1} fill="url(#colorOrganic)" />
                <Area type="monotone" dataKey="paid" name="Paid Media" stroke="#34d399" fillOpacity={1} fill="url(#colorPaid)" />
                <Area type="monotone" dataKey="outbound" name="AI Outbound" stroke="#fb923c" fillOpacity={1} fill="url(#colorOutbound)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Signal Source ROI (Bar Chart) */}
        <div className="col-span-4 bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-6">ROI by Signal Source</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={signalROI} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8b8b93' }} tickFormatter={(value) => `${value}%`} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#e2e2e5' }} width={90} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: '#202022', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}
                  formatter={(value: any) => [`${value}%`, 'ROI']}
                />
                <Bar dataKey="roi" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={24}>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Top Campaigns Table */}
      <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
         <h2 className="text-white font-semibold mb-6">Top Performing Campaigns</h2>
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="border-b border-white/5 text-[#8b8b93] text-sm">
                     <th className="pb-3 font-medium">Campaign Name</th>
                     <th className="pb-3 font-medium">Channel</th>
                     <th className="pb-3 font-medium">Spend</th>
                     <th className="pb-3 font-medium">Pipeline</th>
                     <th className="pb-3 font-medium">Closed Won</th>
                     <th className="pb-3 font-medium text-right">ROI</th>
                  </tr>
               </thead>
               <tbody className="text-sm">
                  <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                     <td className="py-4 text-white">Q3 Procore Bid Outbound</td>
                     <td className="py-4 text-[#8b8b93]">Email Sequence</td>
                     <td className="py-4 text-[#e2e2e5]">$1,200</td>
                     <td className="py-4 text-[#e2e2e5]">$450,000</td>
                     <td className="py-4 text-white font-medium">$125,000</td>
                     <td className="py-4 text-green-400 text-right font-medium">104x</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                     <td className="py-4 text-white">Retargeting: Site Trailers</td>
                     <td className="py-4 text-[#8b8b93]">LinkedIn Ads</td>
                     <td className="py-4 text-[#e2e2e5]">$8,500</td>
                     <td className="py-4 text-[#e2e2e5]">$210,000</td>
                     <td className="py-4 text-white font-medium">$45,000</td>
                     <td className="py-4 text-green-400 text-right font-medium">5.2x</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                     <td className="py-4 text-white">Odin AI Automated SMS</td>
                     <td className="py-4 text-[#8b8b93]">Twilio SMS</td>
                     <td className="py-4 text-[#e2e2e5]">$450</td>
                     <td className="py-4 text-[#e2e2e5]">$180,000</td>
                     <td className="py-4 text-white font-medium">$60,000</td>
                     <td className="py-4 text-green-400 text-right font-medium">133x</td>
                  </tr>
               </tbody>
            </table>
         </div>
      </div>

    </div>
  );
}

function KPICard({ title, value, change, icon }: { title: string, value: string, change: string, icon: React.ReactNode }) {
  const isPositive = change.startsWith('+');
  return (
    <div className="bg-[#1a1a1c] border border-white/5 rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#202022] flex items-center justify-center border border-white/5">
          {icon}
        </div>
        <div className={`text-xs font-medium px-2 py-1 rounded-md ${isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {change}
        </div>
      </div>
      <div>
        <p className="text-sm text-[#8b8b93] mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-white">{value}</h3>
      </div>
    </div>
  );
}
