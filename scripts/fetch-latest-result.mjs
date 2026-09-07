import { readFile, writeFile } from 'node:fs/promises';
import { fetchDrawHistory, mergeDraws } from '../lib/draw-history.mjs';
const file = new URL('../public/draw-history.json', import.meta.url);
const latestFile = new URL('../public/latest-result.json', import.meta.url);
let history = JSON.parse(await readFile(file, 'utf8'));
try {
  const response = await fetch('https://michael10231063-web.github.io/mark-six-simulator/draw-history.json', {cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (response.ok) {
    const published = await response.json();
    if (Array.isArray(published.draws)) history.draws = mergeDraws(history.draws,published.draws);
  }
} catch { /* Preserve the bundled archive on a first deployment or network failure. */ }
try {
  const incoming = await fetchDrawHistory();
  history = {...incoming,draws:mergeDraws(history.draws,incoming.draws)};
  console.log(`Updated ${history.draws.length} draws; latest ${history.draws[0].drawNo}; official unavailable: ${history.officialUnavailable}`);
} catch (error) {
  history = {...history,lastAttemptAt:new Date().toISOString(),updateError:true};
  console.warn(`::warning::Draw update failed; preserving history. ${error}`);
}
await writeFile(file,JSON.stringify(history)+'\n');
await writeFile(latestFile,JSON.stringify({...history.draws[0],updateError:history.updateError,lastAttemptAt:history.lastAttemptAt ?? history.checkedAt})+'\n');
