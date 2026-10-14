import type { Report, Rule } from './core.js';
export * from './core.js';
export interface IndexOptions {
  baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean;
  /** Globs (URL path or file) of pages that should be noindex. Added to DEFAULT_NOINDEX. */
  noindex?: string[];
  /** Globs of pages that must be indexable (wins over noindex). */
  index?: string[];
  /** Globs of pages where nofollow is intended. */
  nofollow?: string[];
  /** Set false to drop DEFAULT_NOINDEX. */
  useDefaults?: boolean;
  /** Also list intentionally noindex pages (info). */
  reportIntended?: boolean;
  now?: Date; toolVersion?: string; [option: string]: unknown;
}
export declare const RULES: Record<string, Rule>;
export declare const DEFAULT_NOINDEX: string[];
export declare const SITE_OPTIONS: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>;
export declare const SITE_HELP: string;
export declare function check(dir: string, opts?: IndexOptions, config?: Record<string, unknown>, configFile?: string): Report;
export declare function analyze(site: unknown, opts?: IndexOptions, config?: Record<string, unknown>): { findings: Report['findings']; info: Record<string, unknown>; summary: string };
export declare function summarise(directives: { directives: string[] }[]): { noindex: boolean; nofollow: boolean; index: boolean; follow: boolean; all: string[] };
