import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateVariant,
  Button,
  Content,
  ContentVariants,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';

/**
 * Minimal empty state shown when no supported operators are detected at all.
 * Avoids taking up large screen real estate or prominently suggesting installs
 * — the admin may have intentionally chosen an alternate solution.
 */
export const NoOperatorsInstalled: React.FC = () => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const navigate = useNavigate();

  return (
    <EmptyState
      titleText={t('No supported secrets operators detected')}
      headingLevel="h4"
      variant={EmptyStateVariant.sm}
      icon={CubesIcon}
    >
      <EmptyStateBody>
        <Content component={ContentVariants.p}>
          {t(
            'Install a supported operator (cert-manager, External Secrets Operator, or Secrets Store CSI Driver) to manage secrets from this page.',
          )}
        </Content>
      </EmptyStateBody>
      <EmptyStateActions>
        <Button variant="link" onClick={() => navigate('/catalog/ns/default')}>
          {t('Go to Catalog')}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
};
