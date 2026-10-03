import { on } from '../core/events.js';

export function initToasts() {
  const box = document.getElementById('toasts');
  on('toast', (msg, type = 'info', sec = 4.5) => {
    const d = document.createElement('div');
    d.className = 'toast ' + type; d.textContent = msg;
    box.prepend(d);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, sec * 1000);
  });
}
