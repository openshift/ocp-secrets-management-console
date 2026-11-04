import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Alert, AlertVariant, TextInput } from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  resourceName: string;
  resourceType: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  resourceName,
  resourceType,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [confirmationInput, setConfirmationInput] = React.useState('');

  const nameMatches = Boolean(resourceName) && confirmationInput === resourceName;

  React.useEffect(() => {
    if (!isOpen) {
      setConfirmationInput('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!nameMatches || isDeleting) return;
    onConfirm();
  };

  return (
    <Modal
      variant={ModalVariant.small}
      title={`${t('Delete')} ${resourceType}`}
      isOpen={isOpen}
      onClose={onCancel}
    >
      <div style={{ padding: '1.5rem' }}>
        {error && (
          <Alert
            variant={AlertVariant.danger}
            title={t('Delete failed')}
            isInline
            style={{ marginBottom: '1.5rem' }}
          >
            {error}
          </Alert>
        )}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ marginBottom: '1rem', fontSize: '1rem', lineHeight: '1.5' }}>
            {t('Are you sure you want to delete the {{resourceType}} "{{resourceName}}"?', {
              resourceType,
              resourceName,
            })}
          </p>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6a737d' }}>
            <strong>{t('This action cannot be undone.')}</strong>
          </p>
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="delete-confirmation-input"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {t('Please type {{resourceName}} to confirm.', { resourceName })}
          </label>
          <TextInput
            id="delete-confirmation-input"
            value={confirmationInput}
            onChange={(_event, value) => setConfirmationInput(value)}
            placeholder={resourceName}
            aria-label={t('Type resource name to confirm deletion')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e1e5e9',
          }}
        >
          <Button key="cancel" variant="link" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            key="confirm"
            variant="danger"
            onClick={handleConfirm}
            isDisabled={!nameMatches || isDeleting}
            isLoading={isDeleting}
            spinnerAriaValueText={isDeleting ? t('Deleting...') : undefined}
          >
            {isDeleting ? t('Deleting...') : t('Delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
