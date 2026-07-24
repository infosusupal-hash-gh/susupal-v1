import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, Download, Eye, X } from 'lucide-react';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

const txTypeColors = {
  CONTRIBUTION: 'info', PAYOUT: 'success', COMMISSION: 'purple',
  AGENT_COMMISSION: 'default', REFUND: 'warning',
};

function TxDetailModal({ tx, onClose }) {
  if (!tx) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Transaction Details</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { label: 'Reference', value: tx.reference, mono: true },
            { label: 'KoraPay Ref', value: tx.korapay_ref || tx.korapay_ref || '—', mono: true },
            { label: 'User', value: tx.user_name || 'N/A' },
            { label: 'Phone', value: tx.user_phone || 'N/A', mono: true },
            { label: 'Plan', value: tx.plan_name || '—' },
            { label: 'Amount', value: GHS(tx.amount) },
            { label: 'Type', value: tx.type },
            { label: 'Status', value: tx.status },
            { label: 'Description', value: tx.description || '—' },
            { label: 'Date', value: tx.created_at ? new Date(tx.created_at).toLocaleString() : '—' },
          ].map(({ label, value, mono }) => (
            <div key={label} className="flex justify-between items-start gap-4 py-2 border-b border-gray-50">
              <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0">{label}</span>
              <span className={`text-sm text-gray-800 font-medium text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', page, search, status, type, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await adminApi.get('/transactions', {
        params: { page, limit: 20, search, status, type, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    keepPreviousData: true,
  });

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  const exportUrl = () => {
    const base = process.env.REACT_APP_API_URL || '/api';
    const params = new URLSearchParams({ status, type, date_from: dateFrom, date_to: dateTo });
    return `${base}/admin/export/transactions?${params}`;
  };

  return (
    <Layout title="Transactions">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by reference ID..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-[#059669] text-white text-sm font-medium rounded-xl hover:bg-[#047857] transition">Search</button>
          </form>
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white">
              <option value="">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white">
              <option value="">All Types</option>
              <option value="CONTRIBUTION">Contribution</option>
              <option value="PAYOUT">Payout</option>
              <option value="COMMISSION">Commission</option>
              <option value="REFUND">Refund</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none" />
            <a href={exportUrl()} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 ml-auto transition">
              <Download className="w-4 h-4" /> Export Excel
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <Thead>
              <tr><Th>Reference</Th><Th>User</Th><Th>Plan</Th><Th>Amount</Th><Th>Type</Th><Th>Status</Th><Th>Date</Th><Th></Th></tr>
            </Thead>
            <Tbody>
              {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                <Tr key={i}>{Array.from({ length: 7 }).map((_, j) => <Td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></Td>)}</Tr>
              )) : !data?.data?.length ? (
                <EmptyRow colSpan={8} message="No transactions found" />
              ) : (
                data.data.map((tx) => (
                  <Tr key={tx.id}>
                    <Td className="font-mono text-xs text-gray-500 max-w-[180px] truncate" title={tx.reference}>{tx.reference}</Td>
                    <Td>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{tx.user_name || 'N/A'}</p>
                        <p className="text-xs text-gray-400 font-mono">{tx.user_phone}</p>
                      </div>
                    </Td>
                    <Td>
                      {tx.plan_name ? <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{tx.plan_name}</span> : <span className="text-xs text-gray-400">—</span>}
                    </Td>
                    <Td className="font-semibold text-gray-900">{GHS(tx.amount)}</Td>
                    <Td><Badge variant={txTypeColors[tx.type] || 'default'}>{tx.type}</Badge></Td>
                    <Td><StatusBadge status={tx.status} /></Td>
                    <Td className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString()}</Td>
                    <Td>
                      <button onClick={() => setSelected(tx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                        <Eye className="w-4 h-4" />
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
          {data?.pagination && <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={20} onChange={setPage} />}
        </div>
      </div>
      <TxDetailModal tx={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}