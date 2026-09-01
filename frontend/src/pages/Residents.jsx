import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import BuildingGrid from '../components/residents/BuildingGrid';
import ResidentsTable from '../components/residents/ResidentsTable';
import UnitSlideOut from '../components/residents/UnitSlideOut';
import OnboardResidentModal from '../components/residents/OnboardResidentModal';
import EditResidentModal from '../components/residents/EditResidentModal';
import VacateNocModal from '../components/residents/VacateNocModal';
import { 
  LayoutGrid, 
  List, 
  Search, 
  UserPlus, 
  Building2, 
  Users, 
  UserCheck, 
  Filter, 
  RefreshCw 
} from 'lucide-react';

export default function Residents() {
  const { token } = useContext(AuthContext);
  const [unitsData, setUnitsData] = useState(null);
  const [flatList, setFlatList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'OCCUPIED' | 'VACANT' | 'OWNER' | 'TENANT'

  // Selected Unit & Modal States
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [isSlideOutOpen, setIsSlideOutOpen] = useState(false);
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isVacateOpen, setIsVacateOpen] = useState(false);

  useEffect(() => {
    fetchUnits();
  }, [token]);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5000/api/units', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnitsData(response.data.data);
      setFlatList(response.data.flatList || []);
    } catch (error) {
      console.error('Failed to fetch units', error);
    } finally {
      setLoading(false);
    }
  };

  // Unit Selection Handler
  const handleUnitClick = (unit) => {
    setSelectedUnit(unit);
    setIsSlideOutOpen(true);
  };

  // Lifecycle Action Handlers
  const handleOpenOnboard = (unit = null) => {
    setSelectedUnit(unit);
    setIsOnboardOpen(true);
  };

  const handleOpenEdit = (unit) => {
    setSelectedUnit(unit);
    setIsEditOpen(true);
  };

  const handleOpenVacate = (unit) => {
    setSelectedUnit(unit);
    setIsVacateOpen(true);
  };

  // API Callbacks
  const handleAssignSubmit = async (formData) => {
    try {
      await axios.post('http://localhost:5000/api/units/assign', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsOnboardOpen(false);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.message || 'Error assigning resident');
    }
  };

  const handleEditSubmit = async (unitId, formData) => {
    try {
      await axios.put(`http://localhost:5000/api/units/${unitId}/resident`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsEditOpen(false);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating resident details');
    }
  };

  const handleVacateSubmit = async (unitId, moveOutDate) => {
    try {
      await axios.post('http://localhost:5000/api/units/vacate', { unit_id: unitId, move_out_date: moveOutDate }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsVacateOpen(false);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.message || 'Error vacating unit');
    }
  };

  // Calculated Stats
  const totalUnits = flatList.length;
  const occupiedUnits = flatList.filter(u => u.is_occupied).length;
  const vacantUnits = totalUnits - occupiedUnits;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const ownerCount = flatList.filter(u => u.is_occupied && u.type === 'OWNER').length;
  const tenantCount = flatList.filter(u => u.is_occupied && u.type === 'TENANT').length;
  const vacantUnitsList = flatList.filter(u => !u.is_occupied);

  // Filtered Flat List for Table
  const filteredFlatList = flatList.filter(u => {
    if (filterStatus === 'OCCUPIED' && !u.is_occupied) return false;
    if (filterStatus === 'VACANT' && u.is_occupied) return false;
    if (filterStatus === 'OWNER' && u.type !== 'OWNER') return false;
    if (filterStatus === 'TENANT' && u.type !== 'TENANT') return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        u.number?.toLowerCase().includes(q) ||
        u.resident_name?.toLowerCase().includes(q) ||
        u.resident_phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Residents & Units Suite</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Full-lifecycle property directory, occupancy mapping, and tenant onboarding
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUnits}
            title="Refresh Directory"
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenOnboard(null)}
            className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Onboard Resident
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Units</span>
          <div className="text-xl font-black text-slate-900 mt-1">{totalUnits || 20} Flats</div>
          <span className="text-[11px] text-slate-500">4 Residential Floors</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-600">Occupancy</span>
          <div className="text-xl font-black text-teal-700 mt-1">{occupancyRate}%</div>
          <span className="text-[11px] text-slate-500">{occupiedUnits} Occupied • {vacantUnits} Vacant</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Owners</span>
          <div className="text-xl font-black text-indigo-700 mt-1">{ownerCount}</div>
          <span className="text-[11px] text-slate-500">Permanent Residents</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Tenants</span>
          <div className="text-xl font-black text-amber-700 mt-1">{tenantCount}</div>
          <span className="text-[11px] text-slate-500">Rental Agreements</span>
        </div>
      </div>

      {/* 3. Search, Filter & View Mode Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by Flat # (e.g. A, B-1, C-2), Resident Name, or Mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all font-medium text-slate-800"
          />
        </div>

        {/* Filter Dropdown & View Mode Switch */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-teal-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OCCUPIED">Occupied Only</option>
              <option value="VACANT">Vacant Only</option>
              <option value="OWNER">Owners Only</option>
              <option value="TENANT">Tenants Only</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white text-teal-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-teal-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5 mr-1.5" />
              Table
            </button>
          </div>
        </div>

      </div>

      {/* 4. Main Content Area */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : viewMode === 'grid' ? (
        <BuildingGrid 
          data={unitsData} 
          onUnitClick={handleUnitClick} 
          searchTerm={searchTerm}
          filterStatus={filterStatus}
        />
      ) : (
        <ResidentsTable
          units={filteredFlatList}
          onUnitClick={handleUnitClick}
          onEditClick={handleOpenEdit}
          onVacateClick={handleOpenVacate}
          onOnboardClick={handleOpenOnboard}
        />
      )}

      {/* 5. Modals & Slide-outs */}
      <UnitSlideOut 
        unit={selectedUnit} 
        isOpen={isSlideOutOpen} 
        onClose={() => setIsSlideOutOpen(false)}
        onOnboard={handleOpenOnboard}
        onEdit={handleOpenEdit}
        onVacate={handleOpenVacate}
      />

      <OnboardResidentModal
        isOpen={isOnboardOpen}
        onClose={() => setIsOnboardOpen(false)}
        onSubmit={handleAssignSubmit}
        vacantUnits={vacantUnitsList}
        preselectedUnit={selectedUnit}
      />

      <EditResidentModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSubmit={handleEditSubmit}
        unit={selectedUnit}
      />

      <VacateNocModal
        isOpen={isVacateOpen}
        onClose={() => setIsVacateOpen(false)}
        onConfirmVacate={handleVacateSubmit}
        unit={selectedUnit}
      />

    </div>
  );
}
