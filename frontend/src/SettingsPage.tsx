import { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Users, Loader2, AlertCircle, Shield, Crown, UserCheck } from 'lucide-react';
import { teamsApi, usersApi, type UserProfile, type TeamWithMembers } from './api';

interface SettingsPageProps {
  userProfile: UserProfile;
}

const ROLE_ORDER: Record<string, number> = { director: 0, manager: 1, rep: 2 };

function getRoleBadge(role: string) {
  switch (role) {
    case 'director':
      return { style: 'bg-purple-500/15 text-purple-400', icon: Crown };
    case 'manager':
      return { style: 'bg-blue-500/15 text-blue-400', icon: Shield };
    default:
      return { style: 'bg-green-500/15 text-green-400', icon: UserCheck };
  }
}

function getRoleBorder(role: string) {
  switch (role) {
    case 'director': return 'border-l-purple-500/50';
    case 'manager': return 'border-l-blue-500/50';
    default: return 'border-l-green-500/50';
  }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function SettingsPage({ userProfile }: SettingsPageProps) {
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [saving, setSaving] = useState(false);

  const isDirector = userProfile.role === 'director';

  const fetchData = () => {
    setLoading(true);
    Promise.all([teamsApi.list(), usersApi.list()])
      .then(([teamsRes, usersRes]) => {
        setTeams(teamsRes.data);
        setAllUsers(usersRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const teamUserIds = new Set(teams.flatMap(t => t.members.map(m => m.id)));
  const unassignedUsers = allUsers.filter(u => !teamUserIds.has(u.id));

  const handleUpdateUser = (userId: string, data: { role?: string; team_id?: string | null }) => {
    usersApi.update(userId, data).then(() => fetchData()).catch(() => {});
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    setSaving(true);
    teamsApi.create({ name: newTeamName.trim() })
      .then(() => {
        setNewTeamName('');
        setShowCreateTeam(false);
        fetchData();
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleDeleteTeam = (teamId: string, teamName: string) => {
    if (!confirm(`Delete team "${teamName}"? Members will become unassigned.`)) return;
    teamsApi.delete(teamId).then(() => fetchData()).catch(() => {});
  };

  const sortedMembers = (members: UserProfile[]) =>
    [...members].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

  const renderUserRow = (member: UserProfile, indent: boolean = false) => {
    const badge = getRoleBadge(member.role);
    const BadgeIcon = badge.icon;
    return (
      <div
        key={member.id}
        className={`flex items-center justify-between p-4 bg-[#141416] border border-white/5 rounded-xl border-l-4 ${getRoleBorder(member.role)} ${indent && member.role === 'rep' ? 'ml-6' : ''}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#202022] flex items-center justify-center text-xs font-semibold text-white border border-white/10 shrink-0">
            {getInitials(member.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">{member.name}</span>
              <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.style} shrink-0`}>
                <BadgeIcon size={10} />
                {member.role}
              </span>
              {member.id === userProfile.id && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 shrink-0">you</span>
              )}
            </div>
            <span className="text-xs text-[#8b8b93] truncate block">{member.email}</span>
          </div>
        </div>

        {isDirector && (
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <select
              value={member.role}
              onChange={(e) => handleUpdateUser(member.id, { role: e.target.value })}
              className="bg-[#1a1a1c] border border-white/10 rounded-lg text-xs py-1.5 px-2 text-[#e2e2e5] focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="rep">Rep</option>
              <option value="manager">Manager</option>
              <option value="director">Director</option>
            </select>
            <select
              value={member.team_id || ''}
              onChange={(e) => handleUpdateUser(member.id, { team_id: e.target.value || null })}
              className="bg-[#1a1a1c] border border-white/10 rounded-lg text-xs py-1.5 px-2 text-[#e2e2e5] focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">Unassigned</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Settings size={22} className="text-[#8b8b93]" />
              <h1 className="text-2xl font-semibold text-white">Settings</h1>
            </div>
            <p className="text-sm text-[#8b8b93] ml-[34px]">User &amp; Team Management</p>
          </div>
          {isDirector && (
            <button
              onClick={() => setShowCreateTeam(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
            >
              <Plus size={16} />
              Create Team
            </button>
          )}
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-6 mt-5 ml-[34px]">
          <div className="flex items-center gap-2 text-sm text-[#8b8b93]">
            <Users size={14} />
            <span>{allUsers.length} users</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#8b8b93]">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span>{allUsers.filter(u => u.role === 'director').length} directors</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#8b8b93]">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>{allUsers.filter(u => u.role === 'manager').length} managers</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#8b8b93]">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>{allUsers.filter(u => u.role === 'rep').length} reps</span>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* Team cards */}
        {teams.map(team => (
          <div key={team.id} className="bg-[#1a1a1c] rounded-[24px] border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/15 flex items-center justify-center">
                  <Users size={16} className="text-indigo-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">{team.name}</h2>
                <span className="text-xs text-[#8b8b93] bg-[#202022] px-2 py-0.5 rounded-full">
                  {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                </span>
              </div>
              {isDirector && (
                <button
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  className="p-2 text-[#8b8b93] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete team"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {team.members.length === 0 ? (
              <div className="text-sm text-[#8b8b93] text-center py-8 border border-dashed border-white/10 rounded-xl">
                No members assigned to this team
              </div>
            ) : (
              <div className="space-y-2">
                {sortedMembers(team.members).map(m => renderUserRow(m, true))}
              </div>
            )}
          </div>
        ))}

        {/* Unassigned users */}
        {unassignedUsers.length > 0 && (
          <div className="bg-[#1a1a1c] rounded-[24px] border border-white/5 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <AlertCircle size={16} className="text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Unassigned Users</h2>
              <span className="text-xs text-[#8b8b93] bg-[#202022] px-2 py-0.5 rounded-full">
                {unassignedUsers.length}
              </span>
            </div>
            <div className="space-y-2">
              {sortedMembers(unassignedUsers).map(m => renderUserRow(m))}
            </div>
          </div>
        )}

        {teams.length === 0 && unassignedUsers.length === 0 && (
          <div className="text-center py-20 text-[#8b8b93]">
            <Users size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">No teams or users found</p>
            <p className="text-sm mt-1">Create a team to get started</p>
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreateTeam(false)}>
          <div className="bg-[#1a1a1c] rounded-[24px] border border-white/10 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Create New Team</h3>
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
              className="w-full bg-[#141416] border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-[#8b8b93] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateTeam(false)}
                className="px-4 py-2.5 text-sm text-[#8b8b93] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={saving || !newTeamName.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
