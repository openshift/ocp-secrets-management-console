import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertVariant,
  EmptyState,
  EmptyStateBody,
  Pagination,
  PaginationVariant,
} from '@patternfly/react-core';

interface Column {
  title: string;
  width?: number;
}

interface Row {
  cells: React.ReactNode[];
}

interface ResourceTableProps {
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  error?: string;
  emptyStateTitle?: string;
  emptyStateBody?: string;
  /** When set, fallback empty state body is project-aware (e.g. "in project X" vs "in the demo project"). */
  selectedProject?: string;
  /** Default number of rows per page. */
  defaultPerPage?: number;
  'data-test'?: string;
}

const DEFAULT_PER_PAGE = 10;

const PER_PAGE_OPTIONS = [
  { title: '10', value: 10 },
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
];

export const ResourceTable: React.FC<ResourceTableProps> = ({
  columns,
  rows,
  loading,
  error,
  emptyStateTitle,
  emptyStateBody,
  selectedProject,
  defaultPerPage,
  'data-test': dataTest,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const resolvedDefaultPerPage =
    typeof defaultPerPage === 'number' ? defaultPerPage : DEFAULT_PER_PAGE;
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(resolvedDefaultPerPage);

  const itemCount = rows.length;
  const maxPage = Math.max(1, Math.ceil(itemCount / perPage) || 1);
  // Derive a safe page so deletes/filters that shrink the list never leave an empty page.
  const currentPage = page > maxPage ? maxPage : page;

  const defaultEmptyStateBody =
    selectedProject && selectedProject !== 'all'
      ? t('No resources of this type are currently available in project {{project}}.', {
          project: selectedProject,
        })
      : t('No resources of this type are currently available in all projects.');

  if (loading) {
    return (
      <div className="co-m-loader co-an-fade-in-out" data-test={`${dataTest}-loading`}>
        <div className="co-m-loader-dot__one"></div>
        <div className="co-m-loader-dot__two"></div>
        <div className="co-m-loader-dot__three"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="co-m-pane__body" data-test={`${dataTest}-error`}>
        <Alert variant={AlertVariant.danger} title={t('Error loading resources')} isInline>
          {error}
        </Alert>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="co-m-pane__body" data-test={`${dataTest}-empty`}>
        <EmptyState
          variant="xs"
          headingLevel="h4"
          titleText={emptyStateTitle || t('No resources found')}
        >
          <EmptyStateBody>{emptyStateBody || defaultEmptyStateBody}</EmptyStateBody>
        </EmptyState>
      </div>
    );
  }

  // Calculate column widths - distribute evenly if no widths specified
  const totalSpecifiedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0);
  const hasSpecifiedWidths = totalSpecifiedWidth > 0;
  const defaultWidth = hasSpecifiedWidths ? undefined : 100 / columns.length;

  const subtleBorder = '1px solid #e1e5e9';
  const showPagination = itemCount > resolvedDefaultPerPage;
  const pageStart = (currentPage - 1) * perPage;
  const pagedRows = rows.slice(pageStart, pageStart + perPage);
  const widgetBase = dataTest || 'resource-table';

  const onSetPage = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    newPage: number,
  ) => {
    setPage(newPage);
  };

  const onPerPageSelect = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    newPerPage: number,
    newPage: number,
  ) => {
    setPerPage(newPerPage);
    setPage(newPage);
  };

  const pagination = (variant: typeof PaginationVariant.top, widgetId: string) => (
    <div data-test={widgetId} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Pagination
        itemCount={itemCount}
        page={currentPage}
        perPage={perPage}
        perPageOptions={PER_PAGE_OPTIONS}
        onSetPage={onSetPage}
        onPerPageSelect={onPerPageSelect}
        variant={variant}
        widgetId={widgetId}
        titles={{
          itemsPerPage: t('Items per page'),
          perPageSuffix: t('per page'),
          toFirstPageAriaLabel: t('Go to first page'),
          toPreviousPageAriaLabel: t('Go to previous page'),
          toNextPageAriaLabel: t('Go to next page'),
          toLastPageAriaLabel: t('Go to last page'),
          currPageAriaLabel: t('Current page'),
          paginationAriaLabel: t('Pagination'),
          ofWord: t('of'),
        }}
      />
    </div>
  );

  return (
    <div className="co-m-table-grid" style={{ border: 'none' }} data-test={dataTest}>
      <div className="table-responsive" style={{ border: 'none' }}>
        <table
          className="table table-hover"
          style={{
            tableLayout: 'fixed',
            width: '100%',
            minWidth: columns.length * 110,
            borderCollapse: 'collapse',
            border: 'none',
          }}
        >
          <thead>
            <tr style={{ borderBottom: subtleBorder }}>
              {columns.map((column, index) => {
                const width = hasSpecifiedWidths
                  ? `${String(column.width || 0)}%`
                  : `${String(defaultWidth)}%`;

                return (
                  <th
                    key={index}
                    role="columnheader"
                    style={{
                      width,
                      paddingLeft: '1rem',
                      paddingRight: '1rem',
                      textAlign: 'left',
                      verticalAlign: 'middle',
                      border: 'none',
                    }}
                  >
                    {column.title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIndex) => (
              <tr key={pageStart + rowIndex} style={{ borderBottom: subtleBorder }}>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    style={{
                      paddingLeft: '1rem',
                      paddingRight: '1rem',
                      textAlign: 'left',
                      verticalAlign: 'middle',
                      wordWrap: 'break-word',
                      overflow: 'hidden',
                      border: 'none',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPagination && pagination(PaginationVariant.bottom, `${widgetBase}-pagination-bottom`)}
    </div>
  );
};
