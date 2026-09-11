import { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Wallet, Wrench, ShieldCheck, Megaphone, Lock } from 'lucide-react';

/**
 * Landing page for the resident portal shell. The modules below are deliberately
 * inert: each one is wired up in a later phase, and showing a placeholder is
 * honest where showing invented numbers would not be.
 */
const MODULES = [
  {
    icon: Wallet,
    title: 'My Dues',
    body: 'Monthly maintenance and your share of the common electricity and water bill, with payment history.',
    phase: 'Arrives with the billing engine'
  },
  {
    icon: Wrench,
    title: 'Report an Issue',
    body: 'Raise a structural or common-area problem and follow it through to resolution.',
    phase: 'Arrives with the resident portal build'
  },
  {
    icon: ShieldCheck,
    title: 'My Gate Activity',
    body: 'Visitors and deliveries logged against your flat, plus pre-approved guest passes.',
    phase: 'Arrives with the resident portal build'
  },
  {
    icon: Megaphone,
    title: 'Notices',
    body: 'Water tank cleaning, power cuts and other building announcements.',
    phase: 'Arrives with the notices module'
  }
];

export default function ResidentHome() {
  const { user } = useContext(AuthContext);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Welcome, {user?.name?.split(' ')[0] || 'Resident'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Your account is active. Your personal dashboard is being built out module by module.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODULES.map((module) => (
          <div
            key={module.title}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 bg-slate-100 text-slate-500 rounded-xl">
                <module.icon className="w-5 h-5" />
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
                <Lock className="w-3 h-3" />
                Not yet available
              </span>
            </div>

            <h3 className="text-sm font-bold text-slate-900">{module.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed flex-1">{module.body}</p>
            <p className="text-[11px] font-semibold text-teal-700 mt-3 pt-3 border-t border-slate-100">
              {module.phase}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          Need something before these are ready? Speak to the building admin, who can log
          maintenance issues and check gate records on your behalf.
        </p>
      </div>
    </div>
  );
}
