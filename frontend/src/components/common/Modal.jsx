import { useId } from 'react';
import { X } from 'lucide-react';
import useDialog from './useDialog';

/**
 * The dialog shell for new overlays. The behaviour itself, meaning focus in and
 * back out, Tab kept inside, Escape to close and the page behind held still,
 * lives in useDialog so the older overlays share exactly the same rules.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true
}) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
  const subtitleId = useId();

  if (!isOpen) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={`bg-white rounded-2xl shadow-2xl w-full ${widths[size]} border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <span className="p-2 bg-teal-100 text-teal-800 rounded-xl shrink-0">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-slate-800">{title}</h2>
              {subtitle && <p id={subtitleId} className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}
