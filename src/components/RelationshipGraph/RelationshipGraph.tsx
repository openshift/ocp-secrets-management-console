// Top-down dependency tree for the inspect page. The console has a light theme and a
// dark theme; colors are chosen per theme (not inherited from the page) so the cards,
// connectors, and status badges match in both.
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TimesCircleIcon,
  UnknownIcon,
  BanIcon,
} from '@patternfly/react-icons';
import type { GraphEdge, GraphNode, NodeGroup, NodeStatus } from './relationshipTypes';

export interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Called with the node's href when a clickable node is activated. */
  onNavigate: (href: string) => void;
}

const NODE_WIDTH = 236;
const NODE_HEIGHT = 96;
const H_GAP = 160;
const V_GAP = 108;
const PADDING = 36;

/** Rows of the tree, top to bottom. Empty rows are dropped. */
const TIER_ROWS: NodeGroup[][] = [['root'], ['upstream', 'downstream', 'secret'], ['workload']];

const DARK_THEME_CLASSES = ['pf-v6-theme-dark', 'pf-v5-theme-dark', 'pf-theme-dark'];

type ThemeName = 'light' | 'dark';

interface RoleStyle {
  background: string;
  accent: string;
  kind: string;
  name: string;
  shadow: string;
}

interface StatusStyle {
  background: string;
  color: string;
  icon: React.ReactNode;
  label: string;
}

interface GraphTheme {
  canvas: string;
  grid: string;
  border: string;
  line: string;
  label: string;
  roles: Record<NodeGroup, RoleStyle>;
  missing: RoleStyle;
  forbidden: RoleStyle;
  status: Record<NodeStatus, StatusStyle>;
}

const LIGHT_SHADOW = '0 1px 2px rgba(17, 24, 39, 0.06), 0 8px 16px rgba(17, 24, 39, 0.06)';
const DARK_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.45), 0 8px 18px rgba(0, 0, 0, 0.35)';

function role(
  background: string,
  accent: string,
  kind: string,
  name: string,
  shadow: string,
): RoleStyle {
  return { background, accent, kind, name, shadow };
}

const LIGHT_THEME: GraphTheme = {
  canvas: '#F9FAFB',
  grid: 'none',
  border: '#E5E7EB',
  line: '#D1D5DB',
  label: '#4B5563',
  roles: {
    root: role('#FFFFFF', '#6B46C1', '#6B46C1', '#111827', LIGHT_SHADOW),
    upstream: role('#FFFFFF', '#1D4ED8', '#1D4ED8', '#111827', LIGHT_SHADOW),
    downstream: role('#FFFFFF', '#0F766E', '#0F766E', '#111827', LIGHT_SHADOW),
    secret: role('#FFFFFF', '#B45309', '#B45309', '#111827', LIGHT_SHADOW),
    workload: role('#FFFFFF', '#4338CA', '#4338CA', '#111827', LIGHT_SHADOW),
  },
  missing: role('#FFFFFF', '#DC2626', '#DC2626', '#111827', LIGHT_SHADOW),
  forbidden: role('#FFFFFF', '#6B7280', '#6B7280', '#111827', LIGHT_SHADOW),
  status: {
    ready: {
      background: '#DEF7EC',
      color: '#03543F',
      icon: <CheckCircleIcon />,
      label: 'Ready',
    },
    'not-ready': {
      background: '#FEF3C7',
      color: '#92400E',
      icon: <ExclamationTriangleIcon />,
      label: 'Not ready',
    },
    unknown: {
      background: '#F3F4F6',
      color: '#374151',
      icon: <UnknownIcon />,
      label: 'Unknown',
    },
    'not-found': {
      background: '#FDE8E8',
      color: '#9B1C1C',
      icon: <TimesCircleIcon />,
      label: 'Not found',
    },
    forbidden: {
      background: '#F3F4F6',
      color: '#374151',
      icon: <BanIcon />,
      label: 'Insufficient permissions',
    },
  },
};

const DARK_GRID =
  'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)';

const DARK_THEME: GraphTheme = {
  canvas: '#121214',
  grid: DARK_GRID,
  border: '#27272A',
  line: '#3F3F46',
  label: '#A1A1AA',
  roles: {
    root: role(
      '#1E1B4B',
      '#A855F7',
      '#C084FC',
      '#FFFFFF',
      '0 0 0 1px rgba(168, 85, 247, 0.28), 0 0 22px rgba(168, 85, 247, 0.16)',
    ),
    upstream: role('#0F172A', '#3B82F6', '#60A5FA', '#E2E8F0', DARK_SHADOW),
    downstream: role('#042F2E', '#14B8A6', '#5EEAD4', '#E2E8F0', DARK_SHADOW),
    secret: role('#1C1917', '#F59E0B', '#FDBA74', '#E2E8F0', DARK_SHADOW),
    workload: role('#1C1836', '#818CF8', '#A5B4FC', '#E2E8F0', DARK_SHADOW),
  },
  missing: role('#1C1214', '#F87171', '#FCA5A5', '#E2E8F0', DARK_SHADOW),
  forbidden: role('#18181B', '#A1A1AA', '#D4D4D8', '#E2E8F0', DARK_SHADOW),
  status: {
    ready: {
      background: '#064E3B',
      color: '#34D399',
      icon: <CheckCircleIcon />,
      label: 'Ready',
    },
    'not-ready': {
      background: '#78350F',
      color: '#FCD34D',
      icon: <ExclamationTriangleIcon />,
      label: 'Not ready',
    },
    unknown: {
      background: '#27272A',
      color: '#D4D4D8',
      icon: <UnknownIcon />,
      label: 'Unknown',
    },
    'not-found': {
      background: '#7F1D1D',
      color: '#FCA5A5',
      icon: <TimesCircleIcon />,
      label: 'Not found',
    },
    forbidden: {
      background: '#27272A',
      color: '#D4D4D8',
      icon: <BanIcon />,
      label: 'Insufficient permissions',
    },
  },
};

const THEMES: Record<ThemeName, GraphTheme> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
};

function isDarkTheme(): boolean {
  const roots = [document.documentElement, document.body].filter(Boolean);
  return roots.some((el) => DARK_THEME_CLASSES.some((cls) => el.classList.contains(cls)));
}

export function useConsoleTheme(): ThemeName {
  const [theme, setTheme] = React.useState<ThemeName>(() => (isDarkTheme() ? 'dark' : 'light'));

  React.useEffect(() => {
    const update = () => setTheme(isDarkTheme() ? 'dark' : 'light');
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  return theme;
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

function layout(nodes: GraphNode[]): {
  positioned: PositionedNode[];
  width: number;
  height: number;
} {
  const rows = TIER_ROWS.map((groups) =>
    nodes.filter((node) => groups.includes(node.group)),
  ).filter((row) => row.length > 0);
  const known = new Set<NodeGroup>(TIER_ROWS.flat());
  const extras = nodes.filter((node) => !known.has(node.group));
  if (extras.length > 0) {
    if (rows.length === 0) rows.push(extras);
    else rows[rows.length - 1].push(...extras);
  }

  const rowWidths = rows.map(
    (row) => row.length * NODE_WIDTH + Math.max(0, row.length - 1) * H_GAP,
  );
  const contentWidth = Math.max(NODE_WIDTH, ...rowWidths, 0);
  const width = contentWidth + PADDING * 2;
  const height = PADDING * 2 + rows.length * NODE_HEIGHT + Math.max(0, rows.length - 1) * V_GAP;

  const positioned: PositionedNode[] = [];
  rows.forEach((row, rowIndex) => {
    const startX = PADDING + (contentWidth - rowWidths[rowIndex]) / 2;
    const y = PADDING + rowIndex * (NODE_HEIGHT + V_GAP);
    row.forEach((node, index) => {
      positioned.push({
        ...node,
        x: startX + index * (NODE_WIDTH + H_GAP),
        y,
      });
    });
  });

  return { positioned, width, height };
}

interface Point {
  x: number;
  y: number;
}

interface CubicCurve {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

/** Curve from the bottom-center of the upper card to the top-center of the lower card. */
function getCurve(source: PositionedNode, target: PositionedNode): CubicCurve {
  const sourceMidY = source.y + NODE_HEIGHT / 2;
  const targetMidY = target.y + NODE_HEIGHT / 2;
  const upper = sourceMidY <= targetMidY ? source : target;
  const lower = upper === source ? target : source;

  if (upper.y === lower.y) {
    const left = source.x <= target.x ? source : target;
    const right = left === source ? target : source;
    const p0 = { x: left.x + NODE_WIDTH, y: left.y + NODE_HEIGHT / 2 };
    const p3 = { x: right.x, y: right.y + NODE_HEIGHT / 2 };
    const dx = p3.x - p0.x;
    return {
      p0,
      c1: { x: p0.x + dx * 0.5, y: p0.y },
      c2: { x: p3.x - dx * 0.5, y: p3.y },
      p3,
    };
  }

  const p0 = { x: upper.x + NODE_WIDTH / 2, y: upper.y + NODE_HEIGHT + 2 };
  const p3 = { x: lower.x + NODE_WIDTH / 2, y: lower.y - 6 };
  const dy = p3.y - p0.y;
  return {
    p0,
    c1: { x: p0.x, y: p0.y + dy * 0.62 },
    c2: { x: p3.x, y: p3.y - dy * 0.62 },
    p3,
  };
}

const curveToPath = ({ p0, c1, c2, p3 }: CubicCurve): string =>
  `M ${String(p0.x)} ${String(p0.y)} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(
    c2.y,
  )}, ${String(p3.x)} ${String(p3.y)}`;

function pointOnCubicBezier({ p0, c1, c2, p3 }: CubicCurve, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p3.y,
  };
}

/** "ExternalSecret" -> "External Secret", rendered uppercase by CSS. */
function formatKind(kind: string): string {
  return kind.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function roleFor(theme: GraphTheme, node: GraphNode): RoleStyle {
  if (node.status === 'not-found') return theme.missing;
  if (node.status === 'forbidden') return theme.forbidden;
  return theme.roles[node.group];
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  nodes,
  edges,
  onNavigate,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const themeName = useConsoleTheme();
  const theme = THEMES[themeName];
  const { positioned, width, height } = React.useMemo(() => layout(nodes), [nodes]);
  const byId = React.useMemo(
    () => new Map(positioned.map((node) => [node.id, node])),
    [positioned],
  );

  return (
    <div
      data-test="relationship-graph"
      data-theme={themeName}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'auto',
        backgroundColor: theme.canvas,
        backgroundImage: theme.grid,
        backgroundSize: '24px 24px',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', minWidth: '100%' }}>
        <div style={{ position: 'relative', width, height }}>
          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={`rg-arrow-${themeName}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={theme.line} />
              </marker>
            </defs>
            {edges.map((edge) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (!source || !target) return null;
              return (
                <path
                  key={edge.id}
                  data-test="relationship-graph-edge"
                  d={curveToPath(getCurve(source, target))}
                  fill="none"
                  stroke={theme.line}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  markerEnd={`url(#rg-arrow-${themeName})`}
                />
              );
            })}
          </svg>

          {edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!source || !target) return null;
            const { x, y } = pointOnCubicBezier(getCurve(source, target), 0.5);
            return (
              <div
                key={`${edge.id}-label`}
                data-test="relationship-graph-edge-label"
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: 'translate(-50%, -50%)',
                  fontSize: '11px',
                  fontWeight: 500,
                  lineHeight: '14px',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                  color: theme.label,
                  backgroundColor: theme.canvas,
                  padding: '0 6px',
                  zIndex: 1,
                }}
              >
                {edge.label}
              </div>
            );
          })}

          {positioned.map((node) => {
            const roleStyle = roleFor(theme, node);
            const status = theme.status[node.status];
            const isClickable = Boolean(node.href);
            const button = (
              <button
                type="button"
                data-test={`relationship-graph-node-${node.kind}-${node.name}`}
                aria-disabled={!isClickable}
                onClick={() => {
                  if (node.href) onNavigate(node.href);
                }}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  padding: '12px 14px 12px 16px',
                  borderRadius: '12px',
                  borderTop: `1px solid ${themeName === 'light' ? '#E5E7EB' : 'rgba(255,255,255,0.08)'}`,
                  borderRight: `1px solid ${themeName === 'light' ? '#E5E7EB' : 'rgba(255,255,255,0.08)'}`,
                  borderBottom: `1px solid ${themeName === 'light' ? '#E5E7EB' : 'rgba(255,255,255,0.08)'}`,
                  borderLeft: `4px solid ${roleStyle.accent}`,
                  backgroundColor: roleStyle.background,
                  backgroundImage: 'none',
                  boxShadow: roleStyle.shadow,
                  color: roleStyle.name,
                  cursor: isClickable ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: '4px',
                  overflow: 'hidden',
                  zIndex: 2,
                  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                }}
                onMouseEnter={(event) => {
                  if (!isClickable) return;
                  event.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span
                  data-test="relationship-graph-node-kind"
                  style={{
                    fontSize: '10px',
                    lineHeight: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: roleStyle.kind,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatKind(node.kind)}
                </span>
                <span
                  data-test="relationship-graph-node-name"
                  title={node.name}
                  style={{
                    fontSize: '16px',
                    lineHeight: '20px',
                    fontWeight: 700,
                    color: roleStyle.name,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {node.name}
                </span>
                <span
                  data-test="relationship-graph-node-status"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    maxWidth: '100%',
                    marginTop: '2px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: status.background,
                    color: status.color,
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: '16px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', fontSize: '12px' }}>{status.icon}</span>
                  {t(status.label)}
                </span>
              </button>
            );

            return node.statusMessage ? (
              <Tooltip key={node.id} content={node.statusMessage}>
                {button}
              </Tooltip>
            ) : (
              <React.Fragment key={node.id}>{button}</React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
