#!/usr/bin/env node
// threadkeeper .. turns X threads into a reading page. zero deps.
// MCP (stdio):  node server.mjs
// CLI build:    node server.mjs build suzanne
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.THREADKEEPER_DIR || process.cwd(); // where threads/ and dist/ live
const THREADS = path.join(DATA, 'threads');
const DIST = path.join(DATA, 'dist');
const IMG = f => { const [id, ext = 'jpg'] = f.split('.'); return `https://pbs.twimg.com/media/${id}?format=${ext}&name=large`; };

// JS to run in a logged-in Chrome tab on a thread's first post. returns the JSON save_thread wants.
const EXTRACTOR = `(async()=>{const me=location.pathname.split('/')[1];const seen=new Map();
for(let i=0;i<12;i++){for(const a of document.querySelectorAll('article[data-testid=tweet]')){
const h=[...a.querySelectorAll('a[href*="/status/"]')].map(x=>x.getAttribute('href')).find(h=>new RegExp('^/'+me+'/status/\\\\d+$').test(h));
if(!h||!(a.querySelector('[data-testid=User-Name]')?.innerText||'').includes('@'+me)||seen.has(h))continue;
seen.set(h,{id:h.split('/').pop(),time:a.querySelector('time')?.getAttribute('datetime'),text:a.querySelector('[data-testid=tweetText]')?.innerText||'',
img:[...a.querySelectorAll('[data-testid=tweetPhoto] img')].map(m=>{const u=new URL(m.src);return u.pathname.split('/').pop()+'.'+(u.searchParams.get('format')||'jpg')}),video:!!a.querySelector('video')});}
window.scrollBy(0,1200);await new Promise(r=>setTimeout(r,1200));}
return JSON.stringify({writer:me,posts:[...seen.values()].filter(p=>p.text)});})()`;


// public embed endpoint (no login, no key). walks up from the LAST post of a thread.
const synToken = id => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
async function fetchThread({ url, title, tags = [] }) {
  let id = String(url).match(/status\/(\d+)/)?.[1] || String(url).match(/^\d+$/)?.[0];
  if (!id) throw new Error('need a post link like x.com/name/status/123');
  const posts = []; let writer, name;
  while (id && posts.length < 100) {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken(id)}`);
    if (!r.ok) throw new Error(`x returned ${r.status} for ${id}`);
    const j = await r.json();
    writer ||= j.user?.screen_name; name ||= j.user?.name;
    const media = (j.mediaDetails || []);
    posts.unshift({ id: j.id_str, time: j.created_at, text: (j.text || '').replace(/\s*https:\/\/t\.co\/\w+$/, ''),
      img: media.filter(m => m.type === 'photo').map(m => { const u = new URL(m.media_url_https); return u.pathname.split('/').pop(); }),
      video: media.some(m => m.type !== 'photo') });
    id = j.in_reply_to_screen_name === writer ? j.in_reply_to_status_id_str : null;
  }
  title ||= posts[0].text.split('\n')[0].replace(/\.?\s*A thread.*$/i, '').replace(/@(\w+)/g, '$1').trim().replace(/[.,:]+$/, '');
  return { writer, name, title, tags, artists: [...new Set(posts.flatMap(p => [...p.text.matchAll(/@(\w+)/g)].map(m => m[1])))], posts };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const linkify = s => esc(s).replace(/@(\w{1,15})/g, '<a href="https://x.com/$1" target="_blank" rel="noopener">@$1</a>').replace(/\n/g, '<br>');

function listThreads(writer) {
  const dir = path.join(THREADS, writer);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function saveThread({ writer, title, slug, tags = [], artists = [], posts, name }) {
  if (!posts?.length) throw new Error('no posts');
  slug ||= posts[0].time.slice(0, 10) + '-' + (title || 'thread').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dir = path.join(THREADS, writer); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, slug + '.json');
  fs.writeFileSync(file, JSON.stringify({ writer, name, title, slug, tags, artists, posts }, null, 2));
  return { file, posts: posts.length };
}

const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clean = s => s.replace(/^\d+\/\d+\s*/, '').replace(/\s*A thread\s*\d+\/\d+$/, '');

function threadHtml(t, i, all) {
  const first = t.posts[0];
  const prev = all[i - 1], next = all[i + 1];
  const body = t.posts.map((p, i) => `
    <section class="post"><span class="n">${i === 0 ? '' : String(i).padStart(2, '0')}</span><div>
      <p>${linkify(clean(p.text))}${p.truncated ? ' <a href="https://x.com/' + t.writer + '/status/' + p.id + '" target="_blank" rel="noopener">… continue on X</a>' : ''}</p>
      ${p.img.length ? `<div class="imgs i${p.img.length}">${p.img.map(f => `<img loading="lazy" src="${IMG(f)}" alt="">`).join('')}</div>` : ''}
      ${p.video ? `<a class="vid" href="https://x.com/${t.writer}/status/${p.id}" target="_blank" rel="noopener">▶ watch the video on X</a>` : ''}
    </div></section>`).join('');
  return `<article class="thread" id="${t.slug}" hidden>
    <a class="back" href="#">← all threads</a>
    <div class="meta">${fmtDate(first.time)} · ${t.posts.length} posts · ${t.tags.map(esc).join(' · ')}</div>
    <h2>${esc(t.title)}</h2>${body}
    <a class="orig" href="https://x.com/${t.writer}/status/${first.id}" target="_blank" rel="noopener">read the original thread on X ↗</a>
    <nav class="pn">${prev ? `<a href="#${prev.slug}">← newer: ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#${next.slug}">older: ${esc(next.title)} →</a>` : ''}</nav>
  </article>`;
}

function cardHtml(t) {
  const first = t.posts[0];
  const cover = t.posts.flatMap(p => p.img)[0];
  const search = (t.title + ' ' + t.tags.join(' ') + ' ' + t.artists.join(' ') + ' ' + t.posts.map(p => p.text).join(' ')).toLowerCase();
  return `<a class="card" href="#${t.slug}" data-tags="${esc(t.tags.join('|'))}" data-search="${esc(search)}">
    <div class="cover">${cover ? `<img loading="lazy" src="${IMG(cover).replace('name=large', 'name=small')}" alt="">` : ''}</div>
    <div class="cbody"><div class="meta">${fmtDate(first.time)} · ${t.posts.length} posts</div>
    <h3>${esc(t.title)}</h3>
    <div class="ctags">${t.tags.map(g => `<span>${esc(g)}</span>`).join('')}</div></div>
  </a>`;
}

function buildPage(writer) {
  const threads = listThreads(writer);
  if (!threads.length) throw new Error('no threads for ' + writer);
  const name = threads[0].name || writer;
  const tags = [...new Set(threads.flatMap(t => t.tags))];
  const tpl = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');
  const html = tpl.replaceAll('{{NAME}}', esc(name)).replaceAll('{{HANDLE}}', esc(threads[0].writer))
    .replaceAll('{{COUNT}}', `${threads.length} thread${threads.length === 1 ? '' : 's'}`)
    .replace('{{FILTERS}}', ['all', ...tags].map((g, i) => `<button class="chip${i ? '' : ' on'}" data-tag="${esc(g)}">${esc(g)}</button>`).join(''))
    .replaceAll('{{DEMO_LAST}}', threads[0].posts.at(-1).id).replaceAll('{{DEMO_POSTS}}', String(threads[0].posts.length))
    .replaceAll('{{DEMO_IMGS}}', String(threads[0].posts.flatMap(p => p.img).length))
    .replaceAll('{{DEMO_TITLE}}', esc(threads[0].title).replace(/'/g, '’').replace(/\\/g, '')).replaceAll('{{DEMO_SLUG}}', threads[0].slug)
    .replace('{{CARDS}}', threads.map(cardHtml).join(''))
    .replace('{{THREADS}}', threads.map(threadHtml).join('\n'));
  const out = path.join(DIST, writer, 'index.html'); fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { out, threads: threads.length, bytes: html.length };
}

const TOOLS = [
  { name: 'fetch_thread', description: 'Fetch a whole X thread from the link to its LAST post (no login, no API key). Returns JSON ready for save_thread.', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } }, run: fetchThread },
  { name: 'extractor_script', description: 'Fallback if fetch_thread is blocked: JS to run (javascript_tool) in a logged-in Chrome tab open on the first post of an X thread. Returns thread JSON for save_thread.', inputSchema: { type: 'object', properties: {} }, run: () => EXTRACTOR },
  { name: 'save_thread', description: 'Save one thread (writer, title, tags, artists, posts[]) to threads/<writer>/<slug>.json.', inputSchema: { type: 'object', required: ['writer', 'title', 'posts'], properties: { writer: { type: 'string' }, name: { type: 'string' }, title: { type: 'string' }, slug: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, artists: { type: 'array', items: { type: 'string' } }, posts: { type: 'array' } } }, run: saveThread },
  { name: 'list_threads', description: 'List archived threads for a writer.', inputSchema: { type: 'object', required: ['writer'], properties: { writer: { type: 'string' } } }, run: ({ writer }) => listThreads(writer).map(t => ({ slug: t.slug, title: t.title, posts: t.posts.length })) },
  { name: 'build_page', description: 'Render dist/<writer>/index.html (one-pager, noindex) from all saved threads.', inputSchema: { type: 'object', required: ['writer'], properties: { writer: { type: 'string' } } }, run: ({ writer }) => buildPage(writer) },
];

if (process.argv[2] === 'build') {
  console.log(buildPage(process.argv[3] || 'suzanne'));
} else if (process.argv[2] === 'add') {
  // threadkeeper add <link-to-last-post>  → saves threads/<handle>/… and rebuilds dist/<handle>/index.html
  const t = await fetchThread({ url: process.argv[3] });
  console.log(saveThread(t));
  console.log(buildPage(t.writer));
} else {
  // minimal MCP over stdio (newline-delimited JSON-RPC)
  const send = m => process.stdout.write(JSON.stringify(m) + '\n');
  let buf = '';
  process.stdin.on('data', async d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const { id, method, params } = JSON.parse(line);
      if (id === undefined) continue;
      try {
        if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'threadkeeper', version: '0.1.0' } } });
        else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
        else if (method === 'tools/call') {
          const t = TOOLS.find(t => t.name === params.name); if (!t) throw new Error('unknown tool');
          const r = await t.run(params.arguments || {});
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }] } });
        } else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
        else send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } });
      } catch (e) { send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e.message || e) }] } }); }
    }
  });
}
