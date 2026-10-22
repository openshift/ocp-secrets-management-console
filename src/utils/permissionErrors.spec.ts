import { HttpError } from '@openshift-console/dynamic-plugin-sdk';
import {
  formatDeleteErrorMessage,
  formatResourceTableErrorMessage,
  getFriendlyPermissionDeniedMessage,
  getPermissionDeniedMessage,
  isPermissionDeniedError,
  listErrorNamespace,
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

    it('returns true for HttpError 401', () => {
      expect(isPermissionDeniedError(new HttpError('Unauthorized', 401))).toBe(true);
    });

    it('returns false for falsy input', () => {
      expect(isPermissionDeniedError(null)).toBe(false);
      expect(isPermissionDeniedError(undefined)).toBe(false);
      expect(isPermissionDeniedError('')).toBe(false);
    });

    it('returns true for plain string messages containing Unauthorized', () => {
      expect(isPermissionDeniedError('Unauthorized to perform this action')).toBe(true);
    });

    it('returns true for plain objects with a 403 code property', () => {
      expect(isPermissionDeniedError({ code: 403, message: 'nope' })).toBe(true);
    });

    it('returns false for plain objects with an unrelated code property', () => {
      expect(isPermissionDeniedError({ code: 500, message: 'boom' })).toBe(false);
    });

    it('returns true when the message contains a bare 403 status code', () => {
      expect(isPermissionDeniedError(new Error('request failed with status 403'))).toBe(true);
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

    it('uses cluster-scoped delete copy when namespace is "all"', () => {
      const message = getPermissionDeniedMessage(t, {
        resourceCategory: 'Certificates',
        namespace: 'all',
        verb: 'delete',
      });
      expect(message).toContain('delete');
      expect(message).toContain('cluster');
      expect(message).not.toContain('project');
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

  describe('listErrorNamespace', () => {
    it('returns undefined for the "all" project selection', () => {
      expect(listErrorNamespace('all')).toBeUndefined();
    });

    it('returns the selected project when a specific project is chosen', () => {
      expect(listErrorNamespace('my-namespace')).toBe('my-namespace');
    });
  });

  describe('formatResourceTableErrorMessage', () => {
    it('returns undefined when there is no error', () => {
      expect(
        formatResourceTableErrorMessage(undefined, t, {
          resourceCategory: 'Issuers',
          namespace: 'app',
        }),
      ).toBeUndefined();
    });

    it('returns friendly copy for forbidden errors', () => {
      const message = formatResourceTableErrorMessage(new Error('Forbidden'), t, {
        resourceCategory: 'Issuers',
        namespace: 'app',
      });
      expect(message).toContain('Issuers');
      expect(message).not.toMatch(/Forbidden/);
    });

    it('falls back to the raw error message for non-forbidden errors', () => {
      const message = formatResourceTableErrorMessage(new Error('network timeout'), t, {
        resourceCategory: 'Issuers',
        namespace: 'app',
      });
      expect(message).toBe('network timeout');
    });
  });

  describe('formatDeleteErrorMessage', () => {
    it('returns friendly delete copy for forbidden errors', () => {
      const message = formatDeleteErrorMessage(new Error('403 Forbidden'), t, {
        resourceCategory: 'Certificates',
        namespace: 'app',
      });
      expect(message).toContain('delete');
      expect(message).toContain('Certificates');
    });

    it('falls back to the raw Error message for non-forbidden errors', () => {
      const message = formatDeleteErrorMessage(new Error('disk full'), t, {
        resourceCategory: 'Certificates',
        namespace: 'app',
      });
      expect(message).toBe('disk full');
    });

    it('stringifies non-Error values that are not forbidden', () => {
      const message = formatDeleteErrorMessage('weird failure', t, {
        resourceCategory: 'Certificates',
        namespace: 'app',
      });
      expect(message).toBe('weird failure');
    });
  });
});
