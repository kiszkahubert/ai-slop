// Serve the game for local play (works the same on Windows, macOS and Linux).
//
//   npm start                    # http://localhost:8000
//   npm start -- 3000            # any port
//   npm start -- --port 3000     # same
//   PORT=3000 npm start          # or from the environment
//   npm run start:offline        # prints the ?localthree URL (three.js from node_modules)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 8000;
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const flag = args.indexOf('--port');
const raw = flag >= 0 ? args[flag + 1] : args.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? DEFAULT_PORT;
const port = Number(raw);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port "${raw}". Use a number from 1 to 65535, e.g. npm start -- 3000`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createServer } = createRequire(import.meta.url)('http-server');
const server = createServer({ root, cache: -1 });
server.server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Pick another: npm start -- ${port + 1}` : e.message);
  process.exit(1);
});
server.listen(port, () => {
  console.log(`Everest is up: http://localhost:${port}/${offline ? '?localthree   (three.js served from node_modules)' : ''}`);
  console.log('Press Ctrl+C to stop.');
});
