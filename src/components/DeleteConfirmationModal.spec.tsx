import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? Object.entries(opts).reduce(
            (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
            key,
          )
        : key,
  }),
}));

describe('DeleteConfirmationModal', () => {
  it('keeps Delete disabled when resourceName is empty', () => {
    render(
      <DeleteConfirmationModal
        isOpen={true}
        resourceName=""
        resourceType="Issuer"
        isDeleting={false}
        error={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('does not enable Delete until confirmation input matches resource name', async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmationModal
        isOpen={true}
        resourceName="my-resource"
        resourceType="Issuer"
        isDeleting={false}
        error={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'wrong');
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText('Type resource name to confirm deletion'));
    await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'my-resource');
    expect(confirm).toBeEnabled();
  });
});
