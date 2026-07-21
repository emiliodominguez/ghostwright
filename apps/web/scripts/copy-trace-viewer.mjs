import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pwCore = dirname(require.resolve('playwright-core/package.json'));
const src = join(pwCore, 'lib/vite/traceViewer');
const dest = fileURLToPath(new URL('../public/trace-viewer', import.meta.url));

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copied self-hosted trace viewer →', dest);
