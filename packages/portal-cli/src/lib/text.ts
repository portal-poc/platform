export const toPascalCase = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join('');

export const isKebabCase = (value: string): boolean => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value);

export const parseList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Strips `//` line comments so JSONC preset files can be parsed. */
export const parseJsonc = (text: string): unknown => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
