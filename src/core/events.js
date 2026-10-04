// Minimal event bus so simulation code never imports UI code.
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, ...args) {
  for (const fn of handlers.get(name) || []) fn(...args);
}

export const toast = (msg, type = 'info', seconds = 4.5) => emit('toast', msg, type, seconds);
