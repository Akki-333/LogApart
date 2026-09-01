import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import LogVisitorModal from '../components/security/LogVisitorModal';
import EditVisitorModal from '../components/security/EditVisitorModal';
import { 
  ShieldCheck, 
  UserCheck, 
  Clock, 
  LogOut, 
  Search, 
  Edit3, 
  Trash2, 
  Truck, 
  Car, 
  Bike, 
  Package, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function Security({ readOnly = false }) {
  const { token } = useContext(AuthContext);
  const [visitors, setVisitors] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'INSIDE' | 'DELIVERY' | 'GUEST'

  // Modals
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState(null);

  useEffect(() => {
    fetchVisitors();
    fetchUnitsForDropdown();
  }, [token]);

  const fetchVisitors = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5000/api/security/visitors', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVisitors(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch visitors', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnitsForDropdown = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/units', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const flatUnits = [];
      Object.values(response.data.data).forEach(block => {
        Object.values(block.floors).forEach(floorUnits => {
          flatUnits.push(...floorUnits);
        });
      });
      setUnits(flatUnits);
    } catch (error) {
      console.error('Failed to fetch units', error);
    }
  };

  const handleCheckout = async (visitorId) => {
    if (!window.confirm("Check out this visitor and record exit time?")) return;
    try {
      await axios.put(`http://localhost:5000/api/security/visitors/${visitorId}/checkout`, 
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchVisitors();
    } catch (error) {
      alert(error.response?.data?.message || 'Error checking out visitor');
    }
  };

  const handleLogVisitor = async (formData) => {
    try {
      await axios.post('http://localhost:5000/api/security/visitors', 
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsLogModalOpen(false);
      fetchVisitors();
    } catch (error) {
      alert(error.response?.data?.message || 'Error logging visitor');
    }
  };

  const handleEditVisitor = async (visitorId, formData) => {
    try {
      await axios.put(`http://localhost:5000/api/security/visitors/${visitorId}`, 
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsEditModalOpen(false);
      fetchVisitors();
    } catch (error) {
      alert(error.response?.data?.message || 'Error updating visitor entry');
    }
  };

  const handleDeleteVisitor = async (visitorId) => {
    if (!window.confirm("Are you sure you want to remove this gate entry? This cannot be undone.")) return;
    try {
      await axios.delete(`http://localhost:5000/api/security/visitors/${visitorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchVisitors();
    } catch (error) {
      alert(error.response?.data?.message || 'Error deleting visitor entry');
    }
  };

  const openEditModal = (visitor) => {
    setSelectedVisitor(visitor);
    setIsEditModalOpen(true);
  };

  // Counts
  const activeVisitors = visitors.filter(v => v.status === 'ENTERED');
  const deliveryCount = visitors.filter(v => v.purpose === 'DELIVERY').length;

  // Filtered List
  const filteredVisitors = visitors.filter(v => {
    // Tab Filter
    if (filterTab === 'INSIDE' && v.status !== 'ENTERED') return false;
    if (filterTab === 'DELIVERY' && v.purpose !== 'DELIVERY') return false;
    if (filterTab === 'GUEST' && v.purpose !== 'GUEST') return false;

    // Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        v.visitor_name?.toLowerCase().includes(q) ||
        v.visitor_phone?.toLowerCase().includes(q) ||
        v.unit_number?.toLowerCase().includes(q) ||
        v.company?.toLowerCase().includes(q) ||
        v.vehicle_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'BIKE': return <Bike className="w-3.5 h-3.5 text-slate-500" />;
      case 'CAR': return <Car className="w-3.5 h-3.5 text-slate-500" />;
      case 'AUTO': return <Car className="w-3.5 h-3.5 text-amber-600" />;
      case 'VAN': return <Truck className="w-3.5 h-3.5 text-indigo-600" />;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Security Gate Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {readOnly ? 'Live overview of building visitors and gate traffic' : 'Record and manage visitors, deliveries, and vehicles at the gate'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={fetchVisitors}
            title="Refresh Gate Logs"
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {readOnly ? (
            <div className="px-3.5 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl border border-slate-200">
              Read-Only Oversight
            </div>
          ) : (
            <button
              onClick={() => setIsLogModalOpen(true)}
              className="flex items-center px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              <UserCheck className="w-4 h-4 mr-2" />
              New Entry
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Currently Inside</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5 flex items-center gap-2">
              {activeVisitors.length} Visitors
              {activeVisitors.length > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Entries Today</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{visitors.length} Logs</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Deliveries Logged</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{deliveryCount} Packages</div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        
        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by Flat # (e.g. A-1), Visitor Name, Phone, Vehicle Number, or Swiggy/Amazon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-medium text-slate-800"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === 'ALL' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Logs ({visitors.length})
          </button>

          <button
            onClick={() => setFilterTab('INSIDE')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === 'INSIDE' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Inside ({activeVisitors.length})
          </button>

          <button
            onClick={() => setFilterTab('DELIVERY')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === 'DELIVERY' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Deliveries
          </button>

          <button
            onClick={() => setFilterTab('GUEST')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === 'GUEST' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Guests
          </button>
        </div>

      </div>

      {/* 4. Gate Log Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Visitor / Driver</th>
                <th className="px-6 py-4">Visiting Flat</th>
                <th className="px-6 py-4">Vehicle</th>
                <th className="px-6 py-4">Purpose</th>
                <th className="px-6 py-4">Status & Time</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
                  </td>
                </tr>
              ) : filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400 font-semibold">
                    No visitor logs match your search.
                  </td>
                </tr>
              ) : (
                filteredVisitors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Visitor Name & Mobile */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                            {v.visitor_name}
                            {v.company && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                                {v.company}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{v.visitor_phone || 'No mobile recorded'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Visiting Flat */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-teal-50 text-teal-800 border border-teal-200">
                        Flat {v.unit_number}
                      </span>
                    </td>

                    {/* Vehicle */}
                    <td className="px-6 py-4">
                      {v.vehicle_number || v.vehicle_type !== 'NONE' ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          {getVehicleIcon(v.vehicle_type)}
                          <span className="font-mono font-bold uppercase">{v.vehicle_number || v.vehicle_type}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Walk-in</span>
                      )}
                    </td>

                    {/* Purpose */}
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded capitalize ${
                        v.purpose === 'DELIVERY' ? 'bg-amber-50 text-amber-700' :
                        v.purpose === 'GUEST' ? 'bg-blue-50 text-blue-700' :
                        v.purpose === 'SERVICE' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {v.purpose.toLowerCase()}
                      </span>
                    </td>

                    {/* Status & Timestamp */}
                    <td className="px-6 py-4">
                      {v.status === 'ENTERED' ? (
                        <div>
                          <span className="inline-flex items-center text-xs font-bold text-emerald-700 mb-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                            INSIDE PREMISES
                          </span>
                          <div className="text-[11px] text-slate-400">
                            In: {new Date(v.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-bold text-slate-500 block mb-0.5">
                            EXITED
                          </span>
                          <div className="text-[11px] text-slate-400">
                            Out: {v.exit_time ? new Date(v.exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right space-x-1.5">
                      {v.status === 'ENTERED' && !readOnly && (
                        <button
                          onClick={() => handleCheckout(v.id)}
                          className="inline-flex items-center px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                        >
                          <LogOut className="w-3.5 h-3.5 mr-1" /> Checkout
                        </button>
                      )}

                      {!readOnly && (
                        <>
                          <button
                            onClick={() => openEditModal(v)}
                            title="Edit Entry"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteVisitor(v.id)}
                            title="Delete Entry"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <LogVisitorModal 
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSubmit={handleLogVisitor}
        units={units}
      />

      <EditVisitorModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditVisitor}
        visitor={selectedVisitor}
        units={units}
      />

    </div>
  );
}
