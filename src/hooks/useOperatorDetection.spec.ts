import { renderHook, waitFor } from '@testing-library/react';
import { useOperatorDetection } from './useOperatorDetection';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  consoleFetch: jest.fn(),
}));

const mockConsoleFetch = consoleFetch as jest.MockedFunction<typeof consoleFetch>;

describe('useOperatorDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = (status: number, data?: unknown, text?: string) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 404 ? 'Not Found' : 'OK',
      json: async () => data,
      text: async () => text || JSON.stringify(data),
    } as Response);
  };

  const mockCRDResponse = (crdName: string) => ({
    kind: 'CustomResourceDefinition',
    metadata: { name: crdName },
    spec: {},
  });

  describe('Initial State', () => {
    it('starts with all operators in loading state', () => {
      const { result } = renderHook(() => useOperatorDetection());

      expect(result.current.certManager.loading).toBe(true);
      expect(result.current.trustManager.loading).toBe(true);
      expect(result.current.externalSecrets.loading).toBe(true);
      expect(result.current.secretsStoreCSI.loading).toBe(true);
      expect(result.current.loading).toBe(true);
    });

    it('starts with all operators marked as not installed', () => {
      const { result } = renderHook(() => useOperatorDetection());

      expect(result.current.certManager.installed).toBe(false);
      expect(result.current.trustManager.installed).toBe(false);
      expect(result.current.externalSecrets.installed).toBe(false);
      expect(result.current.secretsStoreCSI.installed).toBe(false);
    });

    it('provides a refresh function', () => {
      const { result } = renderHook(() => useOperatorDetection());

      expect(result.current.refresh).toBeInstanceOf(Function);
    });
  });

  describe('cert-manager Detection', () => {
    it('detects cert-manager when certificates CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('certificates.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('certificates.cert-manager.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(true);
      expect(result.current.certManager.error).toBeUndefined();
    });

    it('detects cert-manager when issuers CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('issuers.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('issuers.cert-manager.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(true);
    });

    it('marks cert-manager as not installed when no CRDs exist', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(false);
      expect(result.current.certManager.error).toBeUndefined();
    });

    it('handles cert-manager detection errors gracefully', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('cert-manager')) {
          return createMockResponse(500, undefined, 'Internal Server Error');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(false);
      expect(result.current.certManager.error).toBeDefined();
      expect(result.current.certManager.error).toContain('CRD lookup failed');
    });

    it('treats "not found" error text as missing CRD', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('cert-manager')) {
          return createMockResponse(403, undefined, 'Resource not found');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(false);
      expect(result.current.certManager.error).toBeUndefined();
    });
  });

  describe('Trust Manager Detection', () => {
    it('detects trust-manager when bundles CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('bundles.trust.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('bundles.trust.cert-manager.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.trustManager.loading).toBe(false);
      });

      expect(result.current.trustManager.installed).toBe(true);
      expect(result.current.trustManager.error).toBeUndefined();
    });

    it('marks trust-manager as not installed when bundles CRD does not exist', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.trustManager.loading).toBe(false);
      });

      expect(result.current.trustManager.installed).toBe(false);
      expect(result.current.trustManager.error).toBeUndefined();
    });

    it('handles trust-manager detection errors gracefully', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('trust.cert-manager.io')) {
          return createMockResponse(500, undefined, 'Internal Server Error');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.trustManager.loading).toBe(false);
      });

      expect(result.current.trustManager.installed).toBe(false);
      expect(result.current.trustManager.error).toBeDefined();
      expect(result.current.trustManager.error).toContain('CRD lookup failed');
    });

    it('detects trust-manager independently from cert-manager', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('bundles.trust.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('bundles.trust.cert-manager.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.trustManager.installed).toBe(true);
      expect(result.current.certManager.installed).toBe(false);
    });
  });

  describe('External Secrets Operator Detection', () => {
    it('detects External Secrets when externalsecrets CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('externalsecrets.external-secrets.io')) {
          return createMockResponse(200, mockCRDResponse('externalsecrets.external-secrets.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.externalSecrets.loading).toBe(false);
      });

      expect(result.current.externalSecrets.installed).toBe(true);
      expect(result.current.externalSecrets.error).toBeUndefined();
    });

    it('detects External Secrets when secretstores CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('secretstores.external-secrets.io')) {
          return createMockResponse(200, mockCRDResponse('secretstores.external-secrets.io'));
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.externalSecrets.loading).toBe(false);
      });

      expect(result.current.externalSecrets.installed).toBe(true);
    });

    it('marks External Secrets as not installed when no CRDs exist', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.externalSecrets.loading).toBe(false);
      });

      expect(result.current.externalSecrets.installed).toBe(false);
    });

    it('handles External Secrets detection errors', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('external-secrets')) {
          return createMockResponse(500, undefined, 'Server Error');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.externalSecrets.loading).toBe(false);
      });

      expect(result.current.externalSecrets.installed).toBe(false);
      expect(result.current.externalSecrets.error).toBeDefined();
    });
  });

  describe('Secrets Store CSI Driver Detection', () => {
    it('detects Secrets Store CSI when secretproviderclasses CRD exists', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('secretproviderclasses.secrets-store.csi.x-k8s.io')) {
          return createMockResponse(
            200,
            mockCRDResponse('secretproviderclasses.secrets-store.csi.x-k8s.io'),
          );
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.secretsStoreCSI.loading).toBe(false);
      });

      expect(result.current.secretsStoreCSI.installed).toBe(true);
      expect(result.current.secretsStoreCSI.error).toBeUndefined();
    });

    it('marks Secrets Store CSI as not installed when CRD does not exist', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.secretsStoreCSI.loading).toBe(false);
      });

      expect(result.current.secretsStoreCSI.installed).toBe(false);
    });

    it('handles Secrets Store CSI detection errors', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('secrets-store.csi')) {
          return createMockResponse(500, undefined, 'API Error');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.secretsStoreCSI.loading).toBe(false);
      });

      expect(result.current.secretsStoreCSI.installed).toBe(false);
      expect(result.current.secretsStoreCSI.error).toBeDefined();
    });
  });

  describe('All Operators Detected', () => {
    it('detects all operators when all CRDs exist', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        const urlString = url.toString();
        if (urlString.includes('certificates.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('certificates.cert-manager.io'));
        }
        if (urlString.includes('bundles.trust.cert-manager.io')) {
          return createMockResponse(200, mockCRDResponse('bundles.trust.cert-manager.io'));
        }
        if (urlString.includes('externalsecrets.external-secrets.io')) {
          return createMockResponse(200, mockCRDResponse('externalsecrets.external-secrets.io'));
        }
        if (urlString.includes('secretproviderclasses.secrets-store.csi.x-k8s.io')) {
          return createMockResponse(
            200,
            mockCRDResponse('secretproviderclasses.secrets-store.csi.x-k8s.io'),
          );
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(true);
      expect(result.current.trustManager.installed).toBe(true);
      expect(result.current.externalSecrets.installed).toBe(true);
      expect(result.current.secretsStoreCSI.installed).toBe(true);
    });

    it('sets loading to false when all checks complete', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.certManager.loading).toBe(false);
      expect(result.current.trustManager.loading).toBe(false);
      expect(result.current.externalSecrets.loading).toBe(false);
      expect(result.current.secretsStoreCSI.loading).toBe(false);
    });
  });

  describe('Refresh Functionality', () => {
    it('re-checks all operators when refresh is called', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCallCount = mockConsoleFetch.mock.calls.length;

      // Call refresh
      result.current.refresh();

      await waitFor(() => {
        expect(mockConsoleFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('makes new API calls when refresh is called', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCountBeforeRefresh = mockConsoleFetch.mock.calls.length;

      // Trigger refresh
      result.current.refresh();

      await waitFor(() => {
        expect(mockConsoleFetch.mock.calls.length).toBeGreaterThan(callCountBeforeRefresh);
      });
    });

    it('clears previous errors when refresh is called', async () => {
      mockConsoleFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.certManager.error).toBeDefined();
      });

      // Now mock success
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      result.current.refresh();

      await waitFor(() => {
        expect(result.current.certManager.loading).toBe(false);
      });

      expect(result.current.certManager.error).toBeUndefined();
    });
  });

  describe('API Call Structure', () => {
    it('makes correct API calls for cert-manager CRDs', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalled();
      });

      const calls = mockConsoleFetch.mock.calls.map((call) => call[0]);
      expect(calls).toContainEqual(
        expect.stringContaining('certificates.cert-manager.io'),
      );
      expect(calls).toContainEqual(
        expect.stringContaining('issuers.cert-manager.io'),
      );
    });

    it('makes correct API call for trust-manager CRD', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalled();
      });

      const calls = mockConsoleFetch.mock.calls.map((call) => call[0]);
      expect(calls).toContainEqual(
        expect.stringContaining('bundles.trust.cert-manager.io'),
      );
    });

    it('makes correct API calls for External Secrets CRDs', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalled();
      });

      const calls = mockConsoleFetch.mock.calls.map((call) => call[0]);
      expect(calls).toContainEqual(
        expect.stringContaining('externalsecrets.external-secrets.io'),
      );
      expect(calls).toContainEqual(
        expect.stringContaining('secretstores.external-secrets.io'),
      );
    });

    it('makes correct API calls for Secrets Store CSI CRDs', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalled();
      });

      const calls = mockConsoleFetch.mock.calls.map((call) => call[0]);
      expect(calls).toContainEqual(
        expect.stringContaining('secretproviderclasses.secrets-store.csi.x-k8s.io'),
      );
    });

    it('uses correct API endpoint format', async () => {
      mockConsoleFetch.mockResolvedValue(createMockResponse(404));

      renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalled();
      });

      const firstCall = mockConsoleFetch.mock.calls[0][0];
      expect(firstCall).toContain('/api/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions/');
    });
  });

  describe('Edge Cases', () => {
    it('handles mixed success and failure states', async () => {
      mockConsoleFetch.mockImplementation((url) => {
        if (url.includes('cert-manager')) {
          return createMockResponse(200, mockCRDResponse('certificates.cert-manager.io'));
        }
        if (url.includes('external-secrets')) {
          return createMockResponse(500, undefined, 'Server Error');
        }
        return createMockResponse(404);
      });

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.certManager.installed).toBe(true);
      expect(result.current.certManager.error).toBeUndefined();
      expect(result.current.externalSecrets.installed).toBe(false);
      expect(result.current.externalSecrets.error).toBeDefined();
    });

    it('handles network timeouts gracefully', async () => {
      mockConsoleFetch.mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.certManager.error).toContain('Network timeout');
      expect(result.current.externalSecrets.error).toContain('Network timeout');
      expect(result.current.secretsStoreCSI.error).toContain('Network timeout');
    });

    it('handles malformed API responses', async () => {
      mockConsoleFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'data' }),
      } as Response);

      const { result } = renderHook(() => useOperatorDetection());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should treat malformed response as not installed
      expect(result.current.certManager.installed).toBe(false);
      expect(result.current.externalSecrets.installed).toBe(false);
      expect(result.current.secretsStoreCSI.installed).toBe(false);
    });
  });
});
