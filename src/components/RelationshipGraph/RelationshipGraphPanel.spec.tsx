import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelationshipGraphPanel } from './RelationshipGraphPanel';
import { useRelationshipGraph } from '../../hooks/useRelationshipGraph';

jest.mock('../../hooks/useRelationshipGraph', () => ({
  useRelationshipGraph: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseRelationshipGraph = useRelationshipGraph as jest.Mock;

const HELP_TEXT =
  'Shows how this resource depends on, is depended on by, and produces other resources. Fetched on demand (not watched).';

const DARK_THEME_CLASSES = ['pf-v6-theme-dark', 'pf-v5-theme-dark', 'pf-theme-dark'];

describe('RelationshipGraphPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DARK_THEME_CLASSES.forEach((cls) => {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    });
  });

  it('renders the relationship description in white when the console dark theme is active', () => {
    document.documentElement.classList.add('pf-v6-theme-dark');
    mockUseRelationshipGraph.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      hasFetched: false,
      fetch: jest.fn(),
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(screen.getByText(HELP_TEXT)).toHaveStyle({ color: '#ffffff' });
  });

  it('does not fetch data until the panel is expanded', async () => {
    const fetch = jest.fn();
    mockUseRelationshipGraph.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      hasFetched: false,
      fetch,
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(fetch).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Related resources' }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading spinner while resolving relationships', () => {
    mockUseRelationshipGraph.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      hasFetched: true,
      fetch: jest.fn(),
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(screen.getByText('Loading related resources...')).toBeInTheDocument();
  });

  it('shows an inline error when the resolver fails', () => {
    mockUseRelationshipGraph.mockReturnValue({
      data: undefined,
      loading: false,
      error: 'Something went wrong',
      hasFetched: true,
      fetch: jest.fn(),
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(screen.getByTestId('relationship-graph-error')).toBeInTheDocument();
  });

  it('shows warnings (e.g. insufficient permissions) without hiding the rest of the graph', () => {
    mockUseRelationshipGraph.mockReturnValue({
      data: {
        nodes: [
          {
            id: 'root',
            kind: 'Certificate',
            name: 'x',
            group: 'root',
            isRoot: true,
            status: 'ready',
          },
          { id: 'issuer', kind: 'Issuer', name: 'y', group: 'upstream', status: 'ready' },
        ],
        edges: [{ id: 'root->issuer', source: 'root', target: 'issuer', label: 'issuerRef' }],
        warnings: ['Insufficient permissions to list Deployment'],
      },
      loading: false,
      error: undefined,
      hasFetched: true,
      fetch: jest.fn(),
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(screen.getByTestId('relationship-graph-warnings')).toBeInTheDocument();
    expect(screen.getByTestId('relationship-graph')).toBeInTheDocument();
  });

  it('shows an empty state when only the root node was found', () => {
    mockUseRelationshipGraph.mockReturnValue({
      data: {
        nodes: [
          {
            id: 'root',
            kind: 'Certificate',
            name: 'x',
            group: 'root',
            isRoot: true,
            status: 'ready',
          },
        ],
        edges: [],
        warnings: [],
      },
      loading: false,
      error: undefined,
      hasFetched: true,
      fetch: jest.fn(),
      refresh: jest.fn(),
    });

    render(
      <RelationshipGraphPanel
        kind="Certificate"
        resource={{ metadata: { name: 'x' } }}
        namespace="demo"
        name="x"
      />,
    );

    expect(
      screen.getByText('No related resources were found for this resource.'),
    ).toBeInTheDocument();
  });
});
