// Collapsible panel wired into the Inspect page. Lazily resolves and renders the
// relationship graph for the currently inspected resource; see relationshipResolvers.ts
// for the traversal logic and RelationshipGraph.tsx for the SVG rendering.
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardBody,
  ExpandableSection,
  Alert,
  AlertVariant,
  Button,
  Spinner,
  EmptyState,
  EmptyStateBody,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { useRelationshipGraph } from '../../hooks/useRelationshipGraph';
import type { MinimalK8sResource } from './relationshipTypes';
import { RelationshipGraph } from './RelationshipGraph';

export interface RelationshipGraphPanelProps {
  /** Kubernetes Kind of the currently inspected resource, e.g. "Certificate". */
  kind: string;
  resource: MinimalK8sResource | undefined;
  namespace: string | undefined;
  name: string;
}

export const RelationshipGraphPanel: React.FC<RelationshipGraphPanelProps> = ({
  kind,
  resource,
  namespace,
  name,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { data, loading, error, hasFetched, fetch, refresh } = useRelationshipGraph({
    kind,
    resource,
    namespace,
    name,
  });

  const handleToggle = (_event: React.MouseEvent, expanded: boolean) => {
    setIsExpanded(expanded);
    if (expanded && !hasFetched) {
      fetch();
    }
  };

  const handleNavigate = (href: string) => {
    window.location.href = href;
  };

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  return (
    <Card>
      <CardBody style={{ padding: 0 }}>
        <ExpandableSection
          toggleText={
            hasFetched && data && nodeCount > 1
              ? `${t('Related resources')} (${String(nodeCount - 1)})`
              : t('Related resources')
          }
          onToggle={handleToggle}
          isExpanded={isExpanded}
          data-test="relationship-graph-panel-toggle"
        >
          <div style={{ padding: '0 16px 16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                {t(
                  'Shows how this resource depends on, is depended on by, and produces other resources. Fetched on demand (not watched).',
                )}
              </span>
              <Button
                variant="link"
                icon={<SyncAltIcon />}
                onClick={refresh}
                isDisabled={loading}
                data-test="relationship-graph-refresh"
              >
                {t('Refresh')}
              </Button>
            </div>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '24px' }}>
                <Spinner size="md" />
                <span>{t('Loading related resources...')}</span>
              </div>
            )}

            {!loading && error && (
              <Alert
                variant={AlertVariant.danger}
                isInline
                title={t('Could not load related resources')}
                data-test="relationship-graph-error"
              >
                {error}
              </Alert>
            )}

            {!loading && !error && data && data.warnings.length > 0 && (
              <Alert
                variant={AlertVariant.info}
                isInline
                title={t('Some relationships could not be checked')}
                style={{ marginBottom: '12px' }}
                data-test="relationship-graph-warnings"
              >
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {!loading && !error && data && data.nodes.length <= 1 && (
              <EmptyState variant="xs">
                <EmptyStateBody>
                  {t('No related resources were found for this resource.')}
                </EmptyStateBody>
              </EmptyState>
            )}

            {!loading && !error && data && data.nodes.length > 1 && (
              <RelationshipGraph
                nodes={data.nodes}
                edges={data.edges}
                onNavigate={handleNavigate}
              />
            )}

            {!loading && !error && data && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                {t('{{nodeCount}} resources, {{edgeCount}} relationships', {
                  nodeCount,
                  edgeCount,
                })}
              </div>
            )}
          </div>
        </ExpandableSection>
      </CardBody>
    </Card>
  );
};
