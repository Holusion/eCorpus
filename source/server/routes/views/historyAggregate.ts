import type { HistoryEntry } from "../../vfs/types.js";

/**
 * Entry as it reaches the template, with `ctime` already a Date and a few
 * pre-computed display fields so the .hbs file stays simple.
 */
export interface DisplayEntry {
  id: number;
  name: string;
  generation: number;
  size: number;
  mime: string;
  author: string;
  author_id: number | null;
  ctime: Date;
  /** "created" | "modified" | "deleted" — derived from generation/size */
  changeKind: "created" | "modified" | "deleted";
}

/**
 * A "bucket" is a group of nearby entries presented as a single row.
 * Single-entry buckets are rendered as a leaf with an expandable diff view.
 */
export interface DisplayBucket {
  /** stable, unique within the page; used for DOM ids and aria links */
  id: string;
  entries: DisplayEntry[];
  /** True when the bucket holds exactly one entry — template branches on it */
  isSingle: boolean;
  /** entry id we'd restore to (= newest entry in the bucket) */
  restorePoint: number;
  from: Date;
  to: Date;
  /** True when from and to fall on different timestamps */
  hasRange: boolean;
  /** distinct authors, in newest-first order */
  authors: string[];
  /** Up to 3 distinct file names, with their bucket-local change summary */
  names: { name: string; count: number; changeKind: DisplayEntry["changeKind"] }[];
  /** Distinct names beyond the first 3 (length === totalNames - names.length) */
  extraNamesCount: number;
}

export interface DisplayDay {
  /** stable id, e.g. "day-0" */
  id: string;
  index: number;
  date: Date;
  /** True for the latest day — restore actions are disabled there */
  isLatest: boolean;
  buckets: DisplayBucket[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Base bucket duration (~5s). Doubled until we get at most 4 buckets per day. */
const BASE_DURATION_MS = DAY_MS / 16384;

/**
 * Slice an array of entries (newest first) into 1..4 buckets.
 * Adapted from the previous lit component bucketize() so the server now owns
 * the aggregation logic.
 */
function bucketize(entries: DisplayEntry[], duration = BASE_DURATION_MS): DisplayEntry[][] {
  if (DAY_MS < duration) throw new Error("Bucket duration too long; aggregation diverged");
  if (entries.length <= 3) return entries.map(e => [e]);

  const buckets: DisplayEntry[][] = [];
  let current: DisplayEntry[] | null = null;
  let bucketEnd = 0;
  for (const e of entries) {
    if (!current || e.ctime.valueOf() + duration < bucketEnd) {
      bucketEnd = e.ctime.valueOf();
      current = [e];
      buckets.push(current);
    } else {
      current.push(e);
    }
  }
  if (4 < buckets.length) return bucketize(entries, duration * 2);
  if (buckets.length === 1) {
    const sep = Math.floor(entries.length / 2);
    return [entries.slice(0, sep), entries.slice(sep)];
  }
  return buckets;
}

function changeKindOf(entry: HistoryEntry): DisplayEntry["changeKind"] {
  if (entry.generation === 1) return "created";
  if (entry.size === 0) return "deleted";
  return "modified";
}

function toDisplayEntry(entry: HistoryEntry): DisplayEntry {
  return {
    id: entry.id,
    name: entry.name,
    generation: entry.generation,
    size: entry.size,
    mime: entry.mime,
    author: entry.author,
    author_id: entry.author_id,
    ctime: entry.ctime instanceof Date ? entry.ctime : new Date(entry.ctime as any),
    changeKind: changeKindOf(entry),
  };
}

function summarizeBucket(entries: DisplayEntry[], id: string): DisplayBucket {
  const names = new Map<string, { count: number; changeKind: DisplayEntry["changeKind"] }>();
  const authors: string[] = [];
  for (const e of entries) {
    const slot = names.get(e.name);
    if (slot) slot.count += 1;
    else names.set(e.name, { count: 1, changeKind: e.changeKind });
    if (!authors.includes(e.author)) authors.push(e.author);
  }
  const namesList = [...names.entries()].map(([name, info]) => ({ name, ...info }));
  const from = entries[entries.length - 1].ctime;
  const to = entries[0].ctime;
  return {
    id,
    entries,
    isSingle: entries.length === 1,
    restorePoint: entries[0].id,
    from,
    to,
    hasRange: from.valueOf() !== to.valueOf(),
    authors,
    names: namesList.slice(0, 3),
    extraNamesCount: Math.max(0, namesList.length - 3),
  };
}

/**
 * Group history entries (newest first) by calendar day, then aggregate each
 * day into 1..4 buckets ready to be displayed by the .hbs template.
 */
export function aggregateHistory(rawEntries: HistoryEntry[]): DisplayDay[] {
  const entries = rawEntries.map(toDisplayEntry);
  const dayLists: { startOfDay: number; entries: DisplayEntry[] }[] = [];

  for (const e of entries) {
    const last = dayLists[dayLists.length - 1];
    if (!last || e.ctime.valueOf() < last.startOfDay) {
      const startOfDay = new Date(e.ctime).setHours(0, 0, 0, 0);
      dayLists.push({ startOfDay, entries: [e] });
    } else {
      last.entries.push(e);
    }
  }

  return dayLists.map((d, index) => {
    const id = `day-${index}`;
    return {
      id,
      index,
      date: new Date(d.startOfDay),
      isLatest: index === 0,
      buckets: bucketize(d.entries).map((bucket, i) => summarizeBucket(bucket, `${id}-b${i}`)),
    };
  });
}
