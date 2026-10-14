// index-beacon: indexability checks (meta robots / X-Robots-Tag vs intended rules) for built static sites. Louis Wright, MIT.
import { contentPages, runBeacon, finder, SITE_OPTIONS, SITE_HELP, siteOptions, robotsDirectives, matchAny } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { SITE_OPTIONS, SITE_HELP, siteOptions };

export const RULES = {
  'index-site-wide-noindex': { severity: 'critical', title: 'Every page (or a site-wide header rule) is noindex: a staging setting leaked into production' },
  'index-unexpected-noindex': { severity: 'high', title: 'Page should be indexable but is noindex (meta robots or X-Robots-Tag)' },
  'index-expired': { severity: 'high', title: 'unavailable_after date has passed, so the page is dropped from the index' },
  'index-meta-in-body': { severity: 'high', title: 'Robots meta tag is outside <head> and may be ignored' },
  'index-unexpected-indexable': { severity: 'medium', title: 'Page should be noindex (matches a noindex rule) but is indexable' },
  'index-unexpected-nofollow': { severity: 'medium', title: 'Page should be followed but is nofollow' },
  'index-conflict': { severity: 'medium', title: 'Contradictory directives (index + noindex, or meta and header disagree)' },
  'index-bot-differs': { severity: 'low', title: 'A bot-specific robots meta (e.g. googlebot, bingbot) disagrees with the generic one' },
  'index-invalid-directive': { severity: 'low', title: 'Unknown or malformed robots directive' },
  'index-snippet-restricted': { severity: 'low', title: 'Indexable page blocks or limits snippets (nosnippet, max-snippet:0), hiding it from rich results and AI answers' },
  'index-noimageindex': { severity: 'info', title: 'Images on the page are excluded from image search' },
  'index-noindex-page': { severity: 'info', title: 'Page is noindex as intended' },
};

const KNOWN = /^(all|index|follow|noindex|nofollow|none|noarchive|nocache|nosnippet|notranslate|noimageindex|indexifembedded|noodp|noydir|max-snippet:\s*-?\d+|max-image-preview:\s*(none|standard|large)|max-video-preview:\s*-?\d+|unavailable_after:.+)$/i;
export const DEFAULT_NOINDEX = ['/search', '/search/**', '/search.html', '/admin/**', '/drafts/**', '/draft/**', '/preview/**', '/private/**', '/thank-you*', '/thanks*', '/cart*', '/checkout/**', '/account/**', '/login*', '/tags/*/page/**', '/page/*/**'];
const BOTS = ['robots', 'googlebot', 'googlebot-news', 'bingbot', 'slurp', 'duckduckbot', 'yandex', 'baiduspider', 'applebot'];

/** Summarise a list of directive objects. */
export function summarise(dirs) {
  const all = dirs.flatMap((d) => d.directives);
  const has = (x) => all.includes(x);
  return { noindex: has('noindex') || has('none'), nofollow: has('nofollow') || has('none'), index: has('index') || has('all'), follow: has('follow') || has('all'), all };
}

export function analyze(site, opts = {}, config = {}, now = new Date()) {
  const { findings, add } = finder(RULES);
  const noindexGlobs = [...(config.useDefaults === false || opts.useDefaults === false ? [] : DEFAULT_NOINDEX), ...(config.noindex || []), ...(opts.noindex || [])];
  const indexGlobs = [...(config.index || []), ...(opts.index || [])];
  const nofollowGlobs = [...(config.nofollow || []), ...(opts.nofollow || [])];
  const reportIntended = opts.reportIntended ?? config.reportIntended ?? false;
  const pages = contentPages(site);
  let noCount = 0;
  const wide = site.headerRules.filter((r) => /^\/?\*$|^\/\*\*$|^\/\(\.\*\)$|^\/:path\*$/.test(r.pattern) && r.headers.some(([k, v]) => k === 'x-robots-tag' && /noindex|none/i.test(v)));
  for (const r of wide) add('index-site-wide-noindex', r.pattern, `${r.source}:${r.line ?? '?'} sets X-Robots-Tag noindex for ${r.pattern} (every page)`, 'Remove the site-wide X-Robots-Tag rule from the production config (keep it on preview/staging only).', { file: r.source, line: r.line });
  for (const pg of pages) {
    const dirs = robotsDirectives(site, pg, BOTS);
    const generic = dirs.filter((d) => d.bot === 'robots' || d.bot === 'googlebot');
    const s = summarise(generic);
    const where = (d) => (d.source === 'meta' ? `<meta name="${d.bot}" content="${d.raw}">` : `X-Robots-Tag "${d.raw}" (${d.file})`);
    const loc = (d) => ({ file: d?.source === 'header' ? d.file : pg.file, line: d?.line });
    const nd = generic.find((d) => d.directives.includes('noindex') || d.directives.includes('none'));
    const match = (g) => matchAny(g, pg.path) || matchAny(g, pg.file);
    const wantIndex = match(indexGlobs) || !match(noindexGlobs);
    for (const d of dirs) {
      if (d.source === 'meta' && !d.inHead) add('index-meta-in-body', pg.path, `${where(d)} on ${pg.path} is outside <head>`, 'Move robots meta tags into <head>.', loc(d));
      for (const x of d.directives) if (!KNOWN.test(x)) add('index-invalid-directive', pg.path, `Unknown robots directive "${x}" in ${where(d)}`, 'Use documented directives: noindex, nofollow, none, nosnippet, max-snippet:N, max-image-preview:large, unavailable_after:DATE…', loc(d));
      for (const x of d.directives) { const m = /^unavailable_after:\s*(.+)$/i.exec(x); if (m) { const t = new Date(m[1]); if (!Number.isNaN(t.getTime()) && t < (opts.now || now) && wantIndex) add('index-expired', pg.path, `${pg.path} has unavailable_after ${m[1].trim()}, which has passed`, 'Remove or update unavailable_after if the page should stay indexed.', loc(d)); } }
    }
    const metas = generic.filter((d) => d.source === 'meta'); const hdrs = generic.filter((d) => d.source === 'header');
    if (s.noindex && s.index) add('index-conflict', pg.path, `${pg.path} has both index and noindex directives (${generic.map(where).join('; ')})`, 'Keep one directive; search engines apply the most restrictive one (noindex).', loc(nd));
    else if (metas.length && hdrs.length && summarise(metas).noindex !== summarise(hdrs).noindex) add('index-conflict', pg.path, `Meta robots and X-Robots-Tag disagree on ${pg.path}`, 'Set indexing in one place; the most restrictive wins.', loc(hdrs[0]));
    const gen = summarise(dirs.filter((d) => d.bot === 'robots'));
    for (const b of [...new Set(dirs.map((d) => d.bot))].filter((b) => b !== 'robots')) { const bs = summarise(dirs.filter((d) => d.bot === b)); if (bs.noindex !== gen.noindex) add('index-bot-differs', `${pg.path}#${b}`, `${b} is ${bs.noindex ? 'noindex' : 'indexable'} on ${pg.path} but the generic robots rule is ${gen.noindex ? 'noindex' : 'indexable'}`, 'Make sure the bot-specific rule is intentional.', loc(dirs.find((d) => d.bot === b))); }
    if (s.noindex) {
      noCount++;
      if (wantIndex && !wide.length) add('index-unexpected-noindex', pg.path, `${pg.path} is noindex via ${where(nd)}`, `Remove noindex, or add "${pg.path}" to the "noindex" rules if it is intentional.`, loc(nd));
      else if (reportIntended) add('index-noindex-page', pg.path, `${pg.path} is noindex via ${where(nd)}`, 'No action needed.', loc(nd));
    } else {
      if (!wantIndex) add('index-unexpected-indexable', pg.path, `${pg.path} matches a noindex rule but is indexable`, 'Add <meta name="robots" content="noindex"> (or an X-Robots-Tag header), or add the path to the "index" rules.', { file: pg.file });
      if (s.nofollow && !match(nofollowGlobs)) add('index-unexpected-nofollow', pg.path, `${pg.path} is nofollow via ${where(generic.find((d) => d.directives.includes('nofollow') || d.directives.includes('none')))}`, 'Remove nofollow so links on the page pass signals, or list the path under "nofollow".', loc(generic.find((d) => d.directives.includes('nofollow'))));
      const sn = s.all.find((x) => x === 'nosnippet' || /^max-snippet:\s*0$/.test(x));
      if (sn) add('index-snippet-restricted', pg.path, `${pg.path} sets ${sn}`, 'Allow snippets (or use data-nosnippet on specific elements) so the page can appear in rich results and AI answers.', loc(generic.find((d) => d.directives.includes(sn))));
      if (s.all.includes('noimageindex') || s.all.some((x) => /^max-image-preview:\s*none$/.test(x))) add('index-noimageindex', pg.path, `${pg.path} keeps its images out of image search`, 'Remove noimageindex / max-image-preview:none unless intended.', { file: pg.file });
    }
  }
  if (!wide.length && pages.length >= (config.siteWideMin ?? 3) && noCount === pages.length) { for (let k = findings.length - 1; k >= 0; k--) if (findings[k].rule === 'index-unexpected-noindex') findings.splice(k, 1); add('index-site-wide-noindex', '*', `All ${pages.length} pages are noindex`, 'This usually means a staging/preview setting shipped to production. Remove the global noindex.', { file: pages[0].file }); }
  return { findings, info: { noindex: noCount }, summary: `${pages.length} page(s); ${noCount} noindex${site.baseUrl ? ` at ${site.baseUrl}` : ''}` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'index-beacon', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🔎', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
