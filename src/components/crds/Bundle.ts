// Bundle custom resource definition from trust-manager (cert-manager operator)
export const BundleModel = {
  group: 'trust.cert-manager.io',
  version: 'v1alpha1',
  kind: 'Bundle',
};

export interface BundleSource {
  useDefaultCAs?: boolean;
  configMap?: {
    name?: string;
    key?: string;
    includeAllKeys?: boolean;
    selector?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values?: string[];
      }>;
    };
  };
  secret?: {
    name?: string;
    key?: string;
    includeAllKeys?: boolean;
    selector?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values?: string[];
      }>;
    };
  };
  inLine?: string;
}

export interface BundleTarget {
  configMap?: {
    key: string;
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
  };
  secret?: {
    key: string;
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
  };
  additionalFormats?: {
    jks?: {
      key: string;
      password?: string;
    };
    pkcs12?: {
      key: string;
      password?: string;
    };
  };
  namespaceSelector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
}

export interface Bundle {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp: string;
    annotations?: Record<string, string>;
  };
  spec: {
    sources: BundleSource[];
    target: BundleTarget;
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
      observedGeneration?: number;
    }>;
    defaultCAVersion?: string;
  };
}
