import type { Page, Route } from '@playwright/test';

const CRD_BASE = '/api/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions';

/**
 * Full shape of every custom resource kind the plugin's components watch via
 * `useK8sWatchResource`, mirroring the `*Model` constants in `src/components/crds`.
 * The console resolves a `useK8sWatchResource` call to a concrete API path by
 * looking up a `K8sModel` for the given group/version/kind in its own
 * `allK8sModels` registry, which it builds from the CustomResourceDefinitions
 * that actually exist on the cluster. Faking a single CRD's existence (as the
 * per-name GET below does) is enough for the plugin's own operator-detection
 * logic, but not enough for the console to build a model for that kind -- for
 * that, the console needs to see it in the CRD list, so `mockCrdList` returns
 * full CRD objects (see `mockOperatorDetection`).
 */
interface CrdDef {
  kind: string;
  group: string;
  version: string;
  plural: string;
  scope: 'Namespaced' | 'Cluster';
}

const GENERATOR_GROUP = 'generators.external-secrets.io';
const GENERATOR_VERSION = 'v1alpha1';

const GENERATOR_CRD_DEFS: CrdDef[] = [
  ['ACRAccessToken', 'acraccesstokens', 'Namespaced'],
  ['CloudsmithAccessToken', 'cloudsmithaccesstokens', 'Namespaced'],
  ['ECRAuthorizationToken', 'ecrauthorizationtokens', 'Namespaced'],
  ['Fake', 'fakes', 'Namespaced'],
  ['GCRAccessToken', 'gcraccesstokens', 'Namespaced'],
  ['GithubAccessToken', 'githubaccesstokens', 'Namespaced'],
  ['Grafana', 'grafanas', 'Namespaced'],
  ['MFA', 'mfas', 'Namespaced'],
  ['Password', 'passwords', 'Namespaced'],
  ['QuayAccessToken', 'quayaccesstokens', 'Namespaced'],
  ['SSHKey', 'sshkeys', 'Namespaced'],
  ['STSSessionToken', 'stssessiontokens', 'Namespaced'],
  ['UUID', 'uuids', 'Namespaced'],
  ['VaultDynamicSecret', 'vaultdynamicsecrets', 'Namespaced'],
  ['Webhook', 'webhooks', 'Namespaced'],
  ['ClusterGenerator', 'clustergenerators', 'Cluster'],
].map(([kind, plural, scope]) => ({
  kind,
  group: GENERATOR_GROUP,
  version: GENERATOR_VERSION,
  plural,
  scope: scope as CrdDef['scope'],
}));

const CERT_MANAGER_CRD_DEFS: CrdDef[] = [
  {
    kind: 'Certificate',
    group: 'cert-manager.io',
    version: 'v1',
    plural: 'certificates',
    scope: 'Namespaced',
  },
  {
    kind: 'Issuer',
    group: 'cert-manager.io',
    version: 'v1',
    plural: 'issuers',
    scope: 'Namespaced',
  },
  {
    kind: 'ClusterIssuer',
    group: 'cert-manager.io',
    version: 'v1',
    plural: 'clusterissuers',
    scope: 'Cluster',
  },
];
const TRUST_MANAGER_CRD_DEFS: CrdDef[] = [
  {
    kind: 'Bundle',
    group: 'trust.cert-manager.io',
    version: 'v1alpha1',
    plural: 'bundles',
    scope: 'Cluster',
  },
];
const EXTERNAL_SECRETS_CRD_DEFS: CrdDef[] = [
  {
    kind: 'ExternalSecret',
    group: 'external-secrets.io',
    version: 'v1',
    plural: 'externalsecrets',
    scope: 'Namespaced',
  },
  {
    kind: 'ClusterExternalSecret',
    group: 'external-secrets.io',
    version: 'v1',
    plural: 'clusterexternalsecrets',
    scope: 'Cluster',
  },
  {
    kind: 'SecretStore',
    group: 'external-secrets.io',
    version: 'v1',
    plural: 'secretstores',
    scope: 'Namespaced',
  },
  {
    kind: 'ClusterSecretStore',
    group: 'external-secrets.io',
    version: 'v1',
    plural: 'clustersecretstores',
    scope: 'Cluster',
  },
  {
    kind: 'PushSecret',
    group: 'external-secrets.io',
    version: 'v1alpha1',
    plural: 'pushsecrets',
    scope: 'Namespaced',
  },
  {
    kind: 'ClusterPushSecret',
    group: 'external-secrets.io',
    version: 'v1alpha1',
    plural: 'clusterpushsecrets',
    scope: 'Cluster',
  },
  ...GENERATOR_CRD_DEFS,
];
const SECRETS_STORE_CSI_CRD_DEFS: CrdDef[] = [
  {
    kind: 'SecretProviderClass',
    group: 'secrets-store.csi.x-k8s.io',
    version: 'v1',
    plural: 'secretproviderclasses',
    scope: 'Namespaced',
  },
  {
    kind: 'SecretProviderClassPodStatus',
    group: 'secrets-store.csi.x-k8s.io',
    version: 'v1',
    plural: 'secretproviderclasspodstatuses',
    scope: 'Namespaced',
  },
];

const crdName = (def: CrdDef): string => `${def.plural}.${def.group}`;

function crdResponse(crdName: string) {
  return {
    kind: 'CustomResourceDefinition',
    apiVersion: 'apiextensions.k8s.io/v1',
    metadata: { name: crdName },
  };
}

/** Full CustomResourceDefinition object, shaped so the console can build a K8sModel from it. */
function fullCrdObject(def: CrdDef) {
  return {
    kind: 'CustomResourceDefinition',
    apiVersion: 'apiextensions.k8s.io/v1',
    metadata: { name: crdName(def) },
    spec: {
      group: def.group,
      names: {
        kind: def.kind,
        listKind: `${def.kind}List`,
        plural: def.plural,
        singular: def.kind.toLowerCase(),
      },
      scope: def.scope,
      versions: [{ name: def.version, served: true, storage: true }],
    },
  };
}

/**
 * Intercept the console's own CRD list (which it uses to build its
 * `allK8sModels` registry) so it can resolve a `K8sModel` for the given
 * custom resource kinds, even though they aren't actually installed on the
 * cluster.
 */
async function mockCrdList(page: Page, defs: CrdDef[]): Promise<void> {
  const body = JSON.stringify({
    kind: 'CustomResourceDefinitionList',
    apiVersion: 'apiextensions.k8s.io/v1',
    metadata: { resourceVersion: '1' },
    items: defs.map(fullCrdObject),
  });
  const fulfill = (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body });
  await page.route(`**${CRD_BASE}`, fulfill);
  await page.route(`**${CRD_BASE}?*`, fulfill);
}

export interface MockOperatorOptions {
  certManager?: boolean;
  trustManager?: boolean;
  externalSecrets?: boolean;
  secretsStoreCSI?: boolean;
}

/**
 * `useK8sWatchResource` watches resources over a WebSocket when one is
 * available, and only falls back to REST polling (the mechanism
 * `mockK8sResourceList` intercepts) when the WS can't be established.
 * Against a real console (e.g. a claimed CI cluster) that WS works fine,
 * so the SDK never falls back and our REST route mocks are never hit,
 * leaving resource tables stuck waiting on a real (unmocked) watch.
 * Closing the WS immediately forces the SDK onto its REST fallback path
 * so the existing REST-based mocks apply consistently in every
 * environment (local dev console or a real cluster console).
 */
async function blockK8sWatchSockets(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/kubernetes/**', (ws) => {
    ws.close();
  });
}

/**
 * Intercept operator-detection CRD lookups so the UI thinks specific
 * operators are (or are not) installed.
 */
export async function mockOperatorDetection(
  page: Page,
  opts: MockOperatorOptions = {},
): Promise<void> {
  await blockK8sWatchSockets(page);

  const {
    certManager = false,
    trustManager = false,
    externalSecrets = false,
    secretsStoreCSI = false,
  } = opts;

  const routes: [CrdDef[], boolean][] = [
    [CERT_MANAGER_CRD_DEFS, certManager],
    [TRUST_MANAGER_CRD_DEFS, trustManager],
    [EXTERNAL_SECRETS_CRD_DEFS, externalSecrets],
    [SECRETS_STORE_CSI_CRD_DEFS, secretsStoreCSI],
  ];

  const installedDefs: CrdDef[] = [];

  for (const [defs, installed] of routes) {
    if (installed) installedDefs.push(...defs);
    for (const def of defs) {
      const name = crdName(def);
      await page.route(`**${CRD_BASE}/${name}`, (route: Route) =>
        installed
          ? route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(crdResponse(name)),
            })
          : route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ kind: 'Status', code: 404, message: 'not found' }),
            }),
      );
    }
  }

  // Let the console resolve real K8sModels for the "installed" kinds above,
  // so components using `useK8sWatchResource` don't hit "Model does not
  // exist" once operator detection says a given operator is present.
  await mockCrdList(page, installedDefs);
}

/**
 * Intercept the WebSocket-based K8s watch that `useK8sWatchResource` uses
 * for resource lists.  For pre-merge mocking we intercept the REST list
 * endpoint and return canned data; the console SDK falls back to polling
 * when the WS isn't available.
 */
export async function mockK8sResourceList(
  page: Page,
  apiGroup: string,
  version: string,
  resource: string,
  items: unknown[],
): Promise<void> {
  const pattern = `**/api/kubernetes/apis/${apiGroup}/${version}/${resource}?*`;
  await page.route(pattern, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: `${apiGroup}/${version}`,
        kind: `${resource.charAt(0).toUpperCase() + resource.slice(1)}List`,
        metadata: { resourceVersion: '1' },
        items,
      }),
    }),
  );

  const nsPattern = `**/api/kubernetes/apis/${apiGroup}/${version}/namespaces/*//${resource}?*`;
  await page.route(nsPattern, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: `${apiGroup}/${version}`,
        kind: `${resource.charAt(0).toUpperCase() + resource.slice(1)}List`,
        metadata: { resourceVersion: '1' },
        items,
      }),
    }),
  );
}

export async function mockNamespaces(page: Page, namespaces: string[]): Promise<void> {
  const items = namespaces.map((ns) => ({
    metadata: { name: ns },
    status: { phase: 'Active' },
  }));
  await page.route('**/api/kubernetes/api/v1/namespaces?*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: 'v1',
        kind: 'NamespaceList',
        metadata: { resourceVersion: '1' },
        items,
      }),
    }),
  );
}

export async function mockDeleteResource(
  page: Page,
  apiGroup: string,
  version: string,
  resource: string,
  opts: { succeed?: boolean } = {},
): Promise<void> {
  const { succeed = true } = opts;
  const pattern = `**/api/kubernetes/apis/${apiGroup}/${version}/namespaces/*/${resource}/*`;
  await page.route(pattern, (route: Route) => {
    if (route.request().method() !== 'DELETE') {
      return route.fallback();
    }
    if (succeed) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'Status', status: 'Success' }),
      });
    }
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'Status', status: 'Failure', message: 'forbidden' }),
    });
  });
}
