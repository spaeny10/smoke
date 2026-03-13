import { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Phone, Building2, Edit2, Check, X, User, Clock, MessageSquare, Loader2 } from 'lucide-react';
import { contactsApi, type Contact } from './api';

interface ContactDetailProps {
  contactId: string;
  onNavigate: (tab: string) => void;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function getRoleBadge(category: string | null) {
  switch (category) {
    case 'Decision Maker': return { color: 'text-green-400', bg: 'bg-green-500/10' };
    case 'Evaluator': return { color: 'text-orange-400', bg: 'bg-orange-500/10' };
    case 'Primary PoC': return { color: 'text-indigo-400', bg: 'bg-indigo-500/20' };
    case 'Influencer': return { color: 'text-blue-400', bg: 'bg-blue-500/10' };
    default: return { color: 'text-gray-400', bg: 'bg-gray-500/10' };
  }
}

export default function ContactDetail({ contactId, onNavigate }: ContactDetailProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', title: '', email: '', phone: '' });

  useEffect(() => {
    setLoading(true);
    contactsApi.get(contactId)
      .then(res => {
        setContact(res.data);
        setEditForm({ name: res.data.name, title: res.data.title || '', email: res.data.email || '', phone: res.data.phone || '' });
      })
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [contactId]);

  const handleSave = () => {
    if (!contact) return;
    contactsApi.update(contact.id, {
      name: editForm.name,
      title: editForm.title || undefined,
      email: editForm.email || undefined,
      phone: editForm.phone || undefined,
    }).then(res => {
      setContact(res.data);
      setIsEditing(false);
    });
  };

  const handleCancel = () => {
    if (!contact) return;
    setEditForm({ name: contact.name, title: contact.title || '', email: contact.email || '', phone: contact.phone || '' });
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#141416] text-[#8b8b93]">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span>Loading contact...</span>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#141416] text-[#8b8b93]">
        <p className="text-lg mb-4">Contact not found</p>
        <button onClick={() => onNavigate('contacts')} className="text-indigo-400 hover:underline">Back to Contacts</button>
      </div>
    );
  }

  const badge = getRoleBadge(contact.role_category);
  const initial = getInitials(contact.name);
  const dateStr = new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#141416] text-[#e2e2e5]">

      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-10 bg-[#141416]/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('contacts')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#202022] text-[#8b8b93] hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#8b8b93] cursor-pointer hover:text-white transition-colors" onClick={() => onNavigate('contacts')}>Contacts</span>
            <span className="text-[#8b8b93]">/</span>
            <span className="text-[#e2e2e5] font-medium">{contact.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <button onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#8b8b93] hover:text-white hover:bg-[#202022] transition-colors">
                <X size={16} /> Cancel
              </button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-lg shadow-indigo-500/20">
                <Check size={16} /> Save Changes
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#202022] hover:bg-[#2a2a2d] border border-white/5 text-white transition-colors">
              <Edit2 size={16} /> Edit Contact
            </button>
          )}
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto space-y-6">

        {/* Profile Header Card */}
        <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

          <div className="flex items-start gap-6 relative z-10">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 flex items-center justify-center text-3xl font-bold border border-indigo-500/20 flex-shrink-0 shadow-inner">
              {initial}
            </div>

            <div className="flex-1 pt-1">
              <div className="flex items-center gap-3 mb-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="text-2xl font-semibold bg-[#141416] border border-indigo-500/50 rounded-md px-3 py-1 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full max-w-md"
                  />
                ) : (
                  <h1 className="text-2xl font-semibold text-white tracking-tight">{contact.name}</h1>
                )}
                {contact.role_category && (
                  <div className={`px-2.5 py-1 ${badge.bg} ${badge.color} rounded-md text-[10px] uppercase font-bold tracking-wider border border-white/5 ml-2`}>
                    {contact.role_category}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6 mt-4 text-[#8b8b93]">
                <div className="flex items-center gap-2">
                  <User size={16} />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="text-sm bg-[#141416] border border-white/10 rounded-md px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <span className="text-sm">{contact.title || 'No title'}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-indigo-400 transition-colors" onClick={() => !isEditing && onNavigate('companyDetail')}>
                  <Building2 size={16} />
                  <span className="text-sm hover:underline">{contact.account_name || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-3 gap-6">

          {/* Left Column - Contact Details */}
          <div className="col-span-1 space-y-6">
            <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                <Mail size={16} className="text-indigo-400" />
                Contact Information
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#8b8b93] font-medium uppercase tracking-wider mb-1 block">Email Address</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="text-sm bg-[#141416] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-indigo-500 w-full"
                    />
                  ) : (
                    <a href={`mailto:${contact.email}`} className="text-sm text-[#e2e2e5] hover:text-indigo-400 hover:underline transition-colors block p-2 -ml-2 rounded-md hover:bg-[#202022]">
                      {contact.email || 'Not provided'}
                    </a>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#8b8b93] font-medium uppercase tracking-wider mb-1 block">Phone Number</label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="text-sm bg-[#141416] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-indigo-500 w-full"
                    />
                  ) : (
                    <a href={`tel:${contact.phone}`} className="text-sm text-[#e2e2e5] hover:text-indigo-400 hover:underline transition-colors block p-2 -ml-2 rounded-md hover:bg-[#202022]">
                      {contact.phone || 'Not provided'}
                    </a>
                  )}
                </div>

                <div className="pt-4 border-t border-white/5">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#202022] hover:bg-indigo-600 border border-white/5 hover:border-indigo-500 rounded-lg text-sm text-white transition-all group">
                    <MessageSquare size={16} className="text-[#8b8b93] group-hover:text-white transition-colors" />
                    Send Message
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-medium text-white mb-4">Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-[#8b8b93]">
                  <span>Source</span>
                  <span className="text-[#e2e2e5]">{contact.source || 'Unknown'}</span>
                </div>
                <div className="flex justify-between text-[#8b8b93]">
                  <span>Added</span>
                  <span className="text-[#e2e2e5]">{dateStr}</span>
                </div>
                <div className="flex justify-between text-[#8b8b93]">
                  <span>Email Verified</span>
                  <span className="text-[#e2e2e5]">{contact.email_verified ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Activity */}
          <div className="col-span-2 space-y-6">

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#202022] flex items-center justify-center border border-white/5">
                  <Building2 size={20} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-[#8b8b93] font-medium uppercase tracking-wider mb-1">Company</p>
                  <p className="text-lg font-bold text-white">{contact.account_name || 'Unknown'}</p>
                </div>
              </div>

              <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#202022] flex items-center justify-center border border-white/5">
                  <Clock size={20} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-[#8b8b93] font-medium uppercase tracking-wider mb-1">Added On</p>
                  <p className="text-lg font-bold text-white tracking-tight">{dateStr}</p>
                </div>
              </div>
            </div>

            {/* Activity Placeholder */}
            <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-5 h-80 overflow-y-auto">
              <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#1a1a1c] pb-2 z-10 border-b border-white/5">
                <h3 className="text-sm font-medium text-white">Recent Activity</h3>
              </div>

              <div className="flex flex-col items-center justify-center py-12 text-[#8b8b93]">
                <MessageSquare size={32} className="mb-4 opacity-30" />
                <p className="text-sm">Activity tracking coming soon</p>
                <p className="text-xs mt-1">Emails, calls, and meetings will appear here.</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
