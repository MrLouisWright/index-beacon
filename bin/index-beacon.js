#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'index-beacon', version: pkg.version, configKey: 'indexBeacon', rules: RULES,
  tagline: 'check meta robots and X-Robots-Tag against your intended indexing rules',
  usage: 'Usage: index-beacon [site-dir] [options]',
  help: `${SITE_HELP}Intended indexing
      --noindex <globs>        Pages that should be noindex (added to the defaults)
      --index <globs>          Pages that must be indexable (wins over --noindex)
      --nofollow <globs>       Pages where nofollow is intended
      --no-defaults            Do not use the built-in noindex globs (/search, /admin/**, /drafts/**, ...)
      --report-intended        Also list intentionally noindex pages (info)
`,
  options: { ...SITE_OPTIONS, noindex: { type: 'string', multiple: true }, index: { type: 'string', multiple: true }, nofollow: { type: 'string', multiple: true }, 'no-defaults': { type: 'boolean' }, 'report-intended': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, noindex: splitList(o.noindex), index: splitList(o.index), nofollow: splitList(o.nofollow), useDefaults: o['no-defaults'] ? false : undefined, reportIntended: o['report-intended'] || undefined, toolVersion: pkg.version }, config, configFile),
});
