# Design: Server-managed 3D assets

> Status: **draft / request for comments**
> Scope: server-side data model, processing pipeline and the HTTP contract Voyager will consume.
> Out of scope: the Voyager-side implementation.

## 1. Goals

For every 3D file a user uploads, eCorpus surfaces to Voyager a **derived glTF** that:

1. **Exists almost immediately**, even if it's only a rough placeholder.
2. **Is mutable**: it gets refined (progressively or in one go) as processing goes on, which may take 30s to several hours.
3. **Can be re-derived**: the user may change the transformation parameters afterwards, which produces a new output.
4. **Comes from a normalized source**, never from the raw upload: on ingestion, the upload is converted as losslessly as possible into a glTF with external resources (the *master*). All later processing starts from the master.

The server has to tell Voyager what is available and when it changes, in a way that a server-unaware Voyager (or a static export of the scene) still works.

### Non-goals (for this phase)

- Writing the Voyager integration.
- Choosing every converter for every input format. We only need the contract a converter has to fulfil.
- Distributed / multi-node processing. The design should not rule it out, though.

## 2. What exists today

Relevant parts of the current server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. `current_files` gives the latest generation. History and restore come from this. |
| Tasks | `tasks/scheduler.ts`, `tasks/manager.ts`, `migrations/005-tasks.sql` | Tasks persisted in DB with parent/child tree, logs, in-process queue (concurrency 4), per-task workspace in `artifacts/<task_id>/`. |
| Upload pipeline | `tasks/handlers/uploads.ts` | `parseUserUpload` → `createSceneFromFiles`. OBJ is converted with `toGlb`, then optionally `optimizeGlb` with a single `High` preset. The result is copied to `models/<name>.glb` and referenced in a freshly generated `scene.svx.json`. |
| Optimization | `tasks/handlers/optimizeGlb.ts` | gltf-transform pipeline (flatten/join/weld/simplify/meshopt/KTX2) driven by `TDerivativeQuality` presets (`Thumb`…`Highest`, `AR`). |
| File serving | `routes/scenes/scene/files/get/file.ts` | Strong `ETag` = blob hash, `Range` / `If-Range` support. |
| Voyager document | `utils/schema/model.d.ts` | A model has `derivatives[]`, each with `usage`, `quality` and `assets[]` (`uri`, `byteSize`, `numFaces`…). Voyager picks a derivative by quality and can load progressively from `Thumb` to `High`. |

Things that are **not** there:

- No notion of a source file distinct from the file served to Voyager. Once a model is optimized, the upload is gone (`cleanTaskArtifacts`) and there is nothing to re-derive from.
- No way to push changes to clients. Nothing streams events over HTTP, and there's no internal event bus.
- Tasks can't outlive the process: `TaskScheduler.reapOrphans()` marks every `pending`/`running` task as failed on startup, and the watchdog (`task_timeout_seconds`, default 3600) aborts anything longer than an hour.

## 3. Concepts

```
 upload ──ingest──▶ Master ──derive(recipe)──▶ Derivation ──produces──▶ Revision 1 (placeholder)
 (transient)        (immutable,               (master + params,         Revision 2 (partial)
                     glTF + external           has a status)             Revision 3 (final)
                     resources)                       ▲                        │
                                                      │                        ▼
                                         Binding: scene file path ──▶ what Voyager fetches
                                         (e.g. models/statue.glb)
```

- **Upload**: the bytes the user sent. Transient. Deleted once ingestion succeeds (with a configurable grace period, see §8).
- **Master**: the canonical, normalized representation of the upload. A `.gltf` JSON file plus external resources (`.bin` buffers, original image files). Immutable. Content-addressed, so re-uploading the same file gives the same master.
- **Recipe**: the transformation parameters (target quality, decimation ratio, texture size, compression, maybe alignment/orientation). A JSON value with a schema and a version. `TDerivativeQuality` presets become named recipes.
- **Derivation**: `(master, recipe)`. A processing job with a lifecycle (`queued → processing → ready | failed`) that emits a series of revisions.
- **Revision**: one concrete output file (a `.glb`) of a derivation. Each revision has a `level` describing how refined it is (`placeholder`, `partial`, `final`). Revisions only accumulate: they are never edited in place.
- **Binding**: links a file path in a scene (`models/statue.glb`) to a derivation. Changing the recipe creates a **new derivation** and rebinds the path. The old derivation stays around for history and rollback.

The **asset**, as the user sees it, is the binding: "the statue model in this scene". Its content changes over time as revisions land and as recipes change.

### Why split master and derivation

- Re-deriving never touches the upload or depends on the converter that read it.
- Masters can be shared: the same upload in two scenes, or two recipes on one master, is stored once.
- Masters can be reprocessed later with better tools, without asking users to upload again.

## 4. Storage model

### 4.1 Masters

A master is a small set of blobs. All of them live in the existing `objects/` store, so deduplication and cleanup work the same way they do for files.

```sql
CREATE TABLE asset_masters (
  master_id   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- hash of the canonical manifest (sorted resources + gltf hash): identity of the master
  digest      VARCHAR(43) NOT NULL UNIQUE,
  gltf_hash   VARCHAR(43) NOT NULL,        -- the .gltf JSON, with resource URIs relative to the master root
  source_name TEXT NOT NULL,               -- original upload file name
  source_mime TEXT NOT NULL,
  source_hash VARCHAR(43),                 -- hash of the original upload, kept for traceability even after deletion
  converter   TEXT NOT NULL,               -- e.g. "gltf-transform@4.x", "obj2gltf@3.x"
  stats       JSONB NOT NULL DEFAULT '{}', -- numFaces, numVertices, bounds, imageSize, extensions…
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE asset_master_resources (
  fk_master_id BIGINT NOT NULL REFERENCES asset_masters(master_id) ON DELETE CASCADE,
  uri          TEXT NOT NULL,      -- as written in the .gltf ("buffers/0.bin", "textures/albedo.jpg")
  hash         VARCHAR(43) NOT NULL,
  size         BIGINT NOT NULL,
  mime         TEXT NOT NULL,
  PRIMARY KEY (fk_master_id, uri)
);
```

Masters aren't scoped to a scene. Access control comes from bindings: if you can read a scene that binds a derivation of a master, you can read that master. Masters with no remaining derivation are collected by cleanup.

### 4.2 Derivations and revisions

```sql
CREATE TYPE derivation_status AS ENUM ('queued', 'processing', 'ready', 'failed', 'cancelled');
CREATE TYPE revision_level    AS ENUM ('placeholder', 'partial', 'final');

CREATE TABLE asset_derivations (
  derivation_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_master_id  BIGINT NOT NULL REFERENCES asset_masters(master_id),
  recipe        JSONB NOT NULL,
  recipe_digest VARCHAR(43) NOT NULL,      -- hash of the canonicalized recipe
  status        derivation_status NOT NULL DEFAULT 'queued',
  progress      REAL,                      -- 0..1, best effort
  fk_task_id    BIGINT REFERENCES tasks(task_id) ON DELETE SET NULL,
  error         JSON,
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mtime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fk_master_id, recipe_digest)     -- same master + same recipe = same derivation
);

CREATE TABLE asset_revisions (
  revision_id   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_derivation_id BIGINT NOT NULL REFERENCES asset_derivations(derivation_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,          -- 1, 2, 3… within a derivation
  level         revision_level NOT NULL,
  hash          VARCHAR(43) NOT NULL,      -- .glb blob in objects/
  size          BIGINT NOT NULL,
  stats         JSONB NOT NULL DEFAULT '{}', -- numFaces, imageSize, bounds (feeds IAsset fields)
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fk_derivation_id, seq)
);
```

The `UNIQUE(master, recipe_digest)` constraint makes derivation idempotent. Switching a recipe back to a previous value finds the old derivation and its revisions. Nothing is recomputed.

### 4.3 Bindings: materialize revisions as file generations (recommended)

There are two ways to make a revision visible at `scenes/<scene>/models/statue.glb`.

**Option A: materialize (recommended).** Each new revision of the bound derivation is written as a **new generation of the file** in the `files` table, pointing at the revision's blob. A side table records the binding:

```sql
CREATE TABLE asset_bindings (
  fk_scene_id      BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,          -- file path in the scene
  fk_derivation_id BIGINT NOT NULL REFERENCES asset_derivations(derivation_id),
  ctime            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, name)
);
-- plus a nullable files.fk_revision_id so every generation knows where it came from
```

Pros:
- Every existing consumer (file GET, WebDAV, zip export, history, restore, ETag/Range, cleanup) keeps working as-is.
- History shows refinements and recipe changes like any other file change. Restoring an old generation restores that revision.
- A static export of the scene still contains a valid, self-sufficient `.glb`.

Cons:
- History gets more entries: one per revision. Placeholder/partial generations can be authored by "system" and collapsed in the history UI.
- A manual `PUT` on a bound path has to **detach** the binding. That's easy to detect: the new generation has no `fk_revision_id`.

**Option B: virtual files.** The path resolves to the latest revision at read time, and nothing is written to `files`. That saves rows, but every route that reads `files` (export, WebDAV PROPFIND, history, cleanup reachability) has to learn about it. Not worth it for now.

### 4.4 The Voyager document

The server **does not rewrite `scene.svx.json`** when revisions land. The document is user content: it's versioned and edited concurrently. Writing to it from background jobs would compete with editors. That's why `structuredDocMerge` exists, and we shouldn't make it a hot path.

The document references the stable path (`models/statue.glb`) as it does today. The only time the server writes the document is when it creates it (scene creation) or when the user explicitly attaches a new asset. Stats in `IAsset` (`byteSize`, `numFaces`…) may go stale between revisions. Voyager only uses them as hints, and the asset manifest (§6.2) has the live values.

Voyager's own `derivatives[]` (Thumb/Low/High…) is orthogonal and stays available. A later phase could bind one path per quality (`statue-low.glb`, `statue-high.glb`), each to its own derivation, and list them as separate derivatives. Nothing in this design blocks that.

## 5. Processing pipeline

```
upload task ──▶ ingest(upload) ──▶ master
                                      │
          bind(scene, path, recipe) ──┴──▶ derivation (queued)
                                              │
                         ┌────────────────────┼─────────────────────┐
                         ▼                    ▼                     ▼
                 placeholder (fast)     partial (optional)     final (slow)
                 seq=1, ~seconds        seq=2..n               seq=n+1
                         │                    │                     │
                         └─────── each one: write blob ▶ insert revision
                                  ▶ new file generation on every bound path ▶ emit event
```

### 5.1 Ingestion (upload → master)

One converter per input family, all with the same contract:

```ts
interface Ingestor {
  accepts(mime: string, magic: Buffer): boolean;
  /** writes a .gltf + resources into `outDir`, returns stats and any loss warnings */
  ingest(input: string, outDir: string, ctx: TaskHandlerContext): Promise<IngestResult>;
}
interface IngestResult {
  gltf: string;               // path of the .gltf in outDir
  warnings: string[];         // anything that was dropped or approximated
  stats: MasterStats;
}
```

Rules for "as lossless as possible":
- **Images are copied byte for byte** (no re-encoding). glb-embedded images are extracted to files.
- **Geometry is decoded**: Draco and meshopt are decompressed so the master doesn't depend on decoders. Quantization that's already baked in is kept, not "restored".
- **Unknown glTF extensions are kept**: read with the full gltf-transform extension set, and for unregistered extensions, write the JSON through unchanged. If that isn't possible, report a `warning` rather than failing silently.
- Units/orientation are normalized to glTF conventions (meters, +Y up), and the original values are recorded in `stats`.

Initial coverage: `glb`/`gltf` (gltf-transform), `obj` (obj2gltf, non-binary mode). Each new format (`fbx`, `ply`, `stl`, `usdz`, `e57`/`las` point clouds…) only means adding an ingestor.

### 5.2 Derivation

A derivation is a long-running job that calls `emit(revision)` zero or more times before it finishes. Suggested default strategy:

1. **Placeholder**, target < 30 s regardless of input size. Aggressive simplification plus small textures (roughly today's `Thumb` preset). If even that is too slow for huge inputs, fall back to a bounding-box or point-sampled proxy built from the master's `stats`.
2. **Final**, the actual recipe (today's `optimizeGlb` presets).
3. **Partial** revisions are optional and decided by the processor. Examples: geometry done but textures still raw, or one LOD out of several.

Each `emit` is a short transaction: insert the revision, insert a new `files` generation for every binding on this derivation, then notify (§6.3).

### 5.3 Changing the recipe

`PATCH` the binding with a new recipe:
1. Look up or create the derivation for `(master, new recipe)`.
2. Rebind the path. If the derivation already has revisions, write a file generation with the latest one right away. Otherwise keep serving the current file until the new derivation's first revision lands. The user never sees a hole.
3. If the previous derivation is still processing and nothing else binds it, cancel it (`AbortSignal`, which tasks already support).

## 6. Contract with Voyager

Design principles:
- **Plain HTTP works without any of this.** A server-unaware Voyager GETs `models/statue.glb` and gets the latest revision. The rest is progressive enhancement.
- **Discovery comes from the resource itself**, not from changes to the svx schema.
- **The same information is available by push (events) and by pull (manifest).**

### 6.1 Serving the model file

`GET /scenes/:scene/models/statue.glb`, unchanged, plus:

```
ETag: "<blob hash>"
Cache-Control: no-cache                      # mutable: always revalidate (cheap 304s)
Link: </scenes/:scene/assets/models/statue.glb>; rel="describedby"; type="application/json"
X-Asset-Level: placeholder                    # placeholder | partial | final
X-Asset-Status: processing                    # queued | processing | ready | failed
```

Bound files also get immutable, content-addressed URLs, which help with CDN caching and avoid race conditions while a model loads:

```
GET /scenes/:scene/assets/models/statue.glb/revisions/:seq
Cache-Control: public, max-age=31536000, immutable
```

### 6.2 Asset manifest (pull)

`GET /scenes/:scene/assets/` lists every bound asset in the scene. `GET /scenes/:scene/assets/<path>` returns one:

```jsonc
{
  "path": "models/statue.glb",
  "status": "processing",          // derivation status
  "progress": 0.42,
  "recipe": { "preset": "High" },
  "current": {                      // revision currently materialized at `path`
    "seq": 1, "level": "placeholder",
    "hash": "…", "size": 123456,
    "numFaces": 2000, "imageSize": 512,
    "bounds": { "min": [...], "max": [...] },
    "href": "/scenes/foo/assets/models/statue.glb/revisions/1"
  },
  "expected": ["placeholder", "final"],   // levels the processor plans to emit, if known
  "master": { "source_name": "statue.obj", "warnings": [] },
  "events": "/scenes/foo/events"
}
```

The manifest supports `ETag`/`If-None-Match`, so polling it is cheap when push isn't available.

### 6.3 Change notifications (push)

`GET /scenes/:scene/events` returns `text/event-stream` (Server-Sent Events).

Why SSE rather than WebSockets: one-way traffic is all we need, it goes through ordinary HTTP auth/cookies and reverse proxies, the browser has `EventSource` built in, and `Last-Event-ID` gives resume after reconnecting for free.

```
id: 1832
event: asset
data: {"path":"models/statue.glb","status":"processing","progress":0.42}

id: 1833
event: asset
data: {"path":"models/statue.glb","status":"ready","revision":{"seq":2,"level":"final","hash":"…","href":"…/revisions/2"}}
```

Event types (this phase only needs `asset`, but the stream is per scene and could carry others later, such as `document` saved by another user):
- `asset`: status/progress change, or a new revision on a bound path.
- `asset-removed`: binding detached or file deleted.

Voyager behavior (informative only): on `asset` with a new `revision`, fetch the `href` (immutable URL) and swap the model. Annotations and transforms belong to the svx model, not to the glb, so they carry over.

The stream needs:
- `X-Accel-Buffering: no`, and compression disabled on this route.
- A heartbeat comment every ~25 s.
- Access checked at connect time: read access on the scene, same as `GET` on files.
- Event ids that stay monotonic across restarts, backed by a DB sequence, with a bounded replay window. If a client's `Last-Event-ID` is too old, the server sends a `reset` event and the client re-reads the manifest.

## 7. Missing building blocks

Ordered roughly by dependency. Each is needed before or along with the first implementation.

| # | Building block | Why | Notes |
|---|---|---|---|
| 1 | **Durable, resumable jobs** | Derivations run for hours and must survive restarts. Today `reapOrphans()` fails every in-flight task on boot, and the watchdog kills anything past `task_timeout_seconds` (1h). | Simplest version: on boot, re-queue derivations that are `queued`/`processing` instead of failing them (revisions already emitted are kept, so the restarted job can skip the placeholder). Exempt derivation jobs from the global watchdog or give them their own budget. Use separate queues/priorities so a multi-hour job doesn't block placeholders or uploads (today: one root queue, concurrency 4). |
| 2 | **Event bus** | Something has to connect "revision inserted" (in a task) to "SSE clients" (in HTTP handlers). Neither exists. | Postgres `LISTEN/NOTIFY` (payload = event id) plus an `events` table for replay. Works with one process today and keeps working with several processes or external workers later. |
| 3 | **SSE endpoint infrastructure** | No streaming route exists today. | Auth, heartbeats, back-pressure, connection limits per user/scene, proxy config (nginx buffering, timeouts) documented for deployments. |
| 4 | **Master format and ingestors** | No master concept exists. The current pipeline writes the optimized output and throws the source away. | Canonical writer (gltf-transform `.gltf` + external resources), extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings. Port `toGlb`/`objToGlb` to the ingestor contract. |
| 5 | **Multi-blob objects** | A master is many blobs referenced by one manifest. Cleanup (`cleanLooseObjects`) only knows about blobs referenced by `files.hash`. | Teach reachability about `asset_master_resources.hash`, `asset_masters.gltf_hash` and `asset_revisions.hash`. |
| 6 | **Recipe schema and versioning** | Recipes need to be validated and canonicalized (for `recipe_digest`), and must stay meaningful when the optimizer changes. | JSON schema; include a `version` field. Decide whether an optimizer upgrade invalidates existing derivations (probably not automatically). |
| 7 | **Progress reporting from tasks** | `progress` and `X-Asset-Status` need data. Tasks only log text today. | A `context.progress(fraction)` hook on the task context, throttled, written to the derivation row and published as an event. |
| 8 | **Binding-aware file writes** | Detach a binding on manual `PUT`/`MOVE`/`DELETE` of a bound path. Move the binding with renames. | Hook in `vfs/Files.ts` or a DB trigger on `files` insert (`fk_revision_id IS NULL` → delete binding). |
| 9 | **Placeholder generator** | Has to be fast on arbitrarily large inputs, unlike today's `Thumb` preset, which still loads and processes the whole mesh. | Can start with `Thumb` and refine later (streamed sampling, bounding-box proxy). |
| 10 | **"System" authorship in history** | Revision generations shouldn't look like user edits. | `fk_author_id = NULL` already exists. The history UI needs to label and collapse those generations. |
| 11 | **Upload grace period** | Ingestion may be lossy for some formats. Deleting the upload immediately makes a bad conversion unrecoverable. | Keep the upload blob (`asset_masters.source_hash`) for N days, configurable, then let cleanup drop it. |

Not strictly required for a first version, but worth deciding early:
- **External workers**: heavy optimization on dedicated machines. Building blocks 1 and 2 (a DB-backed queue plus NOTIFY) make that a deployment choice rather than a redesign.
- **Quotas**: masters plus every revision of every recipe is a lot of storage. Cleanup policy: keep the final revision of each derivation, drop placeholder/partial revisions of finished derivations once nothing references them in `files` history (or after a delay).

## 8. Open questions

1. **Output format**: `.glb` (single file, what `optimizeGlb` produces today, simplest to cache and swap) or `.gltf` with external resources (allows partial updates, e.g. textures only)? This document assumes `.glb` for outputs and `.gltf` + resources for masters.
2. **History noise vs. fidelity**: should placeholder/partial revisions become file generations at all, or only the `final` one, with earlier ones served only through the revision URLs while processing? Materializing everything is simpler and more faithful. The alternative keeps history clean.
3. **Scope of masters**: global deduplication (as proposed) vs. per-scene. Global saves storage but means access control must always go through bindings. That needs a careful audit of the `/assets` routes.
4. **Multiple outputs per upload**: one binding = one output, as proposed. Or should one upload map to a *set* of outputs (all Voyager qualities, AR/USDZ) bound together?
5. **Recipe ownership**: who can change the recipe? Write access on the scene seems natural, but because derivations are shared, two scenes binding the same derivation must never affect each other. They don't: rebinding creates or looks up a separate derivation.
6. **Non-model uploads**: should images (for articles, textures) go through the same master/derivation pipeline (e.g. responsive variants), or does it stay models-only for now?
7. **Upload retention**: what grace period, and should admins be able to "pin" uploads permanently?

## 9. Suggested phasing

1. **Foundations**: durable jobs (1), event bus + SSE (2, 3), progress hook (7). Useful on their own, e.g. for live upload/task status in the UI.
2. **Masters**: tables, ingestors for glb/gltf/obj, cleanup reachability (4, 5, 11). New uploads produce a master next to today's output.
3. **Derivations and bindings**: tables, placeholder + final strategy, materialization into `files`, detach on manual writes (6, 8, 9, 10). `createSceneFromFiles` switches to bind instead of copying.
4. **HTTP contract**: response headers, manifest, revision URLs, `asset` events (§6).
5. **Voyager integration** (separate design).
