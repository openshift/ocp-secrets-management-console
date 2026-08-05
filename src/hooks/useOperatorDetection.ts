/**
 * Hook to detect which operators are installed by checking for their CRDs
 */

import * as React from 'react';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

export interface OperatorStatus {
  installed: boolean;
  loading: boolean;
  error?: string;
}

export interface OperatorDetectionResult {
  certManager: OperatorStatus;
  trustManager: OperatorStatus;
  externalSecrets: OperatorStatus;
  secretsStoreCSI: OperatorStatus;
  loading: boolean;
  refresh: () => void;
}

// CRDs that indicate each operator is installed
const CERT_MANAGER_CRDS = ['certificates.cert-manager.io', 'issuers.cert-manager.io'];

const EXTERNAL_SECRETS_CRDS = [
  'externalsecrets.external-secrets.io',
  'secretstores.external-secrets.io',
];

const TRUST_MANAGER_CRDS = ['bundles.trust.cert-manager.io'];

const SECRETS_STORE_CSI_CRDS = ['secretproviderclasses.secrets-store.csi.x-k8s.io'];

/**
 * Returns true if the error indicates the CRD/resource was not found.
 * When the operator is not installed, the API may return 404 or an error body
 * with "not found"; treat that as "not installed" rather than a verification failure.
 */
function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found/i.test(msg);
}

async function checkCRDExists(crdName: string): Promise<boolean> {
  // Console proxies Kubernetes API under /api/kubernetes (same as other plugin API calls)
  const response = await consoleFetch(
    `/api/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${crdName}`,
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    const errorText = await response.text();
    // Treat "not found" responses (e.g. some proxies return 403/500 with not found body) as missing CRD
    if (/not found/i.test(errorText)) return false;
    throw new Error(`CRD lookup failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  return data?.kind === 'CustomResourceDefinition' && data?.metadata?.name === crdName;
}

async function checkOperatorInstalled(crds: string[]): Promise<boolean> {
  const results = await Promise.all(crds.map(checkCRDExists));
  return results.some(Boolean);
}

export const useOperatorDetection = (): OperatorDetectionResult => {
  const [certManager, setCertManager] = React.useState<OperatorStatus>({
    installed: false,
    loading: true,
  });

  const [trustManager, setTrustManager] = React.useState<OperatorStatus>({
    installed: false,
    loading: true,
  });

  const [externalSecrets, setExternalSecrets] = React.useState<OperatorStatus>({
    installed: false,
    loading: true,
  });

  const [secretsStoreCSI, setSecretsStoreCSI] = React.useState<OperatorStatus>({
    installed: false,
    loading: true,
  });

  const checkOperators = React.useCallback(async () => {
    // Reset to loading state
    setCertManager((prev) => ({ ...prev, loading: true }));
    setTrustManager((prev) => ({ ...prev, loading: true }));
    setExternalSecrets((prev) => ({ ...prev, loading: true }));
    setSecretsStoreCSI((prev) => ({ ...prev, loading: true }));

    // Check cert-manager
    try {
      const installed = await checkOperatorInstalled(CERT_MANAGER_CRDS);
      setCertManager({ installed, loading: false });
    } catch (err) {
      setCertManager({
        installed: false,
        loading: false,
        error: isNotFoundError(err)
          ? undefined
          : err instanceof Error
          ? err.message
          : 'Unknown error',
      });
    }

    // Check trust-manager (part of cert-manager operator)
    try {
      const installed = await checkOperatorInstalled(TRUST_MANAGER_CRDS);
      setTrustManager({ installed, loading: false });
    } catch (err) {
      setTrustManager({
        installed: false,
        loading: false,
        error: isNotFoundError(err)
          ? undefined
          : err instanceof Error
          ? err.message
          : 'Unknown error',
      });
    }

    // Check external-secrets
    try {
      const installed = await checkOperatorInstalled(EXTERNAL_SECRETS_CRDS);
      setExternalSecrets({ installed, loading: false });
    } catch (err) {
      setExternalSecrets({
        installed: false,
        loading: false,
        error: isNotFoundError(err)
          ? undefined
          : err instanceof Error
          ? err.message
          : 'Unknown error',
      });
    }

    // Check secrets-store-csi
    try {
      const installed = await checkOperatorInstalled(SECRETS_STORE_CSI_CRDS);
      setSecretsStoreCSI({ installed, loading: false });
    } catch (err) {
      setSecretsStoreCSI({
        installed: false,
        loading: false,
        error: isNotFoundError(err)
          ? undefined
          : err instanceof Error
          ? err.message
          : 'Unknown error',
      });
    }
  }, []);

  React.useEffect(() => {
    checkOperators();
  }, [checkOperators]);

  return {
    certManager,
    trustManager,
    externalSecrets,
    secretsStoreCSI,
    loading:
      certManager.loading ||
      trustManager.loading ||
      externalSecrets.loading ||
      secretsStoreCSI.loading,
    refresh: checkOperators,
  };
};

/**
 * Get operator info by key
 * quickStartUrl: in-console path to Quick Starts (guided tutorials)
 * operatorHubUrl: in-console path to Catalog for installing operators
 */
export const OPERATOR_INFO = {
  'cert-manager': {
    name: 'cert-manager',
    displayName: 'cert-manager Operator for Red Hat OpenShift',
    description:
      'Automates the management and issuance of TLS certificates from various issuing sources including ACME, Vault, Venafi, and self-signed certificates.',
    quickStartUrl: '/quickstart?quickstart=install-cert-manager',
    operatorHubUrl: '/catalog/ns/default',
    installInstructions: [
      'Open the cert-manager Quick Start for guided setup',
      'Or go to Catalog and search for "cert-manager Operator for Red Hat OpenShift"',
      'Click Install and select the appropriate namespace',
      'Wait for the operator to be installed and ready',
    ],
  },
  'trust-manager': {
    name: 'trust-manager',
    displayName: 'trust-manager (cert-manager Operator)',
    description:
      'Distributes trust bundles (CA certificates) across namespaces. Part of the cert-manager operator, trust-manager ensures consistent TLS trust configuration across your cluster.',
    quickStartUrl: '/quickstart?quickstart=install-cert-manager',
    operatorHubUrl: '/catalog/ns/default',
    installInstructions: [
      'Trust-manager is included with the cert-manager Operator for Red Hat OpenShift',
      'Install the cert-manager operator from Catalog',
      'Enable trust-manager via the TrustManager custom resource',
      'Create Bundle resources to distribute CA trust across namespaces',
    ],
  },
  'external-secrets': {
    name: 'external-secrets',
    displayName: 'External Secrets Operator',
    description:
      'Synchronizes secrets from external secret management systems (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, Google Secret Manager, etc.) into Kubernetes secrets.',
    quickStartUrl: '/quickstart?quickstart=install-external-secrets-operator',
    operatorHubUrl: '/catalog/ns/default',
    installInstructions: [
      'Open the External Secrets Operator Quick Start for guided setup',
      'Or go to Catalog and search for "External Secrets Operator"',
      'Click Install and select the appropriate namespace',
      'After installation, create SecretStore or ClusterSecretStore resources to connect to your external secret provider',
    ],
  },
  'secrets-store-csi': {
    name: 'secrets-store-csi',
    displayName: 'Secrets Store CSI Driver',
    description:
      'Integrates secrets stores with Kubernetes via a Container Storage Interface (CSI) volume, allowing you to mount secrets directly into pods from external providers.',
    quickStartUrl: '/quickstart?quickstart=install-secrets-store-csi',
    operatorHubUrl: '/catalog/ns/default',
    installInstructions: [
      'Open the Secrets Store CSI Driver Quick Start for guided setup',
      'Or go to Catalog and search for "Secrets Store CSI Driver Operator"',
      'Click Install and select the appropriate namespace',
      'After installation, create SecretProviderClass resources to define how secrets are mounted',
    ],
  },
} as const;

export type OperatorKey = keyof typeof OPERATOR_INFO;
export type OperatorDetectionKey =
  | 'cert-manager'
  | 'trust-manager'
  | 'external-secrets'
  | 'secrets-store-csi';
