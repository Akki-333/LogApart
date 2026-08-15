import { Clock, AlertCircle } from 'lucide-react';

export default function TicketKanban({ tickets, onUpdateStatus }) {
  if (!tickets) return null;

  const columns = [
    { id: 'OPEN', title: 'Open Issues', color: 'bg-rose-50 border-rose-200 text-rose-800' },
    { id: 'IN_PROGRESS', title: 'In Progress', color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { id: 'RESOLVED', title: 'Resolved', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' }
  ];

  // Helper to calculate SLA
  const getSLA = (priority, createdAt, status) => {
    if (status === 'RESOLVED') return null;
    
    let hoursAllowed = 48; // Default Medium/Low
    if (priority === 'URGENT') hoursAllowed = 4;
    else if (priority === 'HIGH') hoursAllowed = 24;

    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now - created) / (1000 * 60 * 60);
    const remaining = hoursAllowed - diffHours;

    if (remaining < 0) {
      return <div className="flex items-center text-xs font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded w-fit"><AlertCircle className="w-3 h-3 mr-1" /> SLA BREACHED</div>;
    } else if (remaining < hoursAllowed * 0.2) { // Less than 20% time left
      return <div className="flex items-center text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded w-fit"><Clock className="w-3 h-3 mr-1" /> {Math.ceil(remaining)}h left</div>;
    }
    
    return <div className="flex items-center text-xs font-medium text-slate-500"><Clock className="w-3 h-3 mr-1" /> {Math.ceil(remaining)}h left</div>;
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      LOW: 'bg-slate-100 text-slate-600 border-slate-200',
      MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
      HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
      URGENT: 'bg-red-50 text-red-700 border-red-200'
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${colors[priority]}`}>
        {priority}
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-4">
      {columns.map(col => {
        const columnTickets = tickets.filter(t => t.status === col.id);
        
        return (
          <div key={col.id} className="flex flex-col bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            <div className={`p-4 border-b font-semibold flex justify-between items-center ${col.color}`}>
              {col.title}
              <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold shadow-sm opacity-80">{columnTickets.length}</span>
            </div>
            
            <div className="p-4 space-y-4">
              {columnTickets.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400 font-medium border-2 border-dashed border-slate-200 rounded-lg">
                  No {col.title.toLowerCase()} tickets
                </div>
              ) : (
                columnTickets.map(ticket => (
                  <div key={ticket.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded">Flat {ticket.unit_number}</span>
                      {getPriorityBadge(ticket.priority)}
                    </div>
                    
                    <h4 className="font-bold text-slate-800 text-sm mb-1">{ticket.title}</h4>
                    <p className="text-slate-500 text-xs line-clamp-2 mb-4">{ticket.description}</p>
                    
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                      {getSLA(ticket.priority, ticket.created_at, ticket.status)}
                      
                      <select 
                        value={ticket.status}
                        onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
                        className="text-xs font-medium bg-slate-100 text-slate-700 border-0 rounded px-2 py-1 cursor-pointer hover:bg-slate-200 outline-none"
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
