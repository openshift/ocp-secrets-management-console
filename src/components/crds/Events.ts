// Core v1 Event for listing resource events
export const EventModel = { group: '', version: 'v1', kind: 'Event' };
export interface K8sEvent {
  metadata: { name: string; namespace?: string; creationTimestamp?: string };
  involvedObject?: { kind: string; namespace?: string; name: string };
  reason?: string;
  message?: string;
  type?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

// Map URL resourceType to Kubernetes Kind for event involvedObject
export const getInvolvedObjectKind = (rt: string): string => {
  const map: Record<string, string> = {
    certificates: 'Certificate',
    issuers: 'Issuer',
    clusterissuers: 'ClusterIssuer',
    externalsecrets: 'ExternalSecret',
    clusterexternalsecrets: 'ClusterExternalSecret',
    secretstores: 'SecretStore',
    clustersecretstores: 'ClusterSecretStore',
    pushsecrets: 'PushSecret',
    clusterpushsecrets: 'ClusterPushSecret',
    secretproviderclasses: 'SecretProviderClass',
    bundles: 'Bundle',
  };
  return map[rt] || rt;
};
