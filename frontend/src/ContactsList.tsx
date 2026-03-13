import { useState, useEffect } from 'react';
import { Search, RefreshCw, Download, Filter, Mail, Phone, Building2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { contactsApi, type Contact } from './api';

function getRoleBadge(category: string | null) {
  switch (category) {
    case 'Decision Maker': return { color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'Evaluator': return { color: 'text-orange-400', bg: 'bg-orange-500/10' };
    case 'Primary PoC': return { color: 'text-indigo-400', bg: 'bg-indigo-500/20' };
    case 'Influencer': return { color: 'text-blue-400', bg: 'bg-blue-500/10' };
    default: return { color: 'text-gray-400', bg: 'bg-gray-500/10' };
  }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export default function ContactsList({ onContactClick, onCompanyClick }: { onContactClick?: (id: string) => void, onCompanyClick?: (id: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  const fetchContacts = (searchTerm?: string) => {
    setLoading(true);
    contactsApi.list({ search: searchTerm || undefined, limit: 100 })
      .then(res => {
        setContacts(res.data.items);
        setTotal(res.data.total);
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchContacts(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchContacts(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const sortedContacts = [...contacts].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#141416] text-[#e2e2e5]">

      {/* Header Area */}
      <div className="p-6 pb-2 border-b border-white/5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-8 h-8 rounded-md bg-[#202022] flex items-center justify-center pointer-events-none border border-white/5">
            <UsersIcon />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white inline-block">Contacts</h1>
            <span className="text-sm text-[#8b8b93] ml-3">{total} results</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <button className="flex items-center justify-between text-sm py-2 px-3 hover:bg-[#202022] rounded-md transition-colors min-w-[140px]">
              <span className="font-medium text-[#e2e2e5]">All Contacts</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8b93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b93]" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#1a1a1c] border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-500 w-64 text-white hover:border-white/20 transition-colors placeholder-[#8b8b93]"
              />
            </div>

            <button onClick={() => fetchContacts(search)} className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors">
              <RefreshCw size={14} className="text-[#8b8b93]" />
              Refresh
            </button>

            <button className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#202022] transition-colors">
              <Download size={14} className="text-[#8b8b93]" />
              Export
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2">
           <button className="flex items-center gap-2 px-3 py-1.5 bg-[#202022] border border-white/5 rounded-lg text-sm text-[#e2e2e5] hover:bg-[#2a2a2d] transition-colors">
              <Filter size={14} className="text-[#8b8b93]" />
              Filters
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#202022] rounded-lg text-sm text-[#8b8b93] transition-colors">
              Columns
            </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 text-xs font-medium text-[#8b8b93] uppercase tracking-wider">
        <div className="col-span-3 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Name</div>
        <div className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Company</div>
        <div className="col-span-3 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Contact Info</div>
        <div className="col-span-2 flex items-center justify-center gap-1 cursor-pointer hover:text-[#e2e2e5]">Role</div>
        <div
          className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-[#e2e2e5] group/sort"
          onClick={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
        >
          Added
          <div className="flex flex-col ml-1">
            <ChevronUp size={10} className={`${sortDirection === 'asc' ? 'text-indigo-400' : 'text-[#8b8b93] group-hover/sort:text-[#e2e2e5]'} -mb-1`} />
            <ChevronDown size={10} className={`${sortDirection === 'desc' ? 'text-indigo-400' : 'text-[#8b8b93] group-hover/sort:text-[#e2e2e5]'}`} />
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#8b8b93]">
            <Loader2 size={24} className="animate-spin mr-3" />
            <span>Loading contacts...</span>
          </div>
        ) : sortedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8b8b93]">
            <p className="text-lg mb-2">No contacts found</p>
            <p className="text-sm">Import contacts via CSV or add them to an account.</p>
          </div>
        ) : (
          sortedContacts.map((contact) => {
            const badge = getRoleBadge(contact.role_category);
            const initial = getInitials(contact.name);
            const dateStr = new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

            return (
              <div
                key={contact.id}
                onClick={() => onContactClick?.(contact.id)}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-[#1a1a1c] cursor-pointer transition-colors group items-center"
              >
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 flex items-center justify-center font-bold border border-indigo-500/20 flex-shrink-0">
                    {initial}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-[#e2e2e5] font-medium text-sm truncate group-hover:text-indigo-400 transition-colors">{contact.name}</h3>
                    <p className="text-xs text-[#8b8b93] truncate">{contact.title || 'No title'}</p>
                  </div>
                </div>

                <div
                  className="col-span-2 flex items-center gap-2 hover:text-indigo-400 transition-colors group/company cursor-pointer w-fit"
                  onClick={(e) => { e.stopPropagation(); if (contact.account_id) onCompanyClick?.(contact.account_id); }}
                >
                  <Building2 size={14} className="text-[#8b8b93] group-hover/company:text-indigo-400 shrink-0 transition-colors" />
                  <span className="text-[#e2e2e5] group-hover/company:text-indigo-400 text-sm truncate transition-colors hover:underline">{contact.account_name || 'Unknown'}</span>
                </div>

                <div className="col-span-3 flex flex-col justify-center space-y-1">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-sm text-[#8b8b93] truncate hover:text-[#e2e2e5] transition-colors">
                      <Mail size={12} className="shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-xs text-[#8b8b93] truncate">
                      <Phone size={12} className="shrink-0" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>

                <div className="col-span-2 flex justify-center items-center">
                  {contact.role_category ? (
                    <div className={`px-2.5 py-1 ${badge.bg} ${badge.color} rounded-md text-[10px] uppercase font-bold tracking-wider border border-white/5`}>
                      {contact.role_category}
                    </div>
                  ) : (
                    <span className="text-xs text-[#8b8b93]">-</span>
                  )}
                </div>

                <div className="col-span-2 flex flex-col justify-center">
                  <span className="text-xs text-[#8b8b93]">{dateStr}</span>
                  {contact.source && <span className="text-[10px] text-[#8b8b93] uppercase">{contact.source}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b8b93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  );
}
