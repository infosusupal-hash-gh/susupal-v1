import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ShieldCheck, X, Pencil, Save, BadgeCheck, XCircle,
  Loader2, ClipboardList, RefreshCw,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

function RequestStatusBadge({ status }) {
  const map = {
    PENDING_REVIEW: { variant: 'warning', label: 'Pending Review' },
    APPROVED: { variant: 'success', label: 'Approved' },
    REJECTED: { variant: 'danger', label: 'Rejected' },
  };
  const { variant, label } = map[status] || { variant: 'default', label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Verify modal: edit korapay ref + verify against Korapay ──────────────────
function VerifyModal({ item, onClose }) {
  // item: { transaction: {...}, request?: {...} }
  const tx = item?.transaction;
  const queryClient = useQueryClient();
  const [korapayRef, setKorapayRef] = useState(tx?.korapay_ref || '');
  const [editing, setEditing] = useState(!tx?.korapay_ref);
  const [savedRef, setSavedRef] = useState(tx?.korapay_ref || '');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recon-requests'] });
    queryClient.invalidateQueries({ queryKey: ['recon-search'] });
    queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await adminApi.put(
        `/reconciliation/transactions/${tx.id}/korapay-ref`,
        { korapay_ref: korapayRef.trim() }
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Korapay reference saved');
      setSavedRef(korapayRef.trim());
      setEditing(false);
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save reference'),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await adminApi.post(`/reconciliation/transactions/${tx.id}/verify`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Payment verified successfully');
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Verification failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await adminApi.post(
        `/reconciliation/requests/${item.request.id}/reject`,
        { notes: 'Payment could not be verified with Korapay.' }
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Request rejected');
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to reject request'),
  });

  if (!tx) return null;

  const busy = saveMutation.isPending || verifyMutation.isPending || rejectMutation.isPending;
  const isPendingTx = tx.status === 'PENDING' || tx.status === 'FAILED';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
            </div>
            <h2 className="font-semibold text-gray-900">Manual Payment Verification</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-lg hover:bg-gray-100 transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Transaction summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            {[
              { label: 'SusuPal Reference', value: tx.reference, mono: true },
              { label: 'User', value: item.user_name || 'N/A' },
              { label: 'Phone', value: item.user_phone || 'N/A', mono: true },
              { label: 'Amount', value: GHS(tx.amount) },
              { label: 'Created', value: tx.created_at ? new Date(tx.created_at).toLocaleString() : '—' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between items-start gap-4">
                <span className="text-xs font-medium text-gray-500 flex-shrink-0">{label}</span>
                <span className={`text-sm text-gray-800 font-medium text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center gap-4">
              <span className="text-xs font-medium text-gray-500">Transaction Status</span>
              <StatusBadge status={tx.status} />
            </div>
            {item.request && (
              <div className="flex justify-between items-center gap-4">
                <span className="text-xs font-medium text-gray-500">Request Status</span>
                <RequestStatusBadge status={item.request.status} />
              </div>
            )}
          </div>

          {/* Korapay reference (view / edit / save) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Korapay Reference</label>
            <div className="flex gap-2">
              <input
                value={korapayRef}
                onChange={(e) => setKorapayRef(e.target.value)}
                readOnly={!editing}
                placeholder="e.g. KPY-PAY-Lgf4RTCBcbzG"
                spellCheck="false"
                className={`flex-1 px-3 py-2 text-sm font-mono border rounded-xl focus:outline-none transition ${
                  editing
                    ? 'border-emerald-300 focus:ring-2 focus:ring-emerald-500 bg-white'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }`}
              />
              {editing ? (
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={busy || !korapayRef.trim() || korapayRef.trim().length < 6}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#059669] text-white text-sm font-medium rounded-xl hover:bg-[#047857] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
              )}
            </div>
            {item.request && item.request.korapay_reference && item.request.korapay_reference !== korapayRef && (
              <p className="text-xs text-amber-600 mt-1.5">
                User submitted: <span className="font-mono">{item.request.korapay_reference}</span>{' '}
                <button
                  className="underline font-medium"
                  onClick={() => { setKorapayRef(item.request.korapay_reference); setEditing(true); }}
                >
                  use this
                </button>
              </p>
            )}
          </div>

          {/* Actions */}
          {isPendingTx ? (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={busy || editing || !savedRef}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#059669] text-white text-sm font-semibold rounded-xl hover:bg-[#047857] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              >
                {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                {verifyMutation.isPending ? 'Verifying with Korapay...' : 'Verify Payment'}
              </button>
              {!savedRef && !editing && (
                <p className="text-xs text-gray-400 text-center">Save a Korapay reference before verifying.</p>
              )}
              {editing && (
                <p className="text-xs text-gray-400 text-center">Save your changes before verifying.</p>
              )}
              {item.request && item.request.status === 'PENDING_REVIEW' && (
                <button
                  onClick={() => rejectMutation.mutate()}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 disabled:opacity-50 transition"
                >
                  {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject Request
                </button>
              )}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700 text-center font-medium">
              This transaction is already {tx.status}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReconciliationPage() {
  const [tab, setTab] = useState('requests'); // requests | search
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('PENDING_REVIEW');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['recon-requests', page, statusFilter],
    queryFn: async () => {
      const { data } = await adminApi.get('/reconciliation/requests', {
        params: { page, limit: 20, status: statusFilter },
      });
      return data;
    },
    keepPreviousData: true,
    enabled: tab === 'requests',
  });

  const searchQuery = useQuery({
    queryKey: ['recon-search', searchTerm],
    queryFn: async () => {
      const { data } = await adminApi.get('/reconciliation/search', {
        params: { reference: searchTerm },
      });
      return data;
    },
    enabled: tab === 'search' && !!searchTerm,
  });

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const pendingCount = requestsQuery.data?.pending_count ?? 0;

  return (
    <Layout title="Payment Reconciliation">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'requests'
                ? 'bg-[#059669] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Confirmation Requests
            {pendingCount > 0 && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${tab === 'requests' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'search'
                ? 'bg-[#059669] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Search className="w-4 h-4" />
            Search Transaction
          </button>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['recon-requests'] })}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {tab === 'requests' && (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white"
              >
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="">All Requests</option>
              </select>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <Table>
                <Thead>
                  <tr>
                    <Th>User</Th><Th>SusuPal Reference</Th><Th>Korapay Reference</Th>
                    <Th>Amount</Th><Th>Tx Status</Th><Th>Request Status</Th><Th>Submitted</Th><Th></Th>
                  </tr>
                </Thead>
                <Tbody>
                  {requestsQuery.isLoading ? Array.from({ length: 6 }).map((_, i) => (
                    <Tr key={i}>{Array.from({ length: 8 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></Td>)}</Tr>
                  )) : !requestsQuery.data?.data?.length ? (
                    <EmptyRow colSpan={8} message="No confirmation requests found" />
                  ) : (
                    requestsQuery.data.data.map((r) => (
                      <Tr key={r.id}>
                        <Td>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{r.user_name || 'N/A'}</p>
                            <p className="text-xs text-gray-400 font-mono">{r.user_phone}</p>
                          </div>
                        </Td>
                        <Td className="font-mono text-xs text-gray-500 max-w-[180px] truncate" title={r.transaction?.reference}>{r.transaction?.reference}</Td>
                        <Td className="font-mono text-xs text-gray-500 max-w-[160px] truncate" title={r.korapay_reference}>{r.korapay_reference}</Td>
                        <Td className="font-semibold text-gray-900">{GHS(r.transaction?.amount)}</Td>
                        <Td><StatusBadge status={r.transaction?.status} /></Td>
                        <Td><RequestStatusBadge status={r.status} /></Td>
                        <Td className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</Td>
                        <Td>
                          <button
                            onClick={() => setSelected({
                              transaction: r.transaction,
                              request: r,
                              user_name: r.user_name,
                              user_phone: r.user_phone,
                            })}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Review
                          </button>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
              {requestsQuery.data?.pagination && (
                <Pagination
                  page={requestsQuery.data.pagination.page}
                  pages={requestsQuery.data.pagination.pages}
                  total={requestsQuery.data.pagination.total}
                  limit={20}
                  onChange={setPage}
                />
              )}
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by SusuPal reference (e.g. SUSU-9d9b6d45-...) or Korapay reference..."
                    spellCheck="false"
                    className="w-full pl-9 pr-4 py-2 text-sm font-mono border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button type="submit" className="px-4 py-2 bg-[#059669] text-white text-sm font-medium rounded-xl hover:bg-[#047857] transition">
                  Search
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <Table>
                <Thead>
                  <tr>
                    <Th>User</Th><Th>SusuPal Reference</Th><Th>Korapay Reference</Th>
                    <Th>Amount</Th><Th>Status</Th><Th>Request</Th><Th>Created</Th><Th></Th>
                  </tr>
                </Thead>
                <Tbody>
                  {searchQuery.isFetching ? Array.from({ length: 3 }).map((_, i) => (
                    <Tr key={i}>{Array.from({ length: 8 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></Td>)}</Tr>
                  )) : !searchTerm ? (
                    <EmptyRow colSpan={8} message="Enter a reference above to find a transaction" />
                  ) : !searchQuery.data?.data?.length ? (
                    <EmptyRow colSpan={8} message="No transactions match that reference" />
                  ) : (
                    searchQuery.data.data.map((t) => {
                      const latestRequest = t.confirmation_requests?.[0] || null;
                      return (
                        <Tr key={t.id}>
                          <Td>
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{t.user_name || 'N/A'}</p>
                              <p className="text-xs text-gray-400 font-mono">{t.user_phone}</p>
                            </div>
                          </Td>
                          <Td className="font-mono text-xs text-gray-500 max-w-[180px] truncate" title={t.reference}>{t.reference}</Td>
                          <Td className="font-mono text-xs text-gray-500 max-w-[160px] truncate" title={t.korapay_ref}>{t.korapay_ref || '—'}</Td>
                          <Td className="font-semibold text-gray-900">{GHS(t.amount)}</Td>
                          <Td><StatusBadge status={t.status} /></Td>
                          <Td>{latestRequest ? <RequestStatusBadge status={latestRequest.status} /> : <span className="text-xs text-gray-400">—</span>}</Td>
                          <Td className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</Td>
                          <Td>
                            <button
                              onClick={() => setSelected({
                                transaction: t,
                                request: latestRequest,
                                user_name: t.user_name,
                                user_phone: t.user_phone,
                              })}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Verify
                            </button>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </Tbody>
              </Table>
            </div>
          </>
        )}
      </div>

      {selected && <VerifyModal item={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
}
