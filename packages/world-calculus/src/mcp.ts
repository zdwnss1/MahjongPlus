import type { LanguageResourceDescriptor, LanguageToolDescriptor } from './types.js';

export function coreLanguageCatalog(): {
  tools: LanguageToolDescriptor[];
  resources: LanguageResourceDescriptor[];
} {
  const schema = { type: 'object' };
  return {
    tools: [
      {
        name: 'core.evaluate',
        description: 'Evaluate a closed core expression or formula.',
        inputSchema: schema,
        outputSchema: schema,
      },
      {
        name: 'core.solve',
        description: 'Solve a finite-domain core program with a deterministic step budget.',
        inputSchema: schema,
        outputSchema: schema,
      },
      {
        name: 'core.reduce',
        description: 'Fold an ordered event stream with a declarative reducer.',
        inputSchema: schema,
        outputSchema: schema,
      },
      {
        name: 'core.rewrite',
        description: 'Apply an atomic generic document/graph rewrite program.',
        inputSchema: schema,
        outputSchema: schema,
      },
      {
        name: 'core.expand',
        description: 'Expand a standard-library macro into closed core calculus.',
        inputSchema: schema,
        outputSchema: schema,
      },
    ],
    resources: [
      {
        uri: 'mahjongplus://language/core-calculus/0.1',
        name: 'MahjongPlus core calculus specification',
        mimeType: 'application/json',
      },
      {
        uri: 'mahjongplus://stdlib/core-calculus',
        name: 'MahjongPlus compile-time macro library',
        mimeType: 'application/json',
      },
    ],
  };
}
