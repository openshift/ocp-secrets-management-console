import { render, screen } from '@testing-library/react';
import { RelationshipGraph } from './RelationshipGraph';
import type { GraphEdge, GraphNode } from './relationshipTypes';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const nodes: GraphNode[] = [
  {
    id: 'store',
    kind: 'SecretStore',
    name: 'test-store-1',
    group: 'upstream',
    status: 'ready',
    href: '/store',
  },
  {
    id: 'es',
    kind: 'ExternalSecret',
    name: 'demo-secret-1',
    group: 'root',
    isRoot: true,
    status: 'ready',
    href: '/es',
  },
  {
    id: 'secret',
    kind: 'Secret',
    name: 'runtime-secret-1',
    group: 'secret',
    status: 'ready',
    href: '/secret',
  },
];

const edges: GraphEdge[] = [
  { id: 'e1', source: 'es', target: 'store', label: 'secretStoreRef' },
  { id: 'e2', source: 'es', target: 'secret', label: 'creates' },
];

const DARK_CLASSES = ['pf-v6-theme-dark', 'pf-v5-theme-dark', 'pf-theme-dark'];

function clearTheme() {
  DARK_CLASSES.forEach((cls) => {
    document.documentElement.classList.remove(cls);
    document.body.classList.remove(cls);
  });
}

function nodeBox(kind: string, name: string): HTMLElement {
  return screen.getByTestId(`relationship-graph-node-${kind}-${name}`);
}

function kindOf(node: HTMLElement): HTMLElement {
  return node.querySelector('[data-test="relationship-graph-node-kind"]') as HTMLElement;
}

function nameOf(node: HTMLElement): HTMLElement {
  return node.querySelector('[data-test="relationship-graph-node-name"]') as HTMLElement;
}

function statusOf(node: HTMLElement): HTMLElement {
  return node.querySelector('[data-test="relationship-graph-node-status"]') as HTMLElement;
}

describe('RelationshipGraph', () => {
  beforeEach(clearTheme);

  it('lays the inspected resource above its dependencies in a top-down tree', () => {
    render(<RelationshipGraph nodes={nodes} edges={edges} onNavigate={jest.fn()} />);

    const root = nodeBox('ExternalSecret', 'demo-secret-1');
    const store = nodeBox('SecretStore', 'test-store-1');
    const secret = nodeBox('Secret', 'runtime-secret-1');

    const rootTop = parseFloat(root.style.top);
    const storeTop = parseFloat(store.style.top);
    const storeLeft = parseFloat(store.style.left);
    const secretLeft = parseFloat(secret.style.left);
    const rootLeft = parseFloat(root.style.left);

    expect(rootTop).toBeLessThan(storeTop);
    expect(storeTop).toBe(parseFloat(secret.style.top));
    expect(storeLeft).toBeLessThan(secretLeft);
    expect(rootLeft).toBeCloseTo((storeLeft + secretLeft) / 2, 0);
    expect(kindOf(root).textContent).toBe('External Secret');
  });

  it('uses flat white cards and gray connectors in light mode', () => {
    render(<RelationshipGraph nodes={nodes} edges={edges} onNavigate={jest.fn()} />);

    const canvas = screen.getByTestId('relationship-graph');
    const root = nodeBox('ExternalSecret', 'demo-secret-1');
    const store = nodeBox('SecretStore', 'test-store-1');
    const secret = nodeBox('Secret', 'runtime-secret-1');

    expect(canvas).toHaveAttribute('data-theme', 'light');
    expect(canvas.style.backgroundColor).toBe('rgb(249, 250, 251)');

    expect(root.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(root.style.borderLeftColor).toBe('rgb(107, 70, 193)');
    expect(kindOf(root).style.color).toBe('rgb(107, 70, 193)');
    expect(nameOf(root).style.color).toBe('rgb(17, 24, 39)');

    expect(store.style.borderLeftColor).toBe('rgb(29, 78, 216)');
    expect(kindOf(store).style.color).toBe('rgb(29, 78, 216)');
    expect(secret.style.borderLeftColor).toBe('rgb(180, 83, 9)');
    expect(kindOf(secret).style.color).toBe('rgb(180, 83, 9)');

    expect(statusOf(root).style.backgroundColor).toBe('rgb(222, 247, 236)');
    expect(statusOf(root).style.color).toBe('rgb(3, 84, 63)');

    const label = screen.getAllByTestId('relationship-graph-edge-label')[0];
    expect(label.style.color).toBe('rgb(75, 85, 99)');
    expect(screen.getAllByTestId('relationship-graph-edge')[0].getAttribute('stroke')).toBe(
      '#D1D5DB',
    );
  });

  it('uses the dark card palette when the console dark theme class is set', () => {
    document.documentElement.classList.add('pf-v6-theme-dark');
    render(<RelationshipGraph nodes={nodes} edges={edges} onNavigate={jest.fn()} />);

    const canvas = screen.getByTestId('relationship-graph');
    const root = nodeBox('ExternalSecret', 'demo-secret-1');
    const store = nodeBox('SecretStore', 'test-store-1');
    const secret = nodeBox('Secret', 'runtime-secret-1');

    expect(canvas).toHaveAttribute('data-theme', 'dark');
    expect(canvas.style.backgroundColor).toBe('rgb(18, 18, 20)');
    expect(canvas.style.backgroundImage).toContain('linear-gradient');

    expect(root.style.backgroundColor).toBe('rgb(30, 27, 75)');
    expect(root.style.borderLeftColor).toBe('rgb(168, 85, 247)');
    expect(kindOf(root).style.color).toBe('rgb(192, 132, 252)');
    expect(nameOf(root).style.color).toBe('rgb(255, 255, 255)');

    expect(store.style.backgroundColor).toBe('rgb(15, 23, 42)');
    expect(store.style.borderLeftColor).toBe('rgb(59, 130, 246)');
    expect(kindOf(store).style.color).toBe('rgb(96, 165, 250)');
    expect(nameOf(store).style.color).toBe('rgb(226, 232, 240)');

    expect(secret.style.backgroundColor).toBe('rgb(28, 25, 23)');
    expect(secret.style.borderLeftColor).toBe('rgb(245, 158, 11)');
    expect(kindOf(secret).style.color).toBe('rgb(253, 186, 116)');

    expect(statusOf(secret).style.backgroundColor).toBe('rgb(6, 78, 59)');
    expect(statusOf(secret).style.color).toBe('rgb(52, 211, 153)');

    expect(screen.getAllByTestId('relationship-graph-edge')[0].getAttribute('stroke')).toBe(
      '#3F3F46',
    );
  });
});
