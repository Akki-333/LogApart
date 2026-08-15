import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import BuildingGrid from '../components/residents/BuildingGrid';
import UnitSlideOut from '../components/residents/UnitSlideOut';
import { LayoutGrid, List } from 'lucide-react';

export default function Residents() {
  const { token } = useContext(AuthContext);
  const [unitsData, setUnitsData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [isSlideOutOpen, setIsSlideOutOpen] = useState(false);

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
    } catch (error) {
      console.error('Failed to fetch units', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnitClick = (unit) => {
    setSelectedUnit(unit);
    setIsSlideOutOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Residents & Units</h1>
          <p className="text-sm text-slate-500 mt-1">Manage block occupancy and resident profiles</p>
        </div>
        
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'grid' 
                ? 'bg-teal-50 text-teal-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            Grid View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'list' 
                ? 'bg-teal-50 text-teal-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4 mr-2" />
            List View
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : viewMode === 'grid' ? (
        <BuildingGrid data={unitsData} onUnitClick={handleUnitClick} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
          List View coming soon in Phase 2.1
        </div>
      )}

      {/* Slide Out Panel */}
      <UnitSlideOut 
        unit={selectedUnit} 
        isOpen={isSlideOutOpen} 
        onClose={() => setIsSlideOutOpen(false)} 
      />
    </div>
  );
}
