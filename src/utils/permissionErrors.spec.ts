import { HttpError } from '@openshift-console/dynamic-plugin-sdk';
import {
  getFriendlyPermissionDeniedMessage,
  getPermissionDeniedMessage,
  isPermissionDeniedError,
} from './permissionErrors';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => {
  class MockHttpError extends Error {
    code: number;
    constructor(message: string, code: number) {
      super(message);
      this.code = code;
    }
  }
  return { HttpError: MockHttpError };
});

const t = (key: string, options?: Record<string, string>) => {
  if (!options) {
    return key;
  }
  return `${key}|${JSON.stringify(options)}`;
};

describe('permissionErrors', () => {
  describe('isPermissionDeniedError', () => {
    it('returns true for HttpError 403', () => {
      expect(isPermissionDeniedError(new HttpError('Forbidden', 403))).toBe(true);
    });

    it('returns true for Error messages containing Forbidden', () => {
      expect(isPermissionDeniedError(new Error('Forbidden: user "x" cannot list'))).toBe(true);
    });

    it('returns true for delete failures with status 403', () => {
      expect(
        isPermissionDeniedError(new Error('Delete failed: 403 Forbidden - bodies are secret')),
      ).toBe(true);
    });

    it('returns false for generic network errors', () => {
      expect(isPermissionDeniedError(new Error('Network request failed'))).toBe(false);
    });

    it('returns false for 500-shaped errors', () => {
      expect(isPermissionDeniedError(new Error('Internal Server Error: 500'))).toBe(false);
    });
  });

  describe('getPermissionDeniedMessage', () => {
    it('uses project-scoped list copy for namespaced resources', () => {
      const message = getPermissionDeniedMessage(t, {
        resourceCategory: 'Issuers',
        namespace: 'app',
        verb: 'list',
      });
      expect(message).toContain('project');
      expect(message).toContain('app');
      expect(message).toContain('Issuers');
      expect(message).not.toMatch(/Forbidden:/);
    });

    it('uses cluster-scoped list copy when namespace is absent', () => {
      const message = getPermissionDeniedMessage(t, {
        resourceCategory: 'Trust Bundles',
        verb: 'list',
      });
      expect(message).toContain('cluster');
      expect(message).not.toContain('project');
    });

    it('uses delete copy for namespaced delete denial', () => {
      const message = getPermissionDeniedMessage(t, {
        resourceCategory: 'Issuers',
        namespace: 'app',
        verb: 'delete',
      });
      expect(message).toContain('delete');
      expect(message).toContain('app');
    });
  });

  describe('getFriendlyPermissionDeniedMessage', () => {
    it('returns undefined for non-forbidden errors', () => {
      expect(
        getFriendlyPermissionDeniedMessage(new Error('timeout'), t, {
          resourceCategory: 'Issuers',
          namespace: 'app',
        }),
      ).toBeUndefined();
    });

    it('does not echo raw API body for forbidden errors', () => {
      const raw = 'Forbidden: user "system:anonymous" cannot list resource "issuers"';
      const friendly = getFriendlyPermissionDeniedMessage(new Error(raw), t, {
        resourceCategory: 'Issuers',
        namespace: 'app',
      });
      expect(friendly).toBeDefined();
      expect(friendly).not.toContain(raw);
    });
  });
});
