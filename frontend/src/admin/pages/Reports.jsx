import { useState } from 'react';
import { Download, FileSpreadsheet, Users, CreditCard, TrendingUp, PiggyBank, ArrowLeftRight } from 'lucide-react';
import Layout from '../components/Layout';

const BASE = process.env.REACT_APP_API_URL || '/api';

function ReportCard({ icon: Icon, title, description, color, bgColor, onExport, dateRange }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleExport = () => {
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    onExport(params.toString());
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition">
      <div className="flex items-start gap-4">
        <div className={`${bgColor} p-3 rounded-xl flex-shrink-0`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          {dateRange && (
            <div className="flex gap-2 mt-3">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                placeholder="From date"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                placeholder="To date"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          )}
          <button
            onClick={handleExport}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            Download .xlsx
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const reports = [
    {
      icon: Users,
      title: 'Users Report',
      description: 'All registered users with status, plans count, and registration dates.',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      dateRange: false,
      href: `${BASE}/admin/export/users`,
    },
    {
      icon: ArrowLeftRight,
      title: 'Transactions Report',
      description: 'All transactions with type, status, amounts, and references.',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      dateRange: true,
      href: `${BASE}/admin/export/transactions`,
    },
    {
      icon: CreditCard,
      title: 'Payouts Report',
      description: 'All payout transactions including completed and failed payouts.',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      dateRange: false,
      href: `${BASE}/admin/export/payouts`,
    },
    {
      icon: PiggyBank,
      title: 'Savings Plans Report',
      description: 'All savings plans with user info, daily amounts, and completion status.',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      dateRange: false,
      href: `${BASE}/admin/export/savings-plans`,
    },
    {
      icon: TrendingUp,
      title: 'Profit / Commission Report',
      description: 'Platform commission earnings with user details and date breakdowns.',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      dateRange: true,
      href: `${BASE}/admin/export/profit`,
    },
  ];

  const handleExport = (href) => (params) => {
    const url = params ? `${href}?${params}` : href;
    window.open(url, '_blank');
  };

  return (
    <Layout title="Reports & Exports">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#064e3b] to-[#059669] rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <FileSpreadsheet className="w-7 h-7 text-emerald-200" />
            <h2 className="text-xl font-bold">Export Center</h2>
          </div>
          <p className="text-emerald-100 text-sm">
            Download comprehensive reports in Excel (.xlsx) format. All reports include complete data with proper formatting.
          </p>
        </div>

        {/* Report Cards Grid */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map((r) => (
            <ReportCard
              key={r.title}
              icon={r.icon}
              title={r.title}
              description={r.description}
              color={r.color}
              bgColor={r.bgColor}
              dateRange={r.dateRange}
              onExport={handleExport(r.href)}
            />
          ))}
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
          <strong>Note:</strong> All exported reports require admin authentication. Files are downloaded directly as .xlsx spreadsheets with SusuPal branding and proper column formatting.
        </div>
      </div>
    </Layout>
  );
}