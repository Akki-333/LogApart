import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import LogVisitorModal from '../components/security/LogVisitorModal';
import { ShieldCheck, UserCheck, Clock, LogOut } from 'lucide-react';

export default function Security({ readOnly = false }) {
  const { token } = useContext(AuthContext);
  const [visitors, setVisitors] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      setVisitors(response.data.data);
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
    if (!window.confirm("Are you sure you want to checkout this visitor?")) return;
    try {
      await axios.put(`http://localhost:5000/api/security/visitors/${visitorId}/checkout`, 
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchVisitors();
    } catch (error) {
      console.error('Failed to checkout visitor', error);
    }
  };

  const handleLogVisitor = async (formData) => {
    try {
      await axios.post('http://localhost:5000/api/security/visitors', 
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsModalOpen(false);
      fetchVisitors();
    } catch (error) {
      console.error('Failed to log visitor', error);
    }
  };

  const activeVisitors = visitors.filter(v => v.status === 'ENTERED');
  const pastVisitors = visitors.filter(v => v.status === 'EXITED');

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Security Gate Log</h1>
          <p className="text-sm text-slate-500 mt-1">Live tracking of all visitors and deliveries</p>
        </div>
        
        {readOnly ? (
          <div className="px-4 py-2 bg-slate-100 text-slate-500 text-sm font-medium rounded-lg border border-slate-200">
            Read-Only Mode
          </div>
        ) : (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-6 py-3 bg-teal-600 text-white text-base font-bold rounded-lg hover:bg-teal-700 transition-colors shadow-lg shadow-teal-500/30"
          >
            <UserCheck className="w-5 h-5 mr-2" />
            NEW ENTRY
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 flex items-center shadow-sm">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-lg mr-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Currently Inside</p>
            <h3 className="text-2xl font-bold text-slate-800">{activeVisitors.length} Visitors</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 flex items-center shadow-sm">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg mr-4">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Logs Today</p>
            <h3 className="text-2xl font-bold text-slate-800">{visitors.length} Entries</h3>
          </div>
        </div>
      </div>

      {/* Main Content (Table) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Visitor Details</th>
                <th className="px-6 py-4">Visiting Flat</th>
                <th className="px-6 py-4">Purpose</th>
                <th className="px-6 py-4">Status / Time</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
                  </td>
                </tr>
              ) : visitors.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400 font-medium">No visitors logged today</td>
                </tr>
              ) : (
                visitors.map((visitor) => (
                  <tr key={visitor.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{visitor.visitor_name}</div>
                      <div className="text-xs text-slate-400">{visitor.visitor_phone || 'No phone'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                        Flat {visitor.unit_number}
                      </span>
                    </td>
                    <td className="px-6 py-4 capitalize font-medium text-slate-700">
                      {visitor.purpose.toLowerCase()}
                    </td>
                    <td className="px-6 py-4">
                      {visitor.status === 'ENTERED' ? (
                        <div>
                          <span className="inline-flex items-center text-xs font-bold text-teal-600 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1.5 animate-pulse"></span>
                            INSIDE
                          </span>
                          <div className="text-xs text-slate-400">In: {new Date(visitor.entry_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center text-xs font-bold text-slate-500 mb-1">
                            EXITED
                          </span>
                          <div className="text-xs text-slate-400">Out: {new Date(visitor.exit_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {visitor.status === 'ENTERED' && !readOnly && (
                        <button
                          onClick={() => handleCheckout(visitor.id)}
                          className="inline-flex items-center px-4 py-2 border-2 border-slate-200 text-sm font-bold rounded-lg text-slate-700 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          CHECKOUT
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LogVisitorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleLogVisitor}
        units={units}
      />
    </div>
  );
}
