import * as fs from 'fs';
import * as path from 'path';

interface NavExtension {
  type: string;
  properties: {
    id: string;
    name: string;
    section?: string;
    href?: string;
  };
}

const ROOT = path.resolve(__dirname, '..');
const extensions = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'console-extensions.json'), 'utf-8'),
) as NavExtension[];
const locale = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'locales/en/plugin__ocp-secrets-management.json'), 'utf-8'),
) as Record<string, string>;

/**
 * Console nav extension `name` values are i18n references of the form
 * `%plugin__<name>~<key>%`. Resolve them the same way the Console SDK does:
 * look up `<key>` in the plugin's locale bundle.
 */
function resolveNavLabel(rawName: string): string {
  const match = /^%plugin__[^~]+~(.+)%$/.exec(rawName);
  const key = match ? match[1] : rawName;
  return locale[key] ?? key;
}

describe('sidebar navigation labels', () => {
  const section = extensions.find(
    (ext) => ext.type === 'console.navigation/section' && ext.properties.id === 'plugins',
  );
  const link = extensions.find(
    (ext) => ext.type === 'console.navigation/href' && ext.properties.id === 'secrets-management',
  );

  it('registers the top-level nav section and submenu link', () => {
    expect(section).toBeDefined();
    expect(link).toBeDefined();
    expect(link?.properties.section).toBe('plugins');
    expect(link?.properties.href).toBe('/secrets-management');
  });

  it('renders the top-level menu as "Secrets Management" (not "Plugins")', () => {
    const label = resolveNavLabel(section.properties.name);
    expect(label).toBe('Secrets Management');
    expect(label).not.toBe('Plugins');
  });

  it('renders the submenu item as "Overview" (not "Secrets Management")', () => {
    const label = resolveNavLabel(link.properties.name);
    expect(label).toBe('Overview');
    expect(label).not.toBe('Secrets Management');
  });
});
