import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackProvider, useFeedback } from '../components/common/Feedback';

function Harness({ onResult }) {
  const { confirm, askReason, toast } = useFeedback();

  return (
    <>
      <button type="button" onClick={async () => onResult(await confirm({ title: 'Remove the bay?', confirmLabel: 'Remove' }))}>
        ask confirm
      </button>
      <button type="button" onClick={async () => onResult(await askReason({ title: 'Why is it going?', minLength: 5 }))}>
        ask reason
      </button>
      <button type="button" onClick={() => toast.success('Payment recorded.')}>
        say something
      </button>
    </>
  );
}

const setup = () => {
  const onResult = vi.fn();
  const user = userEvent.setup();
  render(<FeedbackProvider><Harness onResult={onResult} /></FeedbackProvider>);
  return { onResult, user };
};

describe('confirm', () => {
  it('opens a named dialog and resolves true when confirmed', async () => {
    const { onResult, user } = setup();

    await user.click(screen.getByText('ask confirm'));
    expect(screen.getByRole('dialog', { name: 'Remove the bay?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when dismissed with Escape', async () => {
    const { onResult, user } = setup();

    await user.click(screen.getByText('ask confirm'));
    await user.keyboard('{Escape}');

    expect(onResult).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('askReason', () => {
  it('refuses a reason that is too short, then accepts a real one', async () => {
    const { onResult, user } = setup();

    await user.click(screen.getByText('ask reason'));
    await user.type(screen.getByLabelText('Reason'), 'no');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 5 characters');
    expect(onResult).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), ', logged against the wrong home  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onResult).toHaveBeenCalledWith('no, logged against the wrong home');
  });

  it('resolves null when cancelled, the way prompt() did', async () => {
    const { onResult, user } = setup();

    await user.click(screen.getByText('ask reason'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onResult).toHaveBeenCalledWith(null);
  });
});

describe('toast', () => {
  it('announces a success without taking focus', async () => {
    const { user } = setup();
    const trigger = screen.getByText('say something');

    await user.click(trigger);

    expect(screen.getByRole('status')).toHaveTextContent('Payment recorded.');
    expect(trigger).toHaveFocus();
  });
});
