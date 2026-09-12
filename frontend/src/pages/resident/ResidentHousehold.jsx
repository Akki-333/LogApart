import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Users, Car, Trash2, Plus, BookUser, Phone } from 'lucide-react';

/**
 * Who lives here, what they drive, and whether the home wants to be findable.
 * The directory is off by default, and leaving it never stops you reading it.
 */
export default function ResidentHousehold() {
  const [household, setHousehold] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState({ name: '', relation: '', phone: '' });
  const [vehicle, setVehicle] = useState({ number_plate: '', vehicle_type: 'CAR', model: '' });

  const load = useCallback(async () => {
    try {
      const [own, list] = await Promise.all([
        api.get('/api/household'),
        api.get('/api/household/directory')
      ]);
      setHousehold(own.data.data);
      setDirectory(list.data.data);
    } catch (error) {
      console.error('Failed to load your household', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMember = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/household/members', member);
      setMember({ name: '', relation: '', phone: '' });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not add them');
    }
  };

  const addVehicle = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/household/vehicles', vehicle);
      setVehicle({ number_plate: '', vehicle_type: 'CAR', model: '' });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not register that vehicle');
    }
  };

  const remove = async (kind, id) => {
    try {
      await api.delete(`/api/household/${kind}/${id}`);
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not remove that');
    }
  };

  const toggleDirectory = async () => {
    try {
      await api.put('/api/household/directory', { show_in_directory: !household.show_in_directory });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not change that');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">My Household</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Home {household.unit.number}, and the neighbours who chose to be listed
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Who lives here</h3>
          </div>

          <form onSubmit={addMember} className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-2">
            <input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })}
              placeholder="Name" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <input value={member.relation} onChange={(e) => setMember({ ...member, relation: e.target.value })}
              placeholder="Relation" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <div className="flex gap-2">
              <input value={member.phone} onChange={(e) => setMember({ ...member, phone: e.target.value })}
                placeholder="Phone" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              <button type="submit" className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          {household.members.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Only you, so far.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {household.members.map((person) => (
                <li key={person.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {person.relation || 'Household member'}{person.phone && ` · ${person.phone}`}
                    </p>
                  </div>
                  <button onClick={() => remove('members', person.id)} className="p-1.5 text-slate-300 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Car className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Vehicles</h3>
          </div>

          <form onSubmit={addVehicle} className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-2">
            <input value={vehicle.number_plate} onChange={(e) => setVehicle({ ...vehicle, number_plate: e.target.value })}
              placeholder="Number plate" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm uppercase" />
            <select value={vehicle.vehicle_type} onChange={(e) => setVehicle({ ...vehicle, vehicle_type: e.target.value })}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
              <option value="CAR">Car</option>
              <option value="BIKE">Bike</option>
              <option value="SCOOTER">Scooter</option>
              <option value="CYCLE">Cycle</option>
              <option value="OTHER">Other</option>
            </select>
            <div className="flex gap-2">
              <input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
                placeholder="Model" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              <button type="submit" className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          {household.vehicles.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              Register your car so the guard knows it is yours.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {household.vehicles.map((car) => (
                <li key={car.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800 font-mono">{car.number_plate}</p>
                    <p className="text-[11px] text-slate-500">
                      {car.vehicle_type.toLowerCase()}{car.model && ` · ${car.model}`}
                      {car.bay_number && ` · bay ${car.bay_number}`}
                    </p>
                  </div>
                  <button onClick={() => remove('vehicles', car.id)} className="p-1.5 text-slate-300 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <BookUser className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Resident directory</h3>
          <button
            onClick={toggleDirectory}
            className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              household.show_in_directory
                ? 'bg-teal-600 hover:bg-teal-700 text-white'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            {household.show_in_directory ? 'You are listed' : 'List me'}
          </button>
        </div>

        {directory.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Nobody has joined the directory yet. Listing yourself shows your name, home and
            phone number to other residents only.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {directory.map((person) => (
              <li key={`${person.unit_number}-${person.name}`} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                  <p className="text-[11px] text-slate-500">Home {person.unit_number} · floor {person.floor}</p>
                </div>
                {person.phone && (
                  <a href={`tel:${person.phone}`} className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                    <Phone className="w-3.5 h-3.5" /> {person.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
