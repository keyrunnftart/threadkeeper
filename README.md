# threadkeeper

Turn your X threads into a calm reading page: cards, tags, search, one link per thread.
An MCP server and CLI in one file. No dependencies, no X login, no API key.

Live example: [keyrunnft.art/threads/keyrunnftart](https://keyrunnft.art/threads/keyrunnftart)
No-code version (paste a link, done): [keyrunnft.art/threads](https://keyrunnft.art/threads)

## What you need
| path | needs |
|---|---|
| website | the link to the last post of your thread. That's it. |
| Claude (MCP) | [Node.js 18+](https://nodejs.org) and Claude Code, VS Code with Claude, or Claude Desktop |
| command line | [Node.js 18+](https://nodejs.org) |

Not needed on any path: an X login, an X or Claude API key, a git account, or a database.
Optional: somewhere to host the page (GitHub Pages, Netlify, your own site).

## Three ways to use it

### 1. No code: the website
Paste the link to the **last post** of your thread at [keyrunnft.art/threads](https://keyrunnft.art/threads).
New writers are approved by hand, so nobody can archive someone else's threads.
If you already have a website, add it and your page will point readers there.

### 2. With Claude (Claude Code, VS Code, Claude Desktop)
Needs [Node.js 18+](https://nodejs.org). Run this in your terminal:

```bash
claude mcp add threadkeeper -- npx -y github:keyrunnftart/threadkeeper
```

Then ask Claude:

> archive this thread: https://x.com/you/status/123… (link to the LAST post)

Claude fetches the whole thread, saves it and builds your page at `dist/<handle>/index.html`.

For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{ "mcpServers": { "threadkeeper": { "command": "npx", "args": ["-y", "github:keyrunnftart/threadkeeper"],
  "env": { "THREADKEEPER_DIR": "C:/Users/you/threads" } } } }
```

### 3. Command line only
```bash
npx -y github:keyrunnftart/threadkeeper add https://x.com/you/status/123…
```
This writes `threads/<handle>/<date>-<slug>.json` and `dist/<handle>/index.html` in the current folder.
Run it again for each new thread, and the page gains a card.

## Put the page on your own site
`dist/<handle>/index.html` is a single self-contained file. Upload it anywhere:
- **GitHub Pages / Netlify / Vercel:** drop the file in and it's live.
- **WordPress, Lovable, Webflow:** add it as a static page, or embed it in an iframe.
- **Images** load from X's image servers. Nothing else is hosted.

## MCP tools
| tool | what it does |
|---|---|
| `fetch_thread(url)` | reads the whole thread, starting from the link to its last post, then working back to the first |
| `save_thread(...)` | saves it as `threads/<handle>/<slug>.json` (you can edit the title or tags first) |
| `list_threads(writer)` | lists what is archived |
| `build_page(writer)` | renders the reading page |
| `extractor_script()` | fallback if X blocks the public endpoint: JS to run in a logged-in browser tab |

## How it works
X's public embed endpoint (the one embedded tweets use) returns a post together with the post it replies to.
Starting from the last post, threadkeeper walks up the chain while the author keeps replying to themselves.
That yields the text, images, dates and @mentions. The page is plain HTML with a little JS.

## Notes
- The endpoint is unofficial and may be rate-limited or changed by X. `extractor_script` is the fallback.
- Only archive threads you wrote, or have permission to archive. Every page links back to the original posts.
- Stored data is plain JSON in folders you control.

Made by [KeyRun Studio](https://keyrunnft.art/studio). MIT licence.
