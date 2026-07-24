import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-xl transition ${active ? 'bg-[#059669] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
      {children}
    </button>
  );
}

export default function PayoutsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: ['payouts-upcoming', page],
    queryFn: async () => { const { data } = await adminApi.get('/payouts/upcoming', { params: { page, limit: 20 } }); return data; },
    enabled: tab === 'upcoming',
    keepPreviousData: true,
  });

  const { data: completed, isLoading: completedLoading } = useQuery({
    queryKey: ['payouts-completed', page],
    queryFn: async () => { const { data } = await adminApi.get('/payouts/completed', { params: { page, limit: 20 } }); return data; },
    enabled: tab === 'completed',
    keepPreviousData: true,
  });

  const { data: failed, isLoading: failedLoading } = useQuery({
    queryKey: ['payouts-failed', page],
    queryFn: async () => { const { data } = await adminApi.get('/payouts/failed', { params: { page, limit: 20 } }); return data; },
    enabled: tab === 'failed',
    keepPreviousData: true,
  });

  const retryMutation = useMutation({
    mutationFn: (id) => adminApi.post('/payouts/retry-failed', { transaction_id: id }),
    onSuccess: () => { toast.success('Retry queued'); qc.invalidateQueries(['payouts-failed']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Retry failed'),
  });

  const switchTab = (t) => { setTab(t); setPage(1); };
  const exportBase = process.env.REACT_APP_API_URL || '/api';

  return (
    <Layout title="Payout Management">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        {/* Tabs */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <TabBtn active={tab === 'upcoming'} onClick={() => switchTab('upcoming')}>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Upcoming</span>
            </TabBtn>
            <TabBtn active={tab === 'completed'} onClick={() => switchTab('completed')}>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />Completed</span>
            </TabBtn>
            <TabBtn active={tab === 'failed'} onClick={() => switchTab('failed')}>
              <span className="flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" />Failed</span>
            </TabBtn>
          </div>
          <a href={`${exportBase}/admin/export/payouts`}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            <Download className="w-4 h-4" /> Export Excel
          </a>
        </div>

        {/* Upcoming Payouts */}
        {tab === 'upcoming' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <Thead>
                <tr><Th>User</Th><Th>Phone</Th><Th>Daily Amount</Th><Th>Duration</Th><Th>Payout Amount</Th><Th>Method</Th><Th>End Date</Th><Th>Days Left</Th></tr>
              </Thead>
              <Tbody>
                {upcomingLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <Tr key={i}>{Array.from({ length: 8 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></Td>)}</Tr>
                )) : !upcoming?.data?.length ? (
                  <EmptyRow colSpan={8} message="No upcoming payouts" />
                ) : (
                  upcoming.data.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium text-gray-800">{p.user_name || 'N/A'}</Td>
                      <Td className="font-mono text-xs text-gray-500">{p.user_phone}</Td>
                      <Td>{GHS(p.daily_amount)}</Td>
                      <Td className="text-center">{p.duration} days</Td>
                      <Td className="font-semibold text-emerald-700">{GHS(p.payout_amount)}</Td>
                      <Td>{p.payout_method || 'N/A'}</Td>
                      <Td className="text-xs text-gray-500">{new Date(p.end_date).toLocaleDateString()}</Td>
                      <Td>
                        <span className={`font-medium text-sm ${p.days_remaining <= 1 ? 'text-red-500' : p.days_remaining <= 3 ? 'text-amber-500' : 'text-gray-700'}`}>
                          {p.days_remaining === 0 ? 'Tomorrow' : p.days_remaining === 1 ? '1 day' : `${p.days_remaining} days`}
                          {p.days_remaining <= 1 && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                        </span>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
            {upcoming?.pagination && <Pagination page={upcoming.pagination.page} pages={upcoming.pagination.pages} total={upcoming.pagination.total} limit={20} onChange={setPage} />}
          </div>
        )}

        {/* Completed Payouts */}
        {tab === 'completed' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <Thead>
                <tr><Th>Reference</Th><Th>User</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></tr>
              </Thead>
              <Tbody>
                {completedLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <Tr key={i}>{Array.from({ length: 5 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></Td>)}</Tr>
                )) : !completed?.data?.length ? (
                  <EmptyRow colSpan={5} message="No completed payouts" />
                ) : (
                  completed.data.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-mono text-xs text-gray-500 max-w-[200px] truncate">{p.reference}</Td>
                      <Td>
                        <div>
                          <p className="font-medium text-sm">{p.user_name || 'N/A'}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.user_phone}</p>
                        </div>
                      </Td>
                      <Td className="font-semibold text-emerald-700">{GHS(p.amount)}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString()}</Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
            {completed?.pagination && <Pagination page={completed.pagination.page} pages={completed.pagination.pages} total={completed.pagination.total} limit={20} onChange={setPage} />}
          </div>
        )}

        {/* Failed Payouts */}
        {tab === 'failed' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <Thead>
                <tr><Th>Reference</Th><Th>User</Th><Th>Amount</Th><Th>Retries</Th><Th>Date</Th><Th>Action</Th></tr>
              </Thead>
              <Tbody>
                {failedLoading ? Array.from({ length: 4 }).map((_, i) => (
                  <Tr key={i}>{Array.from({ length: 6 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></Td>)}</Tr>
                )) : !failed?.data?.length ? (
                  <EmptyRow colSpan={6} message="No failed payouts" />
                ) : (
                  failed.data.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-mono text-xs text-gray-500 max-w-[180px] truncate">{p.reference}</Td>
                      <Td>
                        <div>
                          <p className="font-medium text-sm">{p.user_name || 'N/A'}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.user_phone}</p>
                        </div>
                      </Td>
                      <Td className="font-semibold text-gray-800">{GHS(p.amount)}</Td>
                      <Td>
                        <span className={`text-sm font-medium ${p.retry_count >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.retry_count}x
                        </span>
                      </Td>
                      <Td className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString()}</Td>
                      <Td>
                        <button
                          onClick={() => retryMutation.mutate(p.id)}
                          disabled={retryMutation.isLoading || p.retry_count >= 3}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
            {failed?.pagination && <Pagination page={failed.pagination.page} pages={failed.pagination.pages} total={failed.pagination.total} limit={20} onChange={setPage} />}
          </div>
        )}
      </div>
    </Layout>
  );
}