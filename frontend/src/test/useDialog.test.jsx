import { describe, it, expect, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useDialog from '../components/common/useDialog';

// jsdom lays nothing out, so every element reports no offsetParent and would
// look hidden to the focus trap. Pretend each element sits in its parent.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode; }
  });
});

function Panel({ open, onClose }) {
  const { dialogRef, dialogProps, titleId } = useDialog(open, onClose);
  if (!open) return null;

  return (
    <div ref={dialogRef} {...dialogProps}>
      <h2 id={titleId}>Edit visitor</h2>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

function Page() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Panel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const openDialog = async () => {
  const user = userEvent.setup();
  render(<Page />);
  await user.click(screen.getByText('Open'));
  return user;
};

describe('useDialog', () => {
  it('announces a modal dialog named by its heading and moves focus in', async () => {
    await openDialog();

    const dialog = screen.getByRole('dialog', { name: 'Edit visitor' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('First')).toHaveFocus();
  });

  it('keeps Tab inside the dialog at both edges', async () => {
    await openDialog();

    screen.getByText('Last').focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(screen.getByText('First')).toHaveFocus();

    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('Last')).toHaveFocus();
  });

  it('closes on Escape and hands focus back to what opened it', async () => {
    const user = await openDialog();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('holds the page still while open and lets it go after', async () => {
    const user = await openDialog();
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });
});
