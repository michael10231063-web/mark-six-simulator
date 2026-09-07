import { readFile, writeFile } from 'node:fs/promises';
import { fetchOfficialResult } from '../lib/official-result.mjs';

const file = new URL('../public/latest-result.json', import.meta.url);
let previous = JSON.parse(await readFile(file, 'utf8'));
try {
  const response = await fetch('https://michael10231063-web.github.io/mark-six-simulator/latest-result.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (response.ok) {
    const published = await response.json();
    // Preserve the last deployed successful snapshot across fresh CI checkouts.
    if (published.updatedFromOfficial && published.drawDate >= previous.drawDate && Array.isArray(published.numbers) && published.numbers.length === 6 && Array.isArray(published.prizes) && published.prizes.length === 7) previous = published;
  }
} catch { /* A first deployment has no published snapshot. */ }
try {
  const result = await fetchOfficialResult();
  await writeFile(file, `${JSON.stringify(result)}\n`);
  console.log(`Updated draw ${result.drawNo} at ${result.fetchedAt}`);
} catch (error) {
  await writeFile(file, `${JSON.stringify({ ...previous, lastAttemptAt: new Date().toISOString(), updateError: true })}\n`);
  console.warn(`::warning::Latest result unavailable; keeping draw ${previous.drawNo}. ${error instanceof Error ? error.message : error}`);
}
