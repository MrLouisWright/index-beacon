# index-beacon

> Check which pages of your built static site search engines are told not to index or follow, via meta robots and X-Robots-Tag, against the rules you actually intend.

One stray `noindex` can remove a money page from Google, and a staging `X-Robots-Tag: noindex` that ships to production can remove the whole site. The opposite also happens: search result pages, drafts and thank-you pages get indexed. `index-beacon` reads every built HTML page and the header rules in Netlify/Cloudflare `_headers` and `vercel.json`, works out the effective robots directives for each page, and compares them with your intended indexing rules. Each finding has the file, line, severity and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Intent:** declare which pages should be `noindex` (`noindex` globs; sensible defaults such as `/search`, `/admin/**`, `/drafts/**`, `/thank-you*`, `/cart*`), which must stay indexable (`index` globs win), and where `nofollow` is intended. Everything else is expected to be indexable and followed.
- **Leaks:** site-wide noindex, from a `/*` header rule or because every page is noindex (critical).
- **Per page:** unexpected `noindex`/`none`, unexpected `nofollow`, indexable pages that should be noindex, passed `unavailable_after` dates.
- **Correctness:** robots meta outside `<head>`, contradictory directives (index + noindex, meta vs header), bot-specific rules (googlebot, bingbot, ...) that disagree with the generic one, unknown or misspelt directives (`no-index`).
- **Visibility:** `nosnippet` / `max-snippet:0` on indexable pages (hides them from rich results and AI answers) and `noimageindex`.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides, GitHub Action with job summary.

### Scope

index-beacon looks at meta robots and X-Robots-Tag only. It does not read or lint robots.txt (see securitytxt-sentinel for robots.txt hygiene and answer-beacon for AI-crawler rules), and it does not check sitemaps (sitemap-beacon) or canonicals (canonical-beacon).

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `index-site-wide-noindex` | critical | Every page (or a site-wide header rule) is noindex: a staging setting leaked into production |
| `index-unexpected-noindex` | high | Page should be indexable but is noindex (meta robots or X-Robots-Tag) |
| `index-expired` | high | unavailable_after date has passed, so the page is dropped from the index |
| `index-meta-in-body` | high | Robots meta tag is outside <head> and may be ignored |
| `index-unexpected-indexable` | medium | Page should be noindex (matches a noindex rule) but is indexable |
| `index-unexpected-nofollow` | medium | Page should be followed but is nofollow |
| `index-conflict` | medium | Contradictory directives (index + noindex, or meta and header disagree) |
| `index-bot-differs` | low | A bot-specific robots meta (e.g. googlebot, bingbot) disagrees with the generic one |
| `index-invalid-directive` | low | Unknown or malformed robots directive |
| `index-snippet-restricted` | low | Indexable page blocks or limits snippets (nosnippet, max-snippet:0), hiding it from rich results and AI answers |
| `index-noimageindex` | info | Images on the page are excluded from image search |
| `index-noindex-page` | info | Page is noindex as intended |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx index-beacon dist
npx index-beacon dist --noindex "/internal/**,/landing/test-*" --fail-on medium
npx index-beacon public --index "/search" --nofollow "/user/**"
npx index-beacon out --no-defaults --report-intended --format markdown
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
index-beacon — /workspace/index-beacon/test/fixtures/bad
11 page(s); 5 noindex

HIGH     _headers:1 /hdr.html is noindex via X-Robots-Tag "noindex" (_headers) [index-unexpected-noindex]
         ↳ fix: Remove noindex, or add "/hdr.html" to the "noindex" rules if it is intentional.
HIGH     bot.html:1 /bot.html is noindex via <meta name="googlebot" content="noindex"> [index-unexpected-noindex]
         ↳ fix: Remove noindex, or add "/bot.html" to the "noindex" rules if it is intentional.
HIGH     both.html:1 /both.html is noindex via <meta name="robots" content="noindex"> [index-unexpected-noindex]
         ↳ fix: Remove noindex, or add "/both.html" to the "noindex" rules if it is intentional.
HIGH     docs.html:1 <meta name="robots" content="noindex"> on /docs.html is outside <head> [index-meta-in-body]
         ↳ fix: Move robots meta tags into <head>.
HIGH     docs.html:1 /docs.html is noindex via <meta name="robots" content="noindex"> [index-unexpected-noindex]
```

## Options

```text
index-beacon 1.0.0 — check meta robots and X-Robots-Tag against your intended indexing rules

Usage: index-beacon [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Intended indexing
      --noindex <globs>        Pages that should be noindex (added to the defaults)
      --index <globs>          Pages that must be indexable (wins over --noindex)
      --nofollow <globs>       Pages where nofollow is intended
      --no-defaults            Do not use the built-in noindex globs (/search, /admin/**, /drafts/**, ...)
      --report-intended        Also list intentionally noindex pages (info)

Common
  -c, --config <file>     JSON config (default: .index-beacon.json or "indexBeacon" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.index-beacon.json` (or a `"indexBeacon"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "index-site-wide-noindex": "low"
  },
  "allowlist": [
    {
      "rule": "index-unexpected-noindex",
      "subject": "/beta/*",
      "reason": "Beta section stays out of the index until launch",
      "expires": "2027-03-31"
    }
  ],
  "noindex": [
    "/internal/**"
  ],
  "index": [
    "/search"
  ],
  "nofollow": [
    "/user/**"
  ]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.index-beacon.json` can live at your repository root. Other keys: `noindex`, `index`, `nofollow` (glob lists), `"useDefaults": false`, `reportIntended` and `siteWideMin` (minimum pages before the all-noindex check fires, default 3). Globs match the URL path (`/blog/**`) or the file (`blog/*.html`).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  index-beacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/index-beacon@v1
        with:
          path: dist
          fail-on: high
          sarif: index-beacon.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: index-beacon.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, DEFAULT_NOINDEX } from "index-beacon";
const report = check("dist", { noindex: ["/internal/**"], index: ["/search"] });
console.log(report.info.noindex, report.findings);
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
