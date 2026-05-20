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
      headId: null,
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

  it("hides the restore button on the current head version but keeps the view link", async function () {
    const ctime = new Date("2024-06-15T10:00:00Z");
    const older = new Date("2024-06-15T09:00:00Z");
    const days = [{
      id: "day-0",
      index: 0,
      date: ctime,
      buckets: [
        {
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
        },
        {
          id: "day-0-b1",
          entries: [{ id: 98, name: "scene.svx.json", generation: 4, size: 100, mime: "application/json", author: "alice", author_id: 1, ctime: older, changeKind: "modified" as const }],
          isSingle: true,
          restorePoint: 98,
          from: older,
          to: older,
          hasRange: false,
          authors: ["alice"],
          names: [{ name: "scene.svx.json", count: 1, changeKind: "modified" as const }],
          extraNamesCount: 0,
        },
      ],
    }];
    const html = await t.render("scene/history.hbs", makeContext({ canAdmin: true, headId: 99, days }));
    // the head version (id 99) has its view link but no restore button
    expect(html).to.contain('href="history/99/view"');
    // an earlier same-day entry (id 98) is still restorable
    expect(html).to.contain('href="history/98/view"');
    expect(html).to.match(/<input type="hidden" name="id" value="98">/);
    expect(html).not.to.match(/<input type="hidden" name="id" value="99">/);
  });

  it("includes a pager partial", async function () {
    const html = await t.render("scene/history.hbs", makeContext({
      pager: { from: 25, to: 50, total: 100, next: "/ui/scenes/test-scene/history?offset=50&limit=25", previous: "/ui/scenes/test-scene/history?offset=0&limit=25" },
    }));
    expect(html).to.match(/href="[^"]*offset(=|&#x3D;)50[^"]*"/);
    expect(html).to.match(/href="[^"]*offset(=|&#x3D;)0[^"]*"/);
  });
});
