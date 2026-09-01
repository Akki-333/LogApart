import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { 
  Building2, 
  Users, 
  ShieldCheck, 
  Wrench, 
  ArrowRight, 
  UserPlus, 
  PlusCircle, 
  Clock, 
  CheckCircle2, 
  Megaphone,
  Phone,
  Home
} from 'lucide-react';

export default function DashboardHome() {
  const { token, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, [token]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:5000/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      LOW: 'bg-slate-100 text-slate-700 border-slate-200',
      MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
      HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
      URGENT: 'bg-rose-50 text-rose-700 border-rose-200'
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${colors[priority] || colors.MEDIUM}`}>
        {priority}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Apartment Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Hello, <strong className="text-slate-700">{user?.name || 'Admin'}</strong>. Here is what is happening across the building today.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/admin/residents')}
            className="flex items-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition-colors shadow-xs"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Onboard Resident
          </button>
          <button
            onClick={() => navigate('/admin/maintenance')}
            className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl text-sm transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4 mr-1.5 text-teal-600" />
            Log Issue
          </button>
        </div>
      </div>

      {/* 2. Top Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Occupancy Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Occupancy</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {stats?.occupancy.occupied_units || 0} of {stats?.occupancy.total_units || 20} Flats
              </div>
            </div>
            <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
              <Home className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-3">
            <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>{stats?.occupancy.occupancy_rate || 0}% Occupied</span>
              <span>{stats?.occupancy.vacant_units || 0} Vacant</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-teal-600 h-2 rounded-full transition-all duration-500" 
                style={{ width: `${stats?.occupancy.occupancy_rate || 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Gate Security Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gate Activity</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {stats?.visitors.currently_inside || 0} <span className="text-sm font-semibold text-slate-500">Inside</span>
              </div>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Total logged today: <strong className="text-slate-800">{stats?.visitors.total_today || 0}</strong></span>
            <button 
              onClick={() => navigate('/admin/security')}
              className="text-indigo-600 font-bold hover:underline flex items-center"
            >
              Gate Log <ArrowRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Maintenance Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Building Maintenance</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {(stats?.tickets.open_tickets || 0) + (stats?.tickets.in_progress_tickets || 0)} <span className="text-sm font-semibold text-slate-500">Open</span>
              </div>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-amber-700 font-bold">
              {stats?.tickets.critical_tickets || 0} High Priority
            </span>
            <button 
              onClick={() => navigate('/admin/maintenance')}
              className="text-teal-700 font-bold hover:underline flex items-center"
            >
              View Kanban <ArrowRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>
        </div>

      </div>

      {/* 3. Live Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        
        {/* Visitors Inside Now */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <Users className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Visitors Currently Inside</h3>
                <p className="text-xs text-slate-400">Live check-ins from the gate</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/admin/security')}
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center"
            >
              All Logs <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="flex-1 space-y-3">
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
              </div>
            ) : !stats?.visitors.active_list || stats?.visitors.active_list.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs border-2 border-dashed border-slate-100 rounded-xl">
                No active visitors inside right now.
              </div>
            ) : (
              stats?.visitors.active_list.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <div>
                      <div className="font-bold text-slate-800 text-xs">{v.visitor_name}</div>
                      <div className="text-[11px] text-slate-400">{v.visitor_phone || 'No phone'}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block text-xs font-bold px-2 py-0.5 bg-teal-50 text-teal-800 rounded-md border border-teal-200 mb-0.5">
                      Flat {v.unit_number}
                    </span>
                    <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(v.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Priority Maintenance Tickets */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-amber-50 text-amber-700 rounded-xl">
                <Wrench className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Open Building Issues</h3>
                <p className="text-xs text-slate-400">Issues logged by residents and staff</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/admin/maintenance')}
              className="text-xs font-bold text-teal-700 hover:underline flex items-center"
            >
              Kanban <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="flex-1 space-y-3">
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
              </div>
            ) : !stats?.tickets.recent_list || stats?.tickets.recent_list.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs border-2 border-dashed border-slate-100 rounded-xl">
                No open maintenance tickets.
              </div>
            ) : (
              stats?.tickets.recent_list.map((ticket) => (
                <div key={ticket.id} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      Flat {ticket.unit_number}
                    </span>
                    {getPriorityBadge(ticket.priority)}
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs">{ticket.title}</h4>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
                    <span>Reported by: {ticket.reported_by}</span>
                    <span className="capitalize font-semibold text-slate-600">{ticket.status.replace('_', ' ').toLowerCase()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 4. Community Notice */}
      <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
        <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
          <Megaphone className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Community Notice</h4>
            <span className="text-[11px] font-semibold text-amber-700">Scheduled for Saturday</span>
          </div>
          <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
            Overhead water tank cleaning is scheduled for this Saturday from 10:00 AM to 2:00 PM. Water supply will be temporarily paused during this window.
          </p>
        </div>
      </div>

    </div>
  );
}
