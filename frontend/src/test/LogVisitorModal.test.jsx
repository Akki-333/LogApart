import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogVisitorModal from '../components/security/LogVisitorModal';

const units = [
  { unit_id: 7, number: 'A-2', floor: 3 },
  { unit_id: 9, number: 'B', floor: 1 }
];

const renderModal = (onSubmit = vi.fn().mockResolvedValue()) => {
  const user = userEvent.setup();
  render(<LogVisitorModal isOpen onClose={vi.fn()} onSubmit={onSubmit} units={units} />);
  return { user, onSubmit, home: screen.getByLabelText(/Visiting Home/) };
};

describe('the gate entry form', () => {
  it('puts the cursor in the home field when it opens', async () => {
    const { home } = renderModal();
    await waitFor(() => expect(home).toHaveFocus());
  });

  it('matches a typed home whatever its case and submits its id', async () => {
    const { user, onSubmit, home } = renderModal();

    await user.type(home, 'a-2');
    await user.type(screen.getByLabelText(/Visitor \/ Driver Name/), 'Ramesh Kumar');
    await user.click(screen.getByRole('button', { name: /Log Entry/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ unit_id: '7', visitor_name: 'Ramesh Kumar' }));
  });

  it('marks a home the building does not have as invalid', async () => {
    const { user, home } = renderModal();

    await user.type(home, 'Z-9');

    expect(home.validity.valid).toBe(false);
    expect(home.validationMessage).toBe('Choose a home from the list.');

    await user.clear(home);
    await user.type(home, 'B');
    expect(home.validity.valid).toBe(true);
  });

  it('fills a delivery in one tap', async () => {
    const { user } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Swiggy' }));

    expect(screen.getByLabelText(/Visitor \/ Driver Name/)).toHaveValue('Swiggy Delivery');
    expect(screen.getByLabelText(/Purpose of Visit/)).toHaveValue('DELIVERY');
  });
});
