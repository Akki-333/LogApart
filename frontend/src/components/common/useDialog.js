import { useEffect, useRef, useId } from 'react';

/**
 * The behaviour every dialog owes its user, separated from any particular
 * markup so the overlays that already exist can adopt it without being redrawn.
 *
 *   const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
 *   <div ref={dialogRef} {...dialogProps}> <h2 id={titleId}>...</h2>
 *
 * It announces the panel as a modal dialog named by its own heading, moves
 * focus in on open and hands it back on close, keeps Tab inside it, closes on
 * Escape, and stops the page behind from scrolling.
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function useDialog(isOpen, onClose) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  // Parents usually pass an inline arrow, which changes every render. Reading
  // the latest one through a ref keeps focus from being re-stolen on each render.
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    // Remember what had focus, or closing drops the keyboard user at the top
    // of the document with no idea where they are.
    openerRef.current = document.activeElement;

    const panel = dialogRef.current;
    (panel?.querySelector(FOCUSABLE) || panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];

      // Only intervene at the edges, so Tab behaves normally in between.
      if (document.activeElement === edge || !panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (openerRef.current instanceof HTMLElement && document.contains(openerRef.current)) {
        openerRef.current.focus();
      }
    };
  }, [isOpen]);

  return {
    dialogRef,
    titleId,
    dialogProps: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabIndex: -1 }
  };
}
