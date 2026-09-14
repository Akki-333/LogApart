import { useState } from 'react';
import HelpersTab from '../components/community/HelpersTab';
import NoticesTab from '../components/community/NoticesTab';
import ParkingTab from '../components/community/ParkingTab';
import StaffTab from '../components/community/StaffTab';
import AmenitiesTab from '../components/community/AmenitiesTab';
import PollsTab from '../components/community/PollsTab';
import EmergencyTab from '../components/community/EmergencyTab';
import { Users, Megaphone, Car, HardHat, CalendarDays, CheckCircle2, Vote, LifeBuoy } from 'lucide-react';

const TABS = [
  { key: 'HELPERS', label: 'Daily Helpers', icon: Users, blurb: 'Maids, cooks and drivers who come every day' },
  { key: 'NOTICES', label: 'Notices', icon: Megaphone, blurb: 'Announcements for residents and staff' },
  { key: 'PARKING', label: 'Parking', icon: Car, blurb: 'Bay allotment and violations' },
  { key: 'STAFF', label: 'Staff', icon: HardHat, blurb: 'Roster, attendance and monthly pay' },
  { key: 'AMENITIES', label: 'Bookings', icon: CalendarDays, blurb: 'What residents can book, and the requests waiting on a yes' },
  { key: 'POLLS', label: 'Polls', icon: Vote, blurb: 'Questions for the building, one vote per home' },
  { key: 'EMERGENCY', label: 'Emergency numbers', icon: LifeBuoy, blurb: 'The numbers on every resident Help screen' }
];

/**
 * The day-to-day modules share one screen rather than a sidebar entry each,
 * since an admin moves between them in a single sitting.
 */
export default function Community() {
  const [tab, setTab] = useState('HELPERS');
  const [banner, setBanner] = useState('');

  const announce = (message) => {
    setBanner(message);
    setTimeout(() => setBanner(''), 5000);
  };

  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Community & Operations</h1>
        <p className="text-sm text-slate-500 mt-0.5">{active.blurb}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === item.key ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <item.icon className="w-3.5 h-3.5 mr-1.5" />
            {item.label}
          </button>
        ))}
      </div>

      {banner && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-sm font-semibold text-emerald-900">{banner}</p>
        </div>
      )}

      {tab === 'HELPERS' && <HelpersTab onAction={announce} />}
      {tab === 'NOTICES' && <NoticesTab onAction={announce} />}
      {tab === 'PARKING' && <ParkingTab onAction={announce} />}
      {tab === 'STAFF' && <StaffTab onAction={announce} />}
      {tab === 'AMENITIES' && <AmenitiesTab onAction={announce} />}
      {tab === 'POLLS' && <PollsTab onAction={announce} />}
      {tab === 'EMERGENCY' && <EmergencyTab onAction={announce} />}
    </div>
  );
}
