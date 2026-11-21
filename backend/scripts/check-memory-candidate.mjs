// Stage a review copy, never approval. The Memory pair is NOT a daily ranking result.
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadArticles } from '../src/news.mjs';
import { candidate } from '../src/editorial.mjs';
const env = fileURLToPath(new URL('../../.env',import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const articles = await loadArticles(process.env.NEWSTEX_DATA_DIR);
const hashes = ['7ff5c4fb90d490a9d7929a6cf34e37317b6e186c6a204b87059819c2a69a28b9','573d9554e9e757d72371186bff9e9beeea1f6078b78ba1c1b167d06109f5cbb3'];
const updates = candidate.articleIds.map((id,i) => {
  const a = articles.find(a=>a.id === id);
  const quote = a?.text.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
  if (!quote || a.date.slice(0,10) !== candidate.editions[i].slice(0,10) || a.dateMs > Date.parse(candidate.editions[i]) ||
    createHash('sha256').update(quote).digest('hex') !== hashes[i]) throw new Error(`Missing or changed candidate evidence: edition ${i+1}`);
  return {updateId:candidate.updateIds[i], articleId:id, publishedAt:a.date,
    sourceUrl:a.url, evidenceQuote:quote, spokenText:'',
    reviewPrompt: i ? 'Select the complete source sentence about conditional willingness. Preserve exactly who must request or decide what, including every qualification in that dated source. No completed return, rejection or later development.' :
      'Select the full source sentence establishing Musk’s role in the campaign. Exclude later statements and unsupported board positions.'};
});
const dir = new URL('../../generated/',import.meta.url);
await mkdir(dir,{recursive:true, mode:0o700});
await writeFile(new URL('memory-candidate.json',dir),JSON.stringify({storyId:candidate.storyId,title:'The Nvidia leadership campaign',language:'en',
  status:'needs-review',reviewedBy:'',reviewedAt:'',editions:candidate.editions,updates},null,2)+'\n',{mode:0o600});
console.log('Private draft: generated/memory-candidate.json (NOT approved). Copy outside the project before editing. Follow docs/MEMORY.md.');
