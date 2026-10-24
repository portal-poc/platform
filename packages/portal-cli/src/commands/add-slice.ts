import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isKebabCase, parseList, toPascalCase } from '../lib/text.ts';

export const SLICE_LAYERS = { page: 'pages', widget: 'widgets', feature: 'features', entity: 'entities' } as const;

export type SliceLayer = keyof typeof SLICE_LAYERS;

type AddSliceOptions = { dir?: string; segments?: string };

const SEGMENT_NOTES: Record<string, string> = {
  api: 'Requests, queryOptions factories, mutations of this slice.',
  model: 'State, business logic, types of this slice.',
  lib: 'Helpers used only inside this slice.',
};

const componentName = (layer: SliceLayer, name: string) => `${toPascalCase(name)}${layer === 'page' ? 'Page' : ''}`;

/** Creates `src/<layer>/<name>/` with segments and a public `index.ts`. */
export const runAddSlice = (layer: SliceLayer, name: string, options: AddSliceOptions = {}): string => {
  if (!isKebabCase(name)) {
    throw new Error(`Slice name "${name}" must be kebab-case.`);
  }
  const sliceDir = join(resolve(options.dir ?? '.'), 'src', SLICE_LAYERS[layer], name);
  if (existsSync(sliceDir)) {
    throw new Error(`${sliceDir} already exists.`);
  }
  const segments = new Set(['ui', ...parseList(options.segments)]);
  const component = componentName(layer, name);

  mkdirSync(join(sliceDir, 'ui'), { recursive: true });
  writeFileSync(join(sliceDir, 'ui', `${component}.tsx`), `export const ${component} = () => <div>${component}</div>;\n`);
  writeFileSync(join(sliceDir, 'index.ts'), `export { ${component} } from './ui/${component}';\n`);

  for (const segment of [...segments].filter((item) => item !== 'ui')) {
    mkdirSync(join(sliceDir, segment), { recursive: true });
    writeFileSync(join(sliceDir, segment, 'README.md'), `${SEGMENT_NOTES[segment] ?? `Segment "${segment}".`}\n`);
  }
  console.log(`✔ Created ${SLICE_LAYERS[layer]}/${name} (${[...segments].join(', ')}) — public API: index.ts`);
  if (layer === 'page') {
    console.log(`  Next: add <Route path="${name}" element={<${component} />} /> to src/app/routes/RemoteRoutes.tsx`);
  }
  return sliceDir;
};
