import { useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { AuthContext } from '../context/AuthContext';
import TicketKanban from '../components/maintenance/TicketKanban';
import TicketConversation from '../components/tickets/TicketConversation';
import NewTicketModal from '../components/maintenance/NewTicketModal';
import { Plus } from 'lucide-react';
import useDialog from '../components/common/useDialog';

export default function Maintenance() {
  const { token } = useContext(AuthContext);
  const [tickets, setTickets] = useState([]);
  const [units, setUnits] = useState([]); // Needed for the dropdown in modal
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openTicket, setOpenTicket] = useState(null);
  const { dialogRef, dialogProps, titleId } = useDialog(Boolean(openTicket), () => setOpenTicket(null));

  useEffect(() => {
    fetchTickets();
    fetchUnitsForDropdown();
  }, [token]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/tickets');
      setTickets(response.data.data);
    } catch (error) {
      console.error('Failed to fetch tickets', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnitsForDropdown = async () => {
    try {
      const response = await api.get('/api/units');
      // Flatten the grouped units data for a simple dropdown
      const homeUnits = [];
      Object.values(response.data.data).forEach(block => {
        Object.values(block.floors).forEach(floorUnits => {
          homeUnits.push(...floorUnits);
        });
      });
      setUnits(homeUnits);
    } catch (error) {
      console.error('Failed to fetch units', error);
    }
  };

  const handleUpdateStatus = async (ticketId, newStatus) => {
    try {
      await api.put(`/api/tickets/${ticketId}`, { status: newStatus });
      // Refresh tickets
      fetchTickets();
    } catch (error) {
      console.error('Failed to update ticket', error);
    }
  };

  const handleCreateTicket = async (formData) => {
    try {
      await api.post('/api/tickets', formData);
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
            onOpenTicket={setOpenTicket}
          />
        )}
      </div>

      {openTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-start px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 id={titleId} className="text-base font-bold text-slate-800">{openTicket.title}</h2>
                <p className="text-xs text-slate-500">{openTicket.place || openTicket.location}</p>
              </div>
              <button
                onClick={() => setOpenTicket(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                Close
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <TicketConversation ticketId={openTicket.id} onChanged={fetchTickets} />
            </div>
          </div>
        </div>
      )}

      <NewTicketModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateTicket}
        units={units}
      />
    </div>
  );
}
