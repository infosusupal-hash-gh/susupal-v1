import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, DollarSign, CheckCircle, BarChart2, Users2 } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import StatCard from '../components/ui/StatCard';

const GHS = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const periods = ['day', 'week', 'month', 'year'];

function CustomTooltip({ active, payload, label }) {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name === 'Revenue' ? GHS(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function ProfitAnalyticsPage() {
  const [period, setPeriod] = useState('month');

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['profit-summary', period],
    queryFn: async () => { const { data } = await adminApi.get(`/profit/summary?period=${period}`); return data; },
    staleTime: 60000,
  });

  const { data: chart, isLoading: chartLoading } = useQuery({
    queryKey: ['profit-chart', period],
    queryFn: async () => { const { data } = await adminApi.get(`/profit/chart?period=${period}`); return data; },
    staleTime: 60000,
  });

  const growth = summary?.growth_percentage || 0;

  return (
    <Layout title="Profit Analytics">
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Period Filter */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Platform Earnings Overview</h2>
            <p className="text-xs text-gray-400 mt-0.5">Commission revenue from completed savings plans</p>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {periods.map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${period === p ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <StatCard
            title="Current Revenue"
            value={GHS(summary?.current_revenue)}
            icon={DollarSign}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            loading={summaryLoading}
            trend={growth}
            trendLabel="vs prev period"
          />
          <StatCard
            title="Previous Period"
            value={GHS(summary?.previous_revenue)}
            icon={TrendingUp}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            loading={summaryLoading}
          />
          <StatCard
            title="Completed Plans"
            value={summary?.completed_plans?.toLocaleString() || '0'}
            icon={CheckCircle}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            loading={summaryLoading}
          />
          <StatCard
            title="Avg Contribution"
            value={GHS(summary?.avg_contribution)}
            icon={Users2}
            iconBg="bg-orange-50"
            iconColor="text-orange-600"
            loading={summaryLoading}
          />
        </div>

        {/* Growth Banner */}
        {!summaryLoading && summary && (
          <div className={`rounded-2xl p-5 flex items-center gap-4 ${growth >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${growth >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
              {growth >= 0 ? <TrendingUp className="w-6 h-6 text-emerald-700" /> : <TrendingDown className="w-6 h-6 text-red-600" />}
            </div>
            <div>
              <p className={`font-semibold text-base ${growth >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                {growth >= 0 ? '+' : ''}{growth.toFixed(2)}% revenue growth
              </p>
              <p className={`text-sm mt-0.5 ${growth >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Compared to previous {period} — from {GHS(summary.previous_revenue)} to {GHS(summary.current_revenue)}
              </p>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Revenue Trend</h3>
                <p className="text-[11px] text-gray-400">Platform commission earnings over time</p>
              </div>
            </div>
            {chartLoading ? <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chart || []}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Transaction Volume</h3>
                <p className="text-[11px] text-gray-400">Number of commission transactions</p>
              </div>
            </div>
            {chartLoading ? <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Transactions" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}