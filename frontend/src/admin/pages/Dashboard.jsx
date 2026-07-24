import { useQuery } from '@tanstack/react-query';
import {
  Users, UserCheck, Wallet, ArrowDownCircle, TrendingUp, CheckCircle,
  XCircle, Clock, PiggyBank, LayoutList, AlertTriangle, Activity, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useState } from 'react';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import StatCard from '../components/ui/StatCard';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NUM = (n) => Number(n || 0).toLocaleString();

const chartPeriods = ['day', 'week', 'month', 'year'];

function CustomTooltip({ active, payload, label }) {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? GHS(p.value) : NUM(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function LiquidityWarning({ stats }) {
  if (!stats?.liquidity_warning) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-amber-900">⚠ Insufficient Liquidity Warning</p>
        <p className="text-sm text-amber-700 mt-0.5">
          Tomorrow's payout obligations exceed current escrow balance.
        </p>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <span className="text-amber-700">Required: <strong>{GHS(stats.tomorrow_payout_total)}</strong></span>
          <span className="text-amber-700">Available: <strong>{GHS(stats.escrow_balance)}</strong></span>
          <span className="text-red-600">Deficit: <strong>{GHS(stats.liquidity_deficit)}</strong></span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [chartPeriod, setChartPeriod] = useState('month');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await adminApi.get('/dashboard/stats'); return data; },
    refetchInterval: 60000,
  });

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['dashboard-charts', chartPeriod],
    queryFn: async () => { const { data } = await adminApi.get(`/dashboard/charts?period=${chartPeriod}`); return data; },
    staleTime: 120000,
  });

  const { data: balanceData, isLoading: balanceLoading, error: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['dashboard-balance'],
    queryFn: async () => { const { data } = await adminApi.get('/dashboard/balance'); return data; },
    staleTime: 30000,
  });

  const loading = statsLoading;

  return (
    <Layout title="Dashboard">
      <div className="space-y-6 max-w-[1400px] mx-auto">

        {/* Liquidity Warning */}
        {stats && <LiquidityWarning stats={stats} />}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard title="Total Users" value={NUM(stats?.total_users)} icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" loading={loading} />
          <StatCard title="Active Users" value={NUM(stats?.active_users)} icon={UserCheck} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
          <StatCard title="Total Savings" value={GHS(stats?.total_savings)} icon={PiggyBank} iconBg="bg-purple-50" iconColor="text-purple-600" loading={loading} />
          <StatCard title="Monthly Profit" value={GHS(stats?.monthly_profit)} icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
          <StatCard title="Active Plans" value={NUM(stats?.active_plans)} icon={LayoutList} iconBg="bg-indigo-50" iconColor="text-indigo-600" loading={loading} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard title="Tomorrow Payout" value={GHS(stats?.tomorrow_payout_total)} subtitle={`${NUM(stats?.tomorrow_payout_count)} users`} icon={ArrowDownCircle} iconBg="bg-orange-50" iconColor="text-orange-600" warning={stats?.liquidity_warning ? '⚠ Liquidity risk' : null} loading={loading} />
          <StatCard title="Completed Payouts" value={NUM(stats?.completed_payouts)} icon={CheckCircle} iconBg="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
          <StatCard title="Failed Transactions" value={NUM(stats?.failed_transactions)} icon={XCircle} iconBg="bg-red-50" iconColor="text-red-600" loading={loading} />
          <StatCard title="Pending Withdrawals" value={NUM(stats?.pending_withdrawals)} icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" loading={loading} />
          <StatCard title="Escrow Balance" value={GHS(stats?.escrow_balance)} icon={Wallet} iconBg="bg-teal-50" iconColor="text-teal-600" loading={loading} />
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Korapay Balance</h2>
              <p className="text-xs text-gray-400 mt-0.5">Live merchant balance snapshot</p>
            </div>
            <button
              onClick={() => refetchBalance()}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
          {balanceLoading ? (
            <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
          ) : balanceError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Unable to load Korapay balance right now. {balanceError?.response?.data?.error || 'Please try again in a moment.'}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Available Balance</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-900">{GHS(balanceData?.available)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-700">Pending Balance</p>
                <p className="mt-2 text-2xl font-semibold text-amber-900">{GHS(balanceData?.pending)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-gray-900">Revenue & Collections</h2>
              <p className="text-xs text-gray-400 mt-0.5">Platform earnings overview</p>
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {chartPeriods.map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition ${chartPeriod === p ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >{p}</button>
              ))}
            </div>
          </div>
          {chartsLoading ? (
            <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={charts?.daily_collections || []}>
                <defs>
                  <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="value" name="Daily Collections" stroke="#059669" fill="url(#collGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Revenue (Commission)</h2>
                <p className="text-[11px] text-gray-400">Platform earnings</p>
              </div>
            </div>
            {chartsLoading ? <div className="h-48 bg-gray-50 rounded-xl animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={charts?.daily_revenue || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Revenue" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* User Registrations */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">User Registrations</h2>
                <p className="text-[11px] text-gray-400">New user signups</p>
              </div>
            </div>
            {chartsLoading ? <div className="h-48 bg-gray-50 rounded-xl animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={charts?.user_registrations || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="value" name="Registrations" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}