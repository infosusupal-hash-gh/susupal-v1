import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, MoreVertical, UserX, UserCheck, Trash2, Key, Eye, X, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', variant = 'danger', onConfirm, onClose, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-fade-in">
        <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
        <p className="text-gray-500 text-sm mt-2">{message}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white transition disabled:opacity-60
              ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#059669] hover:bg-[#047857]'}`}
          >
            {loading ? 'Loading...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({ user, onClose }) {
  if (!user) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">User Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-lg">
              {user.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.name || 'N/A'}</p>
              <p className="text-sm text-gray-500">{user.phone}</p>
            </div>
            <div className="ml-auto">
              <Badge variant={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'Active' : 'Suspended'}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Email', value: user.email || 'N/A' },
              { label: 'Total Saved', value: GHS(user.total_saved) },
              { label: 'Active Plans', value: user.savingsPlans?.filter(p => p.status === 'ACTIVE').length || 0 },
              { label: 'Total Plans', value: user.savingsPlans?.length || 0 },
              { label: 'Last Login', value: user.last_login ? formatDistanceToNow(new Date(user.last_login), { addSuffix: true }) : 'Never' },
              { label: 'Registered', value: user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{String(value)}</p>
              </div>
            ))}
          </div>
          {user.transactions?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Recent Transactions</p>
              <div className="space-y-2">
                {user.transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-xl px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-700">{tx.type}</span>
                      <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">{GHS(tx.amount)}</p>
                      <Badge variant={tx.status === 'SUCCESS' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'warning'}>{tx.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({ user, onSuspend, onReactivate, onDelete, onResetPin, onView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-20 py-1 w-44 animate-fade-in" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { onView(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Eye className="w-4 h-4" />View Details</button>
          <button onClick={() => { onResetPin(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Key className="w-4 h-4" />Reset PIN</button>
          {user.is_active
            ? <button onClick={() => { onSuspend(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-amber-600 hover:bg-amber-50"><UserX className="w-4 h-4" />Suspend</button>
            : <button onClick={() => { onReactivate(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"><UserCheck className="w-4 h-4" />Reactivate</button>
          }
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button onClick={() => { onDelete(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" />Delete User</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modal, setModal] = useState(null); // { type, user }
  const [selectedUser, setSelectedUser] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, status],
    queryFn: async () => {
      const { data } = await adminApi.get('/users', { params: { page, limit: 20, search, status } });
      return data;
    },
    keepPreviousData: true,
  });

  const { data: userDetail } = useQuery({
    queryKey: ['admin-user-detail', selectedUser?.id],
    queryFn: async () => { const { data } = await adminApi.get(`/users/${selectedUser.id}`); return data; },
    enabled: !!selectedUser,
  });

  const mutation = useMutation({
    mutationFn: async ({ type, id }) => {
      if (type === 'suspend') return adminApi.post(`/users/${id}/suspend`);
      if (type === 'reactivate') return adminApi.post(`/users/${id}/reactivate`);
      if (type === 'delete') return adminApi.delete(`/users/${id}`);
      if (type === 'reset-pin') return adminApi.post(`/users/${id}/reset-pin`);
    },
    onSuccess: (_, { type }) => {
      const msgs = { suspend: 'User suspended', reactivate: 'User reactivated', delete: 'User deleted', 'reset-pin': 'PIN reset' };
      toast.success(msgs[type]);
      qc.invalidateQueries(['admin-users']);
      setModal(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Action failed'),
  });

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  return (
    <Layout title="User Management">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        {/* Toolbar */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, phone or email..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-[#059669] text-white text-sm font-medium rounded-xl hover:bg-[#047857] transition">Search</button>
          </form>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <a href={`${process.env.REACT_APP_API_URL || '/api'}/admin/export/users`}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              <Download className="w-4 h-4" /> Export
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>User</Th><Th>Phone</Th><Th>Email</Th><Th>Status</Th>
                <Th>Total Saved</Th><Th>Active Plans</Th><Th>Last Login</Th>
                <Th>Registered</Th><Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <Tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></Td>
                    ))}
                  </Tr>
                ))
              ) : !data?.data?.length ? (
                <EmptyRow colSpan={9} message="No users found" />
              ) : (
                data.data.map((user) => (
                  <Tr key={user.id} onClick={() => setSelectedUser(user)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-gray-800">{user.name || 'N/A'}</span>
                      </div>
                    </Td>
                    <Td className="font-mono text-xs">{user.phone}</Td>
                    <Td className="text-gray-500 text-xs">{user.email || '—'}</Td>
                    <Td><Badge variant={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'Active' : 'Suspended'}</Badge></Td>
                    <Td className="font-medium">{GHS(user.total_saved)}</Td>
                    <Td className="text-center">{user.active_plans}</Td>
                    <Td className="text-gray-500 text-xs">{user.last_login ? formatDistanceToNow(new Date(user.last_login), { addSuffix: true }) : 'Never'}</Td>
                    <Td className="text-gray-500 text-xs">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</Td>
                    <Td>
                      <ActionMenu
                        user={user}
                        onView={() => setSelectedUser(user)}
                        onSuspend={() => setModal({ type: 'suspend', user })}
                        onReactivate={() => setModal({ type: 'reactivate', user })}
                        onDelete={() => setModal({ type: 'delete', user })}
                        onResetPin={() => setModal({ type: 'reset-pin', user })}
                      />
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
          {data?.pagination && (
            <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={20} onChange={setPage} />
          )}
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={modal?.type === 'suspend'}
        title="Suspend User"
        message={`Are you sure you want to suspend ${modal?.user?.name || modal?.user?.phone}? They will not be able to log in.`}
        confirmLabel="Suspend"
        variant="danger"
        loading={mutation.isLoading}
        onConfirm={() => mutation.mutate({ type: 'suspend', id: modal.user.id })}
        onClose={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === 'reactivate'}
        title="Reactivate User"
        message={`Reactivate ${modal?.user?.name || modal?.user?.phone}?`}
        confirmLabel="Reactivate"
        variant="success"
        loading={mutation.isLoading}
        onConfirm={() => mutation.mutate({ type: 'reactivate', id: modal.user.id })}
        onClose={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === 'delete'}
        title="Delete User"
        message={`This will soft-delete ${modal?.user?.name || modal?.user?.phone}. Transaction history will be preserved.`}
        confirmLabel="Delete"
        variant="danger"
        loading={mutation.isLoading}
        onConfirm={() => mutation.mutate({ type: 'delete', id: modal.user.id })}
        onClose={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === 'reset-pin'}
        title="Reset PIN"
        message={`Reset the PIN for ${modal?.user?.name || modal?.user?.phone}? They will need to set a new PIN on next login.`}
        confirmLabel="Reset PIN"
        variant="danger"
        loading={mutation.isLoading}
        onConfirm={() => mutation.mutate({ type: 'reset-pin', id: modal.user.id })}
        onClose={() => setModal(null)}
      />

      <UserDetailModal
        user={selectedUser ? (userDetail || selectedUser) : null}
        onClose={() => setSelectedUser(null)}
      />
    </Layout>
  );
}