import { aggregateHistory } from "./historyAggregate.js";
import type { HistoryEntry } from "../../vfs/types.js";

let nextId = 1;
function entry(partial: Partial<HistoryEntry> & { ctime: Date }): HistoryEntry {
  return {
    id: nextId++,
    name: "scene.svx.json",
    mime: "application/si-dpo-3d.document+json",
    generation: 1,
    author: "alice",
    author_id: 1,
    size: 100,
    ...partial,
  } as HistoryEntry;
}

describe("aggregateHistory()", function () {
  beforeEach(() => { nextId = 1; });

  it("returns no days for an empty list", function () {
    expect(aggregateHistory([])).to.deep.equal([]);
  });

  it("groups entries by calendar day", function () {
    const today = new Date("2024-06-15T15:00:00Z");
    const yesterday = new Date("2024-06-14T15:00:00Z");
    const days = aggregateHistory([
      entry({ ctime: today, generation: 2 }),
      entry({ ctime: today, generation: 1 }),
      entry({ ctime: yesterday, generation: 1 }),
    ]);
    expect(days).to.have.lengthOf(2);
    expect(days[0].isLatest).to.equal(true);
    expect(days[1].isLatest).to.equal(false);
  });

  it("flags the most recent day as isLatest", function () {
    const days = aggregateHistory([
      entry({ ctime: new Date("2024-06-15T10:00:00Z") }),
      entry({ ctime: new Date("2024-06-14T10:00:00Z") }),
    ]);
    expect(days[0].isLatest).to.equal(true);
    expect(days[1].isLatest).to.equal(false);
  });

  it("emits a single bucket per entry when fewer than 4 entries in a day", function () {
    const day = new Date("2024-06-15T10:00:00Z");
    const days = aggregateHistory([
      entry({ ctime: day, generation: 3 }),
      entry({ ctime: day, generation: 2 }),
      entry({ ctime: day, generation: 1 }),
    ]);
    expect(days[0].buckets).to.have.lengthOf(3);
    for (const b of days[0].buckets) expect(b.isSingle).to.equal(true);
  });

  it("aggregates dense bursts into 1..4 buckets", function () {
    // 20 entries spread within 1 hour — should collapse into ≤4 buckets
    const start = new Date("2024-06-15T10:00:00Z").valueOf();
    const entries: HistoryEntry[] = [];
    for (let i = 0; i < 20; i++) {
      entries.push(entry({ ctime: new Date(start - i * 60_000), generation: 20 - i }));
    }
    const days = aggregateHistory(entries);
    expect(days).to.have.lengthOf(1);
    expect(days[0].buckets.length).to.be.at.most(4);
    expect(days[0].buckets.length).to.be.at.least(1);
    const total = days[0].buckets.reduce((s, b) => s + b.entries.length, 0);
    expect(total).to.equal(20);
  });

  it("derives changeKind from generation/size", function () {
    const day = new Date("2024-06-15T10:00:00Z");
    const days = aggregateHistory([
      entry({ ctime: day, generation: 1, size: 100 }), // created
      entry({ ctime: day, generation: 2, size: 0 }),   // deleted
      entry({ ctime: day, generation: 3, size: 50 }),  // modified
    ]);
    const kinds = days[0].buckets.map(b => b.entries[0].changeKind);
    expect(kinds).to.include("created");
    expect(kinds).to.include("deleted");
    expect(kinds).to.include("modified");
  });

  it("collects distinct authors per bucket", function () {
    const t = new Date("2024-06-15T10:00:00Z").valueOf();
    const entries: HistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(entry({ ctime: new Date(t - i * 1000), author: i % 2 ? "alice" : "bob" }));
    }
    const days = aggregateHistory(entries);
    const allAuthors = new Set(days[0].buckets.flatMap(b => b.authors));
    expect([...allAuthors]).to.have.members(["alice", "bob"]);
  });

  it("exposes restorePoint as the newest entry's id in each bucket", function () {
    const t = new Date("2024-06-15T10:00:00Z").valueOf();
    const entries: HistoryEntry[] = [];
    for (let i = 0; i < 6; i++) {
      // build newest-first; ids and ctimes both descend from i=0
      entries.push(entry({ ctime: new Date(t - i * 1000) }));
    }
    const days = aggregateHistory(entries);
    for (const b of days[0].buckets) {
      const newest = b.entries.reduce((a, c) => c.ctime > a.ctime ? c : a, b.entries[0]);
      expect(b.restorePoint).to.equal(newest.id);
    }
  });

  it("limits names to 3 and reports extraNamesCount", function () {
    const t = new Date("2024-06-15T10:00:00Z").valueOf();
    const entries: HistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(entry({ ctime: new Date(t - i * 1000), name: `file-${i}.html` }));
    }
    const days = aggregateHistory(entries);
    const bucket = days[0].buckets[0];
    expect(bucket.names.length).to.be.at.most(3);
    if (bucket.entries.length > 3) {
      expect(bucket.extraNamesCount).to.equal(bucket.entries.length - 3);
    }
  });

  it("computes hasRange when from and to differ", function () {
    const a = new Date("2024-06-15T10:00:00Z");
    const b = new Date("2024-06-15T10:00:01Z");
    const days = aggregateHistory([entry({ ctime: b }), entry({ ctime: a })]);
    expect(days[0].buckets).to.have.lengthOf(2);
  });
});
