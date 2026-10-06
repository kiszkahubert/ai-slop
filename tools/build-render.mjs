import { build } from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('assets/render', { recursive: true });
await build({ entryPoints: ['src/render/rayTracing/runtime.js'], outfile: 'assets/render/rt-runtime.js', bundle: true,
  format: 'esm', external: ['three'], minify: true, legalComments: 'linked', target: 'es2022' });
await build({ entryPoints: ['src/render/rayTracing/worker.js'], outfile: 'assets/render/rt-worker.js', bundle: true,
  format: 'esm', minify: true, legalComments: 'linked', target: 'es2022' });
// Bundled Three shader strings contain trailing spaces; normalize generated text.
for (const path of ['assets/render/rt-runtime.js', 'assets/render/rt-worker.js']) {
  fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/[\t ]+$/gm, ''));
}
