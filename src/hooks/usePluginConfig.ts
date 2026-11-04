import * as React from 'react';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

interface PluginFeatureToggle {
  enabled: boolean;
  checkRBAC: boolean;
}

interface PluginFeaturesConfig {
  delete: PluginFeatureToggle;
}

export interface PluginConfig {
  features: PluginFeaturesConfig;
}

const DEFAULT_CONFIG: PluginConfig = {
  features: {
    delete: { enabled: false, checkRBAC: true },
  },
};

interface PluginConfigContextValue {
  config: PluginConfig;
  loaded: boolean;
  error: string | null;
}

const PluginConfigContext = React.createContext<PluginConfigContextValue>({
  config: DEFAULT_CONFIG,
  loaded: false,
  error: null,
});

/**
 * Provider that fetches plugin-config.json from the plugin backend on mount.
 * The config is served by nginx from a ConfigMap managed by the operator,
 * reflecting the SecretsManagementConfig CR's spec.features settings.
 */
export const PluginConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<PluginConfigContextValue>({
    config: DEFAULT_CONFIG,
    loaded: false,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await consoleFetch(
          '/api/plugins/ocp-secrets-management/plugin-config.json',
        );
        if (!response.ok) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as PluginConfig;
        if (!cancelled) {
          setState({ config: data, loaded: true, error: null });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            config: DEFAULT_CONFIG,
            loaded: true,
            error: err instanceof Error ? err.message : 'Failed to load plugin config',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return React.createElement(PluginConfigContext.Provider, { value: state }, children);
};

/**
 * Returns the plugin configuration. When rendered outside PluginConfigProvider
 * (e.g. tests), falls back to default config (delete disabled).
 */
export function usePluginConfig(): PluginConfigContextValue {
  return React.useContext(PluginConfigContext);
}

/** Convenience: returns true when delete is enabled in the plugin config. */
export function useDeleteEnabled(): boolean {
  const { config } = usePluginConfig();
  return config.features.delete.enabled;
}
