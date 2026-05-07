import path from "path";
import { fileURLToPath } from "url";

import Templates from "../../utils/templates/index.js";

const templatesDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("scene/history.hbs", function () {
  let t: Templates;
  this.beforeAll(function () {
    t = new Templates({ dir: templatesDir, cache: false });
  });

  function makeContext(overrides: any = {}) {
    return {
      lang: "cimode",
      layout: null,
      scene: { name: "test-scene" },
      name: "test-scene",
      canAdmin: false,
      pager: { from: 0, to: 0, total: 0 },
      limit: 25,
      offset: 0,
      isFirstPage: true,
      days: [],
      config: { build_ref: "test" },
      ...overrides,
    };
  }

  it("renders an empty history", async function () {
    const html = await t.render("scene/history.hbs", makeContext());
    expect(html).to.contain('class="history-list"');
    expect(html).to.contain("leads.noResults");
  });

  it("renders one day with one entry", async function () {
    const ctime = new Date("2024-06-15T10:00:00Z");
    const days = [{
      id: "day-0",
      index: 0,
      date: ctime,
      isLatest: true,
      buckets: [{
        id: "day-0-b0",
        entries: [{ id: 42, name: "scene.svx.json", generation: 2, size: 100, mime: "application/json", author: "alice", author_id: 1, ctime, changeKind: "modified" }],
        isSingle: true,
        restorePoint: 42,
        from: ctime,
        to: ctime,
        hasRange: false,
        authors: ["alice"],
        names: [{ name: "scene.svx.json", count: 1, changeKind: "modified" }],
        extraNamesCount: 0,
      }],
    }];
    const html = await t.render("scene/history.hbs", makeContext({ days }));
    expect(html).to.contain('data-entry-id="42"');
    expect(html).to.contain("scene.svx.json");
    expect(html).to.contain('href="history/42/view"');
  });

  it("renders multi-entry buckets with a collapsible details element", async function () {
    const ctime = new Date("2024-06-15T10:00:00Z");
    const entries = [
      { id: 3, name: "a.html", generation: 1, size: 10, mime: "text/html", author: "alice", author_id: 1, ctime, changeKind: "created" as const },
      { id: 2, name: "b.html", generation: 1, size: 10, mime: "text/html", author: "alice", author_id: 1, ctime, changeKind: "created" as const },
      { id: 1, name: "c.html", generation: 1, size: 10, mime: "text/html", author: "bob",  author_id: 2, ctime, changeKind: "created" as const },
      { id: 0, name: "d.html", generation: 1, size: 10, mime: "text/html", author: "bob",  author_id: 2, ctime, changeKind: "created" as const },
    ];
    const days = [{
      id: "day-0",
      index: 0,
      date: ctime,
      isLatest: false,
      buckets: [{
        id: "day-0-b0",
        entries,
        isSingle: false,
        restorePoint: 3,
        from: ctime,
        to: ctime,
        hasRange: false,
        authors: ["alice", "bob"],
        names: entries.map(e => ({ name: e.name, count: 1, changeKind: "created" as const })),
        extraNamesCount: 1,
      }],
    }];
    const html = await t.render("scene/history.hbs", makeContext({ canAdmin: true, days }));
    expect(html).to.contain('class="history-bucket"');
    expect(html).to.contain('details class="history-bucket-details"');
    expect(html).to.contain('history-restore-form');
    // entries inside the bucket
    expect(html).to.contain('data-entry-id="3"');
    expect(html).to.contain('data-entry-id="0"');
  });

  it("hides the restore button on the latest day but keeps the view link", async function () {
    const ctime = new Date("2024-06-15T10:00:00Z");
    const days = [{
      id: "day-0",
      index: 0,
      date: ctime,
      isLatest: true,
      buckets: [{
        id: "day-0-b0",
        entries: [{ id: 99, name: "scene.svx.json", generation: 5, size: 100, mime: "application/json", author: "alice", author_id: 1, ctime, changeKind: "modified" as const }],
        isSingle: true,
        restorePoint: 99,
        from: ctime,
        to: ctime,
        hasRange: false,
        authors: ["alice"],
        names: [{ name: "scene.svx.json", count: 1, changeKind: "modified" as const }],
        extraNamesCount: 0,
      }],
    }];
    const html = await t.render("scene/history.hbs", makeContext({ canAdmin: true, days }));
    // disabled restore button on the latest-day entry
    expect(html).not.to.match(/<button[^>]+btn-rollback\b/);
    // the view link is still rendered
    expect(html).to.contain('href="history/99/view"');
  });

  it("includes a pager partial", async function () {
    const html = await t.render("scene/history.hbs", makeContext({
      pager: { from: 25, to: 50, total: 100, next: "/ui/scenes/test-scene/history?offset=50&limit=25", previous: "/ui/scenes/test-scene/history?offset=0&limit=25" },
    }));
    expect(html).to.match(/href="[^"]*offset(=|&#x3D;)50[^"]*"/);
    expect(html).to.match(/href="[^"]*offset(=|&#x3D;)0[^"]*"/);
  });
});
