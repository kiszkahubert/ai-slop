#!/usr/bin/env node
// Runs a Python script with whichever interpreter is really installed.
// On Windows `python3` is often the Microsoft Store stub ("Python was not found…"), so try
// `python3`, then `python`, then the `py -3` launcher, and use the first that runs.
import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32'
  ? [['python'], ['py', '-3'], ['python3']]
  : [['python3'], ['python']];

for (const [cmd, ...pre] of candidates) {
  const probe = spawnSync(cmd, [...pre, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'], { stdio: 'ignore', shell: false });
  if (probe.status !== 0) continue;
  const run = spawnSync(cmd, [...pre, ...process.argv.slice(2)], { stdio: 'inherit', shell: false });
  process.exit(run.status ?? 1);
}
console.error('No Python 3.8+ interpreter found. Install Python 3 (https://www.python.org/downloads/) and try again.');
process.exit(1);
