import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ArrowLeftRight, CreditCard, TrendingUp,
  FileText, Bell, Settings, LogOut, ChevronLeft, ChevronRight, Shield, ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useAdminAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const nav = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/admin/reconciliation', icon: ShieldCheck, label: 'Payment Reconciliation' },
  { to: '/admin/payouts', icon: CreditCard, label: 'Payouts' },
  { to: '/admin/profit', icon: TrendingUp, label: 'Profit Analytics' },
  { to: '/admin/reports', icon: FileText, label: 'Reports' },
  { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { to: '/admin/reminders', icon: Bell, label: 'Reminder Center' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ unreadCount = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/admin/login');
  };

  return (
    <aside
      className={`flex flex-col bg-[#064e3b] text-white transition-all duration-300 relative
        ${collapsed ? 'w-16' : 'w-64'} min-h-screen flex-shrink-0`}
    >
      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 bg-[#059669] rounded-full w-6 h-6 flex items-center justify-center shadow-lg z-10 border-2 border-white hover:bg-[#047857] transition"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 bg-[#059669] rounded-lg flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-base tracking-wide">SusuPal</span>
            <p className="text-[10px] text-emerald-300 leading-none mt-0.5">Admin Center</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative
              ${isActive
                ? 'bg-[#059669] text-white shadow-lg shadow-emerald-900/30'
                : 'text-emerald-100 hover:bg-white/10 hover:text-white'}`
            }
          >
            <div className="relative flex-shrink-0">
              <Icon className="w-5 h-5" />
              {label === 'Notifications' && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
            {collapsed && (
              <span className="absolute left-full ml-2 bg-gray-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Admin Profile */}
      <div className={`border-t border-white/10 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {!collapsed && admin && (
          <div className="mb-2 px-2">
            <p className="text-sm font-semibold text-white truncate">{admin.name}</p>
            <span className="inline-block text-[10px] font-medium bg-emerald-700 text-emerald-100 rounded-full px-2 py-0.5 mt-0.5">
              {admin.role?.replace('_', ' ')}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 text-emerald-300 hover:text-white hover:bg-white/10 rounded-xl px-3 py-2 transition w-full text-sm ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}