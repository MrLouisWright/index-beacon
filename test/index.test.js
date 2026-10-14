import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, summarise, RULES, DEFAULT_NOINDEX } from '../src/index.js';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const rules = (r) => r.findings.map((f) => f.rule);
const site = (files) => { const d = mkdtempSync(join(tmpdir(), 'ib-')); for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); } return d; };
const page = (head = '', body = '') => `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
const NI = '<meta name="robots" content="noindex">';

test('good fixture is clean at --fail-on low', () => { assert.deepEqual(check(fx('good')).findings, []); });
test('bad fixture covers the rule families', () => {
  const r = rules(check(fx('bad')));
  for (const k of ['index-unexpected-noindex', 'index-meta-in-body', 'index-expired', 'index-conflict', 'index-unexpected-nofollow', 'index-unexpected-indexable', 'index-bot-differs', 'index-invalid-directive', 'index-snippet-restricted', 'index-noimageindex']) assert.ok(r.includes(k), k);
  for (const f of check(fx('bad')).findings) assert.ok(RULES[f.rule]);
});
test('site-wide noindex: every page, or a /* header rule', () => {
  assert.deepEqual(rules(check(site({ 'a.html': page(NI), 'b.html': page(NI), 'c.html': page(NI) }))), ['index-site-wide-noindex']);
  const r = rules(check(site({ 'a.html': page(), 'b.html': page(), _headers: '/*\n  X-Robots-Tag: noindex\n' })));
  assert.ok(r.includes('index-site-wide-noindex')); assert.ok(!r.includes('index-unexpected-noindex'));
  assert.equal(check(site({ 'a.html': page(), 'b.html': page(), _headers: '/*\n  X-Robots-Tag: noindex\n' })).findings[0].severity, 'critical');
});
test('vercel.json X-Robots-Tag headers are read', () => {
  const d = site({ 'a.html': page(), 'b.html': page(), 'vercel.json': JSON.stringify({ headers: [{ source: '/a.html', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }] }) });
  assert.deepEqual(rules(check(d)), ['index-unexpected-noindex']);
});
test('intent rules: noindex globs, index override, defaults off, report intended', () => {
  const d = site({ 'a.html': page(), 'secret/x.html': page(NI), 'search.html': page(), 'k.html': page() });
  assert.deepEqual(rules(check(d)), ['index-unexpected-noindex', 'index-unexpected-indexable']);
  assert.deepEqual(rules(check(d, { noindex: ['/secret/**'] })), ['index-unexpected-indexable']);
  assert.deepEqual(rules(check(d, { noindex: ['/secret/**'], useDefaults: false })), []);
  assert.deepEqual(rules(check(d, { noindex: ['/secret/**'], index: ['/search.html'] })), []);
  assert.ok(rules(check(d, { noindex: ['/secret/**'], useDefaults: false, reportIntended: true })).includes('index-noindex-page'));
  assert.ok(rules(check(d, {}, { noindex: ['secret/*'], useDefaults: false })).length === 0);
  assert.ok(DEFAULT_NOINDEX.includes('/admin/**'));
});
test('nofollow intent and "none"', () => {
  const d = site({ 'a.html': page('<meta name="robots" content="nofollow">'), 'b.html': page('<meta name="robots" content="none">'), 'c.html': page() });
  assert.deepEqual(rules(check(d)), ['index-unexpected-noindex', 'index-unexpected-nofollow']);
  assert.deepEqual(rules(check(d, { nofollow: ['/a.html'], noindex: ['/b.html'] })), []);
});
test('summarise', () => {
  assert.deepEqual(summarise([{ directives: ['none'] }]), { noindex: true, nofollow: true, index: false, follow: false, all: ['none'] });
});
test('unavailable_after in the future is fine; allowlist with expiry', () => {
  const d = site({ 'a.html': page('<meta name="robots" content="unavailable_after: 2999-01-01">'), 'b.html': page(NI) });
  assert.deepEqual(rules(check(d)), ['index-unexpected-noindex']);
  const r = check(d, { now: new Date('2026-10-14') }, { allowlist: [{ rule: 'index-unexpected-noindex', subject: '/b.html', reason: 'soft launch', expires: '2026-11-01' }] });
  assert.equal(r.findings.length, 0);
  const e = check(d, { now: new Date('2026-12-14') }, { allowlist: [{ rule: 'index-unexpected-noindex', subject: '/b.html', reason: 'soft launch', expires: '2026-11-01' }] });
  assert.deepEqual(rules(e).sort(), ['allowlist-expired', 'index-unexpected-noindex']);
});
test('CLI exit codes and formats', () => {
  const bin = new URL('../bin/index-beacon.js', import.meta.url).pathname;
  const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8' });
  assert.equal(run(fx('good'), '--fail-on', 'low').status, 0);
  assert.equal(run(fx('bad')).status, 1);
  assert.equal(run(fx('bad'), '--fail-on', 'none').status, 0);
  assert.equal(run('/nonexistent-dir-xyz').status, 2);
  assert.equal(run(fx('good'), '--fail-on', 'bogus').status, 2);
  const s = JSON.parse(run(fx('bad'), '--format', 'sarif', '--fail-on', 'none').stdout); assert.equal(s.version, '2.1.0');
  assert.match(run(fx('bad'), '--format', 'markdown', '--fail-on', 'none').stdout, /\| Severity \|/);
});
