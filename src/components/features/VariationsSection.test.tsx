import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VariationsSection } from './VariationsSection';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const { toast } = await import('sonner');

/**
 * The bug this covers: `VariationDialog.submit` awaited `onSubmit` with no
 * catch, so a rejected insert produced no toast and left the dialog sitting
 * there — pressing Add looked like it did nothing.
 */
function renderSection(onAdd: (input: unknown) => Promise<void>) {
  return render(
    <MemoryRouter>
      <VariationsSection
        projectId="p1"
        projectName="Preston High School"
        variations={[]}
        timeEntries={[]}
        materialEntries={[]}
        workers={[]}
        approvedTotal={0}
        canSeeFinancials={false}
        onAdd={onAdd as never}
      />
    </MemoryRouter>,
  );
}

async function openAndSubmit(description = 'Sick bay — repaint walls') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /add variation/i }));
  await user.type(await screen.findByPlaceholderText(/sick bay/i), description);
  await user.click(screen.getByRole('button', { name: /^add$/i }));
  return user;
}

describe('VariationDialog — a save that fails', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it('shows the database message, not a generic "failed"', async () => {
    // supabase-js rejects with a PostgrestError: a plain object, not an Error.
    const onAdd = vi.fn().mockRejectedValue({
      message: 'new row violates row-level security policy for table "project_variations"',
      details: null,
      hint: null,
      code: '42501',
    });
    renderSection(onAdd);
    await openAndSubmit();

    expect(onAdd).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith(
      'new row violates row-level security policy for table "project_variations"',
    );
  });

  it('keeps the dialog open with the typed work still in it', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('network down'));
    renderSection(onAdd);
    await openAndSubmit('Sick bay — repaint walls');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/sick bay/i)).toHaveValue('Sick bay — repaint walls');
  });

  it('clears the form when the save works', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderSection(onAdd);
    await openAndSubmit();

    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never reaches the database without a description', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderSection(onAdd);
    await user.click(screen.getByRole('button', { name: /add variation/i }));
    await user.click(await screen.findByRole('button', { name: /^add$/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Description is required');
  });
});
