import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceTable } from './ResourceTable';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const columns = [{ title: 'Name' }, { title: 'Status' }];

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    cells: [`resource-${String(i + 1)}`, `status-${String(i + 1)}`],
  }));
}

describe('ResourceTable', () => {
  describe('empty / loading / error', () => {
    it('renders loading state', () => {
      render(<ResourceTable columns={columns} rows={[]} loading data-test="res-table" />);
      expect(screen.getByTestId('res-table-loading')).toBeInTheDocument();
    });

    it('renders error state', () => {
      render(<ResourceTable columns={columns} rows={[]} error="boom" data-test="res-table" />);
      expect(screen.getByTestId('res-table-error')).toBeInTheDocument();
      expect(screen.getByText('boom')).toBeInTheDocument();
    });

    it('renders friendly permission message without raw API error text', () => {
      const friendly =
        'You do not have permission to list Issuers in project app.';
      render(
        <ResourceTable columns={columns} rows={[]} error={friendly} data-test="res-table" />,
      );
      const alert = screen.getByTestId('res-table-error');
      expect(alert).toHaveTextContent(friendly);
      expect(alert).not.toHaveTextContent('Forbidden:');
    });

    it('renders empty state when there are no rows', () => {
      render(
        <ResourceTable
          columns={columns}
          rows={[]}
          emptyStateTitle="No certificates found"
          data-test="res-table"
        />,
      );
      expect(screen.getByTestId('res-table-empty')).toBeInTheDocument();
      expect(screen.getByText('No certificates found')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('does not show pagination when row count is within the default page size', () => {
      render(<ResourceTable columns={columns} rows={makeRows(10)} data-test="res-table" />);

      expect(screen.queryByTestId('res-table-pagination-bottom')).not.toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(11); // header + 10 body rows
    });

    it('shows bottom pagination only when rows exceed the default page size', () => {
      render(<ResourceTable columns={columns} rows={makeRows(11)} data-test="res-table" />);

      expect(screen.queryByTestId('res-table-pagination-top')).not.toBeInTheDocument();
      expect(screen.getByTestId('res-table-pagination-bottom')).toBeInTheDocument();
    });

    it('renders only the current page of rows by default (10 per page)', () => {
      render(<ResourceTable columns={columns} rows={makeRows(25)} data-test="res-table" />);

      expect(screen.getByText('resource-1')).toBeInTheDocument();
      expect(screen.getByText('resource-10')).toBeInTheDocument();
      expect(screen.queryByText('resource-11')).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId('res-table-pagination-bottom')).getByRole('button', {
          name: '1 - 10 of 25',
        }),
      ).toBeInTheDocument();
    });

    it('navigates to the next page', async () => {
      const user = userEvent.setup();
      render(<ResourceTable columns={columns} rows={makeRows(25)} data-test="res-table" />);

      const bottomPagination = screen.getByTestId('res-table-pagination-bottom');
      await user.click(within(bottomPagination).getByRole('button', { name: 'Go to next page' }));

      expect(screen.queryByText('resource-1')).not.toBeInTheDocument();
      expect(screen.getByText('resource-11')).toBeInTheDocument();
      expect(screen.getByText('resource-20')).toBeInTheDocument();
      expect(screen.queryByText('resource-21')).not.toBeInTheDocument();
    });

    it('navigates to the last and first page', async () => {
      const user = userEvent.setup();
      render(<ResourceTable columns={columns} rows={makeRows(25)} data-test="res-table" />);

      const bottomPagination = screen.getByTestId('res-table-pagination-bottom');
      await user.click(within(bottomPagination).getByRole('button', { name: 'Go to last page' }));

      expect(screen.getByText('resource-21')).toBeInTheDocument();
      expect(screen.getByText('resource-25')).toBeInTheDocument();
      expect(screen.queryByText('resource-20')).not.toBeInTheDocument();

      await user.click(within(bottomPagination).getByRole('button', { name: 'Go to first page' }));

      expect(screen.getByText('resource-1')).toBeInTheDocument();
      expect(screen.queryByText('resource-21')).not.toBeInTheDocument();
    });

    it('changes the page size via per-page options', async () => {
      const user = userEvent.setup();
      render(<ResourceTable columns={columns} rows={makeRows(25)} data-test="res-table" />);

      const bottomPagination = screen.getByTestId('res-table-pagination-bottom');
      await user.click(within(bottomPagination).getByRole('button', { name: '1 - 10 of 25' }));
      await user.click(await screen.findByRole('menuitem', { name: '20 per page' }));

      expect(screen.getByText('resource-1')).toBeInTheDocument();
      expect(screen.getByText('resource-20')).toBeInTheDocument();
      expect(screen.queryByText('resource-21')).not.toBeInTheDocument();
    });

    it('clamps to the last valid page when the row count shrinks', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <ResourceTable columns={columns} rows={makeRows(25)} data-test="res-table" />,
      );

      const bottomPagination = screen.getByTestId('res-table-pagination-bottom');
      await user.click(within(bottomPagination).getByRole('button', { name: 'Go to last page' }));
      expect(screen.getByText('resource-25')).toBeInTheDocument();

      rerender(<ResourceTable columns={columns} rows={makeRows(5)} data-test="res-table" />);

      // With 5 rows (<= default page size), pagination hides and all rows show
      expect(screen.queryByTestId('res-table-pagination-bottom')).not.toBeInTheDocument();
      expect(screen.getByText('resource-1')).toBeInTheDocument();
      expect(screen.getByText('resource-5')).toBeInTheDocument();
    });

    it('respects a custom defaultPerPage', () => {
      render(
        <ResourceTable
          columns={columns}
          rows={makeRows(12)}
          defaultPerPage={20}
          data-test="res-table"
        />,
      );

      // 12 <= 20, so pagination should be hidden and all rows shown
      expect(screen.queryByTestId('res-table-pagination-bottom')).not.toBeInTheDocument();
      expect(screen.getByText('resource-12')).toBeInTheDocument();
    });
  });
});
