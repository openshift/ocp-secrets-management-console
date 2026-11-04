// Pure rendering component: draws the nodes-and-edges graph produced by
// relationshipResolvers.ts. Deliberately dependency-free (no graph/diagram library) --
// uses a small layered layout plus SVG for edges and PatternFly for node/label chrome.
// Edges are drawn as smooth cubic-bezier curves (mindmap-style "swoosh" branches) rather
// than straight lines, colored per relationship category.
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Label, Tooltip } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TimesCircleIcon,
  UnknownIcon,
  BanIcon,
} from '@patternfly/react-icons';
import type { GraphEdge, GraphNode, NodeStatus } from './relationshipTypes';

export interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Called with the node's href when a clickable node is activated. */
  onNavigate: (href: string) => void;
}

// Layout constants
const NODE_WIDTH = 216;
const NODE_HEIGHT = 78;
const COL_GAP = 112;
const ROW_GAP = 28;
const PADDING = 32;

// Column ordering. `secret` shares a column with `downstream` since both sit
// "after" the root in the produces/references direction; workloads consume secrets
// one column further out.
const GROUP_COLUMN: Record<GraphNode['group'], number> = {
  upstream: 0,
  root: 1,
  downstream: 2,
  secret: 2,
  workload: 3,
};

// Reuse the exact blue/mustard pair from the "Status" card's YAML syntax highlighting
// (see YAML_KEY_COLOR / YAML_VALUE_COLOR near the top of ResourceInspect.tsx) so the graph
// feels consistent with the rest of the inspect page instead of introducing new hues.
const STATUS_YAML_BLUE = '#60a5fa';
const STATUS_YAML_MUSTARD = '#eab308';

/**
 * Branch colors per relationship category. Structural relationships (ownership/reference
 * chains: root, upstream, downstream) use blue, matching the YAML "key" color; data-carrying
 * nodes (secrets and the workloads that consume them) use mustard, matching the YAML "value"
 * color.
 */
const GROUP_COLOR: Record<GraphNode['group'], string> = {
  upstream: STATUS_YAML_BLUE,
  root: STATUS_YAML_BLUE,
  downstream: STATUS_YAML_BLUE,
  secret: STATUS_YAML_MUSTARD,
  workload: STATUS_YAML_MUSTARD,
};

/** Marker (arrowhead) id per branch group -- SVG <marker> defs can't reference CSS vars for fill lookups by value, so key them by group name instead. */
const MARKER_ID: Record<GraphNode['group'], string> = {
  upstream: 'rg-arrow-upstream',
  root: 'rg-arrow-root',
  downstream: 'rg-arrow-downstream',
  secret: 'rg-arrow-secret',
  workload: 'rg-arrow-workload',
};

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

function layout(nodes: GraphNode[]): {
  positioned: PositionedNode[];
  width: number;
  height: number;
} {
  const byColumn = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const col = GROUP_COLUMN[node.group];
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col).push(node);
  }

  const positioned: PositionedNode[] = [];
  let maxRows = 1;
  for (const [col, colNodes] of byColumn.entries()) {
    maxRows = Math.max(maxRows, colNodes.length);
    colNodes.forEach((node, row) => {
      positioned.push({
        ...node,
        x: PADDING + col * (NODE_WIDTH + COL_GAP),
        y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }

  const maxCol = Math.max(0, ...Array.from(byColumn.keys()));
  const width = PADDING * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * COL_GAP;
  const height = PADDING * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
  return { positioned, width, height };
}

const STATUS_CONFIG: Record<
  NodeStatus,
  { color: 'green' | 'red' | 'orange' | 'grey'; icon: React.ReactNode; label: string }
> = {
  ready: { color: 'green', icon: <CheckCircleIcon />, label: 'Ready' },
  'not-ready': { color: 'orange', icon: <ExclamationTriangleIcon />, label: 'Not ready' },
  unknown: { color: 'grey', icon: <UnknownIcon />, label: 'Unknown' },
  'not-found': { color: 'red', icon: <TimesCircleIcon />, label: 'Not found' },
  forbidden: { color: 'grey', icon: <BanIcon />, label: 'Insufficient permissions' },
};

interface Point {
  x: number;
  y: number;
}
interface CubicCurve {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
  orientation: 'horizontal' | 'vertical';
}

/**
 * Build a smooth cubic-bezier curve between two nodes, anchored on whichever pair of
 * edges (left/right or top/bottom) face each other. Control points are pulled out along
 * the dominant axis to produce a mindmap-style "swoosh" rather than a straight line.
 */
function getCurve(source: PositionedNode, target: PositionedNode): CubicCurve {
  const sourceCenterX = source.x + NODE_WIDTH / 2;
  const targetCenterX = target.x + NODE_WIDTH / 2;
  const sourceCenterY = source.y + NODE_HEIGHT / 2;
  const targetCenterY = target.y + NODE_HEIGHT / 2;

  if (source.x === target.x) {
    // Same column: connect top/bottom with a vertical S-curve.
    const goingDown = targetCenterY > sourceCenterY;
    const p0: Point = { x: sourceCenterX, y: goingDown ? source.y + NODE_HEIGHT : source.y };
    const p3: Point = { x: targetCenterX, y: goingDown ? target.y : target.y + NODE_HEIGHT };
    const dy = p3.y - p0.y;
    return {
      p0,
      c1: { x: p0.x, y: p0.y + dy * 0.5 },
      c2: { x: p3.x, y: p3.y - dy * 0.5 },
      p3,
      orientation: 'vertical',
    };
  }

  const sourceOnLeft = sourceCenterX < targetCenterX;
  const p0: Point = { x: sourceOnLeft ? source.x + NODE_WIDTH : source.x, y: sourceCenterY };
  const p3: Point = { x: sourceOnLeft ? target.x : target.x + NODE_WIDTH, y: targetCenterY };
  const dx = p3.x - p0.x;
  return {
    p0,
    c1: { x: p0.x + dx * 0.5, y: p0.y },
    c2: { x: p3.x - dx * 0.5, y: p3.y },
    p3,
    orientation: 'horizontal',
  };
}

const curveToPath = ({ p0, c1, c2, p3 }: CubicCurve): string =>
  `M ${String(p0.x)} ${String(p0.y)} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(
    c2.y,
  )}, ${String(p3.x)} ${String(p3.y)}`;

/** Point at parameter `t` along a cubic bezier -- used to place edge labels on the curve. */
function pointOnCubicBezier({ p0, c1, c2, p3 }: CubicCurve, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** The endpoint that represents the "branch" for an edge, i.e. whichever side is not the root. */
function getBranchGroup(source: GraphNode, target: GraphNode): GraphNode['group'] {
  const branchNode = source.group !== 'root' ? source : target;
  return branchNode.group;
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  nodes,
  edges,
  onNavigate,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const { positioned, width, height } = React.useMemo(() => layout(nodes), [nodes]);
  const byId = React.useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  return (
    <div
      data-test="relationship-graph"
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'auto',
        background: 'var(--pf-t--global--background--color--secondary--default)',
        border: '1px solid var(--pf-t--global--border--color--default)',
        borderRadius: '8px',
        padding: '8px',
      }}
    >
      <div style={{ position: 'relative', width, height, minWidth: '100%' }}>
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <defs>
            {Object.entries(MARKER_ID).map(([group, id]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={GROUP_COLOR[group as GraphNode['group']]} />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            // Map#get() can return undefined at runtime even though `strictNullChecks` is off
            // project-wide, which hides that from the type checker (see AGENTS.md lint notes).
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!source || !target) return null;
            const curve = getCurve(source, target);
            const branchGroup = getBranchGroup(source, target);
            const color = GROUP_COLOR[branchGroup];
            return (
              <path
                key={edge.id}
                d={curveToPath(curve)}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                markerEnd={`url(#${MARKER_ID[branchGroup]})`}
              />
            );
          })}
        </svg>

        {edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!source || !target) return null;
          const curve = getCurve(source, target);
          const color = GROUP_COLOR[getBranchGroup(source, target)];
          const { x, y } = pointOnCubicBezier(curve, 0.5);
          return (
            <div
              key={`${edge.id}-label`}
              data-test="relationship-graph-edge-label"
              style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                background: 'var(--pf-t--global--background--color--floating--default)',
                color: 'var(--pf-t--global--text--color--200)',
                border: `1px solid ${color}`,
                borderRadius: '999px',
                padding: '2px 10px',
                boxShadow: 'var(--pf-t--global--box-shadow--sm)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                }}
              />
              {edge.label}
            </div>
          );
        })}

        {positioned.map((node) => {
          const statusConfig = STATUS_CONFIG[node.status];
          const isClickable = Boolean(node.href);
          const accentColor = GROUP_COLOR[node.group];
          const button = (
            <button
              type="button"
              data-test={`relationship-graph-node-${node.kind}-${node.name}`}
              onClick={() => {
                if (node.href) onNavigate(node.href);
              }}
              disabled={!isClickable}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                textAlign: 'left',
                padding: '10px 12px 10px 14px',
                borderRadius: '12px',
                border: node.isRoot
                  ? `2px solid ${accentColor}`
                  : '1px solid var(--pf-t--global--border--color--200)',
                borderLeft: `4px solid ${accentColor}`,
                background: 'var(--pf-t--global--background--color--floating--default)',
                boxShadow: node.isRoot
                  ? 'var(--pf-t--global--box-shadow--md)'
                  : 'var(--pf-t--global--box-shadow--sm)',
                color: 'var(--pf-t--global--text--color--100)',
                cursor: isClickable ? 'pointer' : 'default',
                opacity: node.status === 'not-found' || node.status === 'forbidden' ? 0.7 : 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (isClickable) e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '10px',
                  lineHeight: '14px',
                  color: accentColor,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {node.kind}
              </span>
              <span
                data-test="relationship-graph-node-name"
                style={{
                  flexShrink: 0,
                  fontSize: '14px',
                  lineHeight: '18px',
                  fontWeight: 700,
                  color: 'var(--pf-t--global--text--color--100)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={node.name}
              >
                {node.name}
              </span>
              <Label
                isCompact
                color={statusConfig.color}
                icon={statusConfig.icon}
                style={{ flexShrink: 0, alignSelf: 'flex-start' }}
              >
                {t(statusConfig.label)}
              </Label>
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
  );
};
