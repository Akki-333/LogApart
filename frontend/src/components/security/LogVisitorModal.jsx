import { useState, useId } from 'react';
import { X, UserCheck, Home, User, Phone, Truck, Car, Bike, Package } from 'lucide-react';
import useDialog from '../common/useDialog';

export default function LogVisitorModal({ isOpen, onClose, onSubmit, units }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
  const fieldId = useId();
  const [formData, setFormData] = useState({
    unit_id: '',
    visitor_name: '',
    visitor_phone: '',
    purpose: 'GUEST',
    company: '',
    vehicle_type: 'NONE',
    vehicle_number: ''
  });
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const deliveryBrands = [
    { name: 'Swiggy', color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
    { name: 'Zomato', color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
    { name: 'Amazon', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
    { name: 'Blinkit', color: 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100' },
    { name: 'Flipkart', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
    { name: 'Uber / Cab', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
  ];

  const handleBrandClick = (brandName) => {
    setFormData(prev => ({
      ...prev,
      purpose: 'DELIVERY',
      company: brandName,
      visitor_name: prev.visitor_name ? prev.visitor_name : `${brandName} Delivery`
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(formData);
    setSubmitting(false);
    setFormData({
      unit_id: '',
      visitor_name: '',
      visitor_phone: '',
      purpose: 'GUEST',
      company: '',
      vehicle_type: 'NONE',
      vehicle_number: ''
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-slate-800">New Gate Entry</h2>
              <p className="text-xs text-slate-500">Record visitor, delivery, or cab at the gate</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* 1-Tap Delivery Brand Quick Tags */}
          <div>
            <span id={`${fieldId}-delivery-tags`} className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-slate-400" /> Quick Delivery Tags (1-Tap)
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${fieldId}-delivery-tags`}>
              {deliveryBrands.map(b => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => handleBrandClick(b.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${b.color} ${formData.company === b.name ? 'ring-2 ring-teal-500 font-extrabold' : ''}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Visiting Home & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-home-classname-w-3-5-h-3-5-t`}>
                <Home className="w-3.5 h-3.5 text-slate-400" /> Visiting Home *
              </label>
              <select id={`${fieldId}-home-classname-w-3-5-h-3-5-t`}
                required
                value={formData.unit_id}
                onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="">Select Home</option>
                {units?.map(unit => (
                  <option key={unit.unit_id} value={unit.unit_id}>
                    Home {unit.number} (Floor {unit.floor})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-purpose-of-visit`}>
                Purpose of Visit *
              </label>
              <select id={`${fieldId}-purpose-of-visit`}
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="GUEST">Guest / Relative</option>
                <option value="DELIVERY">Delivery</option>
                <option value="SERVICE">Service (Plumber / Electrician)</option>
                <option value="MAID">Daily Helper / Maid</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          {/* Visitor Name & Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-user-classname-w-3-5-h-3-5-t`}>
                <User className="w-3.5 h-3.5 text-slate-400" /> Visitor / Driver Name *
              </label>
              <input id={`${fieldId}-user-classname-w-3-5-h-3-5-t`}
                required
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={formData.visitor_name}
                onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-phone-classname-w-3-5-h-3-5-`}>
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number
              </label>
              <input id={`${fieldId}-phone-classname-w-3-5-h-3-5-`}
                type="tel"
                placeholder="e.g. 9876543210"
                value={formData.visitor_phone}
                onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>
          </div>

          {/* Vehicle Type & Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-vehicle-type`}>
                Vehicle Type
              </label>
              <select id={`${fieldId}-vehicle-type`}
                value={formData.vehicle_type}
                onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="NONE">None (Walk-in)</option>
                <option value="BIKE">Two-Wheeler (Bike / Scooter)</option>
                <option value="CAR">Car / 4-Wheeler</option>
                <option value="AUTO">Auto Rickshaw</option>
                <option value="VAN">Delivery Van / Truck</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-vehicle-plate-number`}>
                Vehicle Plate Number
              </label>
              <input id={`${fieldId}-vehicle-plate-number`}
                type="text"
                placeholder="e.g. TN 09 AB 1234"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value.toUpperCase() })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm uppercase"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors shadow-md disabled:opacity-50"
            >
              {submitting ? 'Logging...' : 'Log Entry & Allow In'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
