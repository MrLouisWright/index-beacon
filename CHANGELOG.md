# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Effective robots directives per page from meta robots (generic and bot-specific) and `X-Robots-Tag` in `_headers` / `vercel.json`.
- Intended indexing rules: `noindex`, `index` and `nofollow` globs, with built-in noindex defaults.
- Site-wide noindex leak detection (header rule or every page noindex).
- Unexpected noindex / nofollow / indexable, passed `unavailable_after`, meta outside `<head>`, conflicting and unknown directives, bot-specific disagreements, snippet and image restrictions.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
