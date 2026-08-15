import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import TicketKanban from '../components/maintenance/TicketKanban';
import NewTicketModal from '../components/maintenance/NewTicketModal';
import { Plus } from 'lucide-react';

export default function Maintenance() {
  const { token } = useContext(AuthContext);
  const [tickets, setTickets] = useState([]);
  const [units, setUnits] = useState([]); // Needed for the dropdown in modal
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchUnitsForDropdown();
  }, [token]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5000/api/tickets', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTickets(response.data.data);
    } catch (error) {
      console.error('Failed to fetch tickets', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnitsForDropdown = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/units', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Flatten the grouped units data for a simple dropdown
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

  const handleUpdateStatus = async (ticketId, newStatus) => {
    try {
      await axios.put(`http://localhost:5000/api/tickets/${ticketId}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh tickets
      fetchTickets();
    } catch (error) {
      console.error('Failed to update ticket', error);
    }
  };

  const handleCreateTicket = async (formData) => {
    try {
      await axios.post('http://localhost:5000/api/tickets', 
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsModalOpen(false);
      fetchTickets();
    } catch (error) {
      console.error('Failed to create ticket', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Structural Maintenance</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track building infrastructure issues</p>
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors shadow-sm w-fit"
        >
          <Plus className="w-4 h-4 mr-2" />
          Log Issue
        </button>
      </div>

      {/* Main Content (Kanban Board) */}
      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <TicketKanban 
            tickets={tickets} 
            onUpdateStatus={handleUpdateStatus} 
          />
        )}
      </div>

      <NewTicketModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateTicket}
        units={units}
      />
    </div>
  );
}
