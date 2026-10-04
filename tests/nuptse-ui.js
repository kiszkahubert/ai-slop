const out = {
  win: document.getElementById('winText').textContent.includes('Nuptse'),
  stats: document.getElementById('winStats').textContent.includes('Nuptse'),
  continue: !document.getElementById('btnWinContinue').classList.contains('hidden'),
};
document.getElementById('btnWinDebrief').click();
out.debrief = document.getElementById('dbSub').textContent.includes('Nuptse');
out.journal = document.getElementById('dbJournal').textContent.includes('Summit — Nuptse');
return out;
