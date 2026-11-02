# Design: Server-managed 3D assets

> Status: **draft / request for comments**, revision 2
> Scope: server-side data model, processing pipeline and the HTTP contract Voyager will consume.
> Out of scope: the Voyager-side implementation.

## 1. Goals

For every 3D file a user uploads, eCorpus produces an **asset**. Voyager loads the asset's **output**, a derived glTF that:

1. **Exists almost immediately**, even if it's only a rough placeholder.
2. **Is mutable**: it gets refined (progressively or in one go) as processing goes on, which may take 30s to several hours.
3. **Can be re-derived**: the user may change the transformation parameters (the *config*) afterwards, which replaces the output.
4. **Comes from a normalized source**, never from the raw upload: on ingestion, the upload is converted as losslessly as possible into a glTF with external resources (the *master*). All later processing starts from the master.

The server has to tell Voyager what is available and when it changes.

### Decisions so far

| Question | Decision |
|---|---|
| Where assets live | In a **new top-level hierarchy (`/assets`)**, outside of `scenes`. Masters are often too large to view on the web and have nothing to do in a scene tree. Outputs are attached to the master, so they live there too. Scenes reference outputs by URL. |
| Output format | **`.gltf` with external resources** (same family as the master). |
| What gets versioned | **Master and config are versioned. Outputs are not**: an output is a function of (master version, config version, pipeline) and can always be regenerated. |
| Master deduplication | **Not forced.** Uploading a file whose source hash matches an existing master gives a warning (and an offer to reuse it), nothing more. Bytes are deduplicated anyway at the blob level. |
| One or several outputs per asset | Open (§9). The design keys outputs by a *profile* name so several can be added later. Phase 1 has a single profile, `web`. |

### Non-goals (for this phase)

- Writing the Voyager integration.
- Choosing every converter for every input format. We only need the contract a converter has to fulfil.
- Migrating existing scenes. Plain model files in `scenes/<name>/models/` keep working as they do today.

## 2. What exists today

Relevant parts of the current server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. That's the versioning pattern we can reuse for masters and configs. |
| Scene ACL | `scenes`, `users_acl`, groups | Per-scene owner / user / group access levels plus `public_access` / `default_access`. Assets need an equivalent (§6). |
| Tasks | `tasks/scheduler.ts`, `tasks/manager.ts` | Tasks persisted in DB with a parent/child tree and logs, an in-process queue (concurrency 4), and a per-task workspace in `artifacts/<task_id>/`. |
| Upload pipeline | `tasks/handlers/uploads.ts` | `parseUserUpload` → `createSceneFromFiles`. OBJ goes through `toGlb`, then optionally `optimizeGlb` with one preset. The result is copied into `scenes/<name>/models/` and the upload is dropped by `cleanTaskArtifacts`. |
| Optimization | `tasks/handlers/optimizeGlb.ts` | gltf-transform pipeline driven by `TDerivativeQuality` presets. Becomes the first output processor. |
| Scene zip export | `routes/scenes/get.ts` | Exports the files of a scene. Knows nothing about references outside the scene. |

What Voyager does today (submodule `source/voyager`, at `f7a70e6`):

- `CVAssetManager.getAssetUrl(path)` resolves each asset `uri` with `new URL(path, baseUrl)`, where `baseUrl` is the scene folder. **Root-relative (`/assets/…`) and absolute URIs already load.** The svx JSON schema also documents `uri` as "absolute URL or path relative to this document".
- `ModelReader.get(url)` loads a glTF and resolves its external resources against `LoaderUtils.extractUrlBase(url)`, which is the URL *requested*, not the URL it was redirected to. **External resources must be reachable relative to the URL written in the svx.** An HTTP redirect from a scene-local alias to `/assets/…` would load the `.gltf` and then fail on its buffers and textures.

Gaps:

- Uploads aren't kept in any normalized form, so there's nothing to re-derive from.
- No way to push changes to clients: no streaming route, no internal event bus.
- Tasks can't outlive the process. `TaskScheduler.reapOrphans()` marks every unfinished task as failed on startup, and the watchdog (`task_timeout_seconds`, default 3600) aborts anything longer than an hour.

## 3. Concepts

```
                       ┌──────────────── asset #42 ("Statue", owner, ACL) ─────────────────┐
                       │                                                                    │
 upload ──ingest──▶    │  master   v1 ── v2 ── v3   (versioned, immutable once written)     │
 (transient)           │  config   v1 ── v2         (versioned, small JSON)                 │
                       │                │                                                   │
                       │                ▼  derive(master vN, config vM)                     │
                       │  output "web"  : one slot, mutable, not versioned                  │
                       │                  state: placeholder → partial → final              │
                       └───────────────────────────┬────────────────────────────────────────┘
                                                   │ referenced by URL
                   scene A  scene.svx.json ────────┤  uri: "/assets/42/web/model.gltf"
                   scene B  scene.svx.json ────────┘
```

- **Asset**: the identity the user manages. Name, owner, ACL, and the current master and config. It lives under `/assets/:id` and is independent of any scene. Several scenes may use one asset.
- **Upload**: the bytes the user sent. Transient. Deleted after a successful ingestion, with a configurable grace period.
- **Master**: the canonical form of the upload, a `.gltf` plus external resources (`.bin` buffers, original image files). Immutable per version. A new master version comes from re-uploading or replacing the source, or from re-ingesting with a better converter.
- **Config**: the transformation parameters (target quality, decimation, texture size, compression…). A small JSON value with a schema and a `schema_version`. Each change is a new version. Today's `TDerivativeQuality` presets become named starting points.
- **Output**: what Voyager loads. One mutable slot per (asset, profile), holding the result of the current master and config. It moves from `placeholder` to `final`, and gets replaced when the master or config changes. There's no history: a past output is reproduced by re-running the pipeline on the past master and config.

### Why masters and outputs live outside scenes

- Masters are working material, too heavy for the web. Putting them in a scene's tree would show them in WebDAV, scene zip exports and the scene file list, where they don't belong.
- An output is structurally a function of its master. Keeping it next to the master means the scene only holds a reference, so the same asset can appear in several scenes without being copied.
- The scene document stays user content. Background processing never writes to `scene.svx.json`, so it never competes with editors (and `structuredDocMerge` stays off the hot path).

## 4. Storage model

All blobs (master resources, output resources) go into the existing content-addressed store, so bytes are written once however many masters reference them. That's what makes "don't force master deduplication" cheap. Masters could later move to a separate, colder volume, since nothing serves them to the web: a `masters_dir` next to `objects_dir`.

```sql
CREATE TABLE assets (
  asset_id      BIGINT PRIMARY KEY,                  -- uid(), like scenes
  name          TEXT NOT NULL,
  fk_author_id  BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived      TIMESTAMPTZ DEFAULT NULL,
  public_access SMALLINT NOT NULL DEFAULT 0,          -- same semantics as scenes (§6)
  default_access SMALLINT NOT NULL DEFAULT 1
);
-- assets_acl(fk_user_id | fk_group_id, fk_asset_id, access_level), mirroring users_acl

-- Versioned like `files`: (asset, generation), append-only.
CREATE TABLE asset_masters (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  gltf_hash    VARCHAR(43) NOT NULL,      -- the .gltf JSON; resource URIs relative to the master root
  source_name  TEXT NOT NULL,             -- original upload name
  source_mime  TEXT NOT NULL,
  source_hash  VARCHAR(43) NOT NULL,      -- hash of the upload, used for duplicate warnings and traceability
  converter    TEXT NOT NULL,             -- "gltf-transform@4.x", "obj2gltf@3.x"…
  warnings     JSONB NOT NULL DEFAULT '[]', -- anything lost or approximated during ingestion
  stats        JSONB NOT NULL DEFAULT '{}', -- faces, vertices, bounds, image sizes, extensions
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, generation)
);
CREATE INDEX asset_masters_source ON asset_masters(source_hash);   -- duplicate warning lookup

CREATE TABLE asset_master_resources (
  fk_asset_id BIGINT NOT NULL,
  generation  INTEGER NOT NULL,
  uri         TEXT NOT NULL,      -- as written in the .gltf ("buffers/0.bin", "textures/albedo.jpg")
  hash        VARCHAR(43) NOT NULL,
  size        BIGINT NOT NULL,
  mime        TEXT NOT NULL,
  PRIMARY KEY (fk_asset_id, generation, uri),
  FOREIGN KEY (fk_asset_id, generation) REFERENCES asset_masters ON DELETE CASCADE
);

CREATE TABLE asset_configs (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  profile      TEXT NOT NULL DEFAULT 'web',
  generation   INTEGER NOT NULL,
  config       JSONB NOT NULL,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, profile, generation)
);

-- Not versioned: one row per (asset, profile), overwritten in place.
CREATE TYPE output_state AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE output_level AS ENUM ('none', 'placeholder', 'partial', 'final');

CREATE TABLE asset_outputs (
  fk_asset_id       BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  profile           TEXT NOT NULL DEFAULT 'web',
  -- inputs of what is being computed now
  master_generation INTEGER NOT NULL,
  config_generation INTEGER NOT NULL,
  pipeline          TEXT NOT NULL,          -- processor name + version
  state             output_state NOT NULL DEFAULT 'queued',
  progress          REAL,
  fk_task_id        BIGINT REFERENCES tasks(task_id) ON DELETE SET NULL,
  error             JSON,
  -- what is being served now (may come from older inputs while a new run is in progress)
  level             output_level NOT NULL DEFAULT 'none',
  gltf_hash         VARCHAR(43),
  stats             JSONB NOT NULL DEFAULT '{}',
  mtime             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, profile)
);
-- asset_output_resources(fk_asset_id, profile, hash, size, mime): blobs the served .gltf references
```

Because outputs aren't versioned, there's no row per refinement. The row says what's being computed (`master_generation`, `config_generation`, `state`) and what's being served (`level`, `gltf_hash`). They differ while a new run is in progress: the previous result keeps being served until the new run emits something.

## 5. Processing pipeline

```
upload task ──▶ ingest ──▶ master vN ──┐
                                       ├──▶ run(output "web")  ──▶ emit placeholder ──▶ emit partial* ──▶ emit final
            user edits config ─▶ vM ───┘        (cancels any run      each emit: write blobs, swap the
                                                 for older inputs)    served .gltf, publish an event
```

### 5.1 Ingestion (upload → master)

One converter per input family, all with the same contract:

```ts
interface Ingestor {
  accepts(mime: string, magic: Buffer): boolean;
  /** writes a .gltf + resources into `outDir` */
  ingest(input: string, outDir: string, ctx: TaskHandlerContext): Promise<{
    gltf: string;          // path of the .gltf in outDir
    warnings: string[];    // anything that was dropped or approximated
    stats: MasterStats;
  }>;
}
```

Rules for "as lossless as possible":
- **Images are copied byte for byte** (no re-encoding). glb-embedded images are extracted to files.
- **Geometry is decoded**: Draco and meshopt are decompressed so the master doesn't depend on decoders. Quantization that's already baked in is kept, not "restored".
- **Unknown glTF extensions are kept**: pass their JSON through. If that isn't possible, record a `warning` rather than failing silently.
- **The coordinate frame is kept** (see §5.3). Units and orientation are normalized to glTF conventions only when the source format defines them unambiguously, and the original values go into `stats`.

Initial coverage: `glb`/`gltf` (gltf-transform), `obj` (obj2gltf, non-binary). Each new format (`fbx`, `ply`, `stl`, `usdz`, `e57`/`las`…) only means adding an ingestor.

When ingestion finishes, the server looks up `source_hash` among masters the user can read. If it finds a match, the upload result says so (`duplicates: [{asset_id, name}]`) so the UI can offer to reuse that asset. Nothing is merged automatically.

### 5.2 Output runs

A run computes `(master vN, config vM) → output`. It calls `emit(level, dir)` zero or more times before it finishes. Suggested default strategy:

1. **Placeholder**, target < 30 s whatever the input size. Aggressive simplification and small textures (roughly today's `Thumb` preset). For huge inputs, fall back to a bounding-box or point-sampled proxy built from the master's `stats`.
2. **Final**, the actual config (today's `optimizeGlb` presets, adapted to write `.gltf` + resources).
3. **Partial** emits are optional, decided by the processor. For example, geometry done but textures still raw.

Each `emit` stores the new resources as blobs, then updates `asset_outputs` (`level`, `gltf_hash`, resources) in one transaction, then publishes an event (§7.3).

A new master or config version starts a new run and cancels the one in progress (`AbortSignal`, which tasks already support). The previous result stays served until the new run emits its placeholder. That's a policy choice: an alternative is to keep the previous *final* until the new final is ready, and skip the new placeholder. It could be a per-config option.

### 5.3 Consequence of unversioned outputs: config must not move the model

A scene doesn't pin a version: it always shows the current output. Annotations, tours and the model transform are stored in the scene's `svx` in the model's coordinate frame. If a config change re-centered, re-oriented or rescaled the geometry, **every annotation in every scene using that asset would shift**, including in old scene versions restored from history.

Rule: **output processing preserves the coordinate frame.** Decimation, texture resizing, compression and LODs are fine. Orientation, scale and centering belong in the scene's model transform (where Voyager already puts them), not in the config. The same rule applies when a new master version replaces the source. Re-ingesting the same file is fine. Replacing it with a different scan is a different asset unless the user accepts that annotations will need fixing. The server can check this automatically by comparing bounds between versions and warning when they differ a lot.

## 6. Access control

Assets are shared across scenes, so their permissions can't just come from one scene.

Proposal:
- Assets have **their own ACL**, modelled on scenes (owner, users, groups, `default_access`, `public_access`).
- The **master** (download, re-ingest, config changes) requires access on the asset itself.
- The **output** (what Voyager loads) can also be read by **anyone who can read a scene that references the asset**. Otherwise a public scene using a private asset would show an empty viewer, and asking authors to sync two ACLs is a trap.
- To make that safe, references are **checked when a document is saved**. Whoever writes a `scene.svx.json` that adds a reference to `/assets/:id` must have read access on that asset. Otherwise anyone could put a random id in their own scene and read it. Validated references go into a **reference index** (`scene_asset_refs(fk_scene_id, fk_asset_id)`), rebuilt on every document write.

The reference index is useful for more than access control:
- "Used in N scenes" on the asset page, plus a warning before changing a config or replacing a master that affects other scenes.
- Refusing (or turning into archiving) the deletion of an asset that's still referenced.
- Garbage collection and scene export (§8).

A simpler alternative: output URLs carry an unguessable token and are publicly readable, with no reference index. It's cheaper but you can't revoke access, and it doesn't give us "used in" or GC. Not recommended, but it's a valid first step.

## 7. Contract with Voyager

### 7.1 How a scene references an asset

```jsonc
// scene.svx.json, models[i]
"derivatives": [{
  "usage": "Web3D", "quality": "High",
  "assets": [{ "type": "Model", "uri": "/assets/42/web/model.gltf", "byteSize": 1234567, "numFaces": 200000 }]
}]
```

- **Root-relative URI.** It resolves correctly from `scenes/<name>/`, the history views, the standalone viewer, and embeds. It survives scene renames and a change of domain. The catch is that it breaks if eCorpus is ever served under a sub-path. That isn't supported today, but it's worth knowing.
- `byteSize`/`numFaces` are written when the reference is added and are only hints. They may go stale. The live values are in the asset manifest.
- No change to the svx schema is needed. Voyager already resolves the URI (`new URL(uri, baseUrl)`), and the schema allows absolute and relative URLs.

To verify on the Voyager side (items for the Voyager design): that a non-local `uri` survives Voyager's save round-trip unchanged (`CVAssetManager.getAssetPath` strips the base URL from paths, but should leave `/assets/…` as is). Also whether its "add model" flows should create an asset instead of PUTting a file into the scene.

### 7.2 Serving outputs

```
GET /assets/42/web/model.gltf                 # the only mutable URL
ETag: "<gltf hash>"
Cache-Control: no-cache                        # always revalidate: cheap 304 while unchanged
Link: </assets/42>; rel="describedby"; type="application/json"
X-Asset-Level: placeholder                     # none | placeholder | partial | final
X-Asset-State: processing                      # queued | processing | ready | failed

GET /assets/42/web/res/<hash>.<ext>           # buffers and textures referenced by the .gltf
Cache-Control: public, max-age=31536000, immutable
```

The served `.gltf` only references resources by content hash (`res/<hash>.bin`, `res/<hash>.ktx2`), as relative URIs, so Voyager's `extractUrlBase` resolves them correctly. That gives:
- **Atomic swaps**: a client that fetched the `.gltf` before a swap keeps loading consistent resources, because they're immutable and never overwritten.
- **Cheap refinement**: resources that don't change between placeholder and final (or between two configs) keep their URL and stay in the browser cache.
- Resources from a replaced output must stay readable for a grace period (minutes to hours), so clients that are mid-load don't get 404s. After that, cleanup drops them.

Masters are reachable for download and tooling (`GET /assets/42/master/…`), with access checked on the asset. Voyager never loads them.

### 7.3 Asset manifest (pull)

`GET /assets/42`:

```jsonc
{
  "id": 42, "name": "Statue",
  "master": { "generation": 3, "source_name": "statue.obj", "warnings": [], "stats": { … } },
  "outputs": {
    "web": {
      "href": "/assets/42/web/model.gltf",
      "state": "processing", "progress": 0.42,
      "computing": { "master": 3, "config": 2 },
      "serving":   { "level": "placeholder", "master": 3, "config": 2, "numFaces": 2000, "bounds": { … } },
      "config": { "preset": "High" }
    }
  },
  "events": "/assets/events?id=42"
}
```

It supports `ETag`/`If-None-Match`, so polling it is cheap when push isn't available.

### 7.4 Change notifications (push)

`GET /assets/events?id=42&id=57` returns `text/event-stream` (Server-Sent Events).

- The client lists the assets it cares about (the ones the scene references), so the server doesn't need to know which scene is open. One connection per open scene.
- Access is checked per id at connect time, with the same rules as reading the output (§6).
- Why SSE rather than WebSockets: one-way traffic is all we need, it goes through ordinary HTTP auth/cookies and proxies, the browser has `EventSource` built in, and `Last-Event-ID` gives resume after reconnecting.

```
id: 1832
event: output
data: {"asset":42,"profile":"web","state":"processing","progress":0.42}

id: 1833
event: output
data: {"asset":42,"profile":"web","state":"ready","level":"final","etag":"…"}
```

Expected Voyager behavior (informative only): on an `output` event with a new `etag`, reload `/assets/42/web/model.gltf` and swap the model in place. Annotations and transforms belong to the scene, and §5.3 guarantees they still line up.

The stream needs `X-Accel-Buffering: no`, no compression on this route, a heartbeat every ~25 s, event ids that stay monotonic across restarts (DB sequence), and a bounded replay window. If a client's `Last-Event-ID` is too old, the server sends a `reset` event and the client re-reads the manifests.

## 8. Other consequences of living outside scenes

| Area | Consequence | Proposed handling |
|---|---|---|
| Scene zip export | The export would contain an svx pointing to `/assets/…` and no model. | Export follows the reference index: copy each referenced output into the archive (e.g. `models/<asset-name>/…`) and rewrite the URIs in the exported svx. Re-importing such an archive creates scene-local files, or offers to re-create assets. |
| Scene history | Restoring an old scene version shows the *current* output of its assets, not the one it had back then. | Accepted, given unversioned outputs. §5.3 keeps the result consistent. If needed, the past output can be regenerated from the master/config versions in effect at that date. |
| Scene duplication | Copying a scene copies references, not models. | That's what we want. Both scenes share the asset, which the "used in" list makes visible. |
| Deleting a scene | Leaves its assets alone. | Unreferenced assets show up in the owner's asset list. No automatic deletion. |
| Deleting an asset | Would break the scenes that reference it. | Archive it instead of deleting it while references exist. Outputs stay served. |
| WebDAV | Assets don't appear in a scene's tree. | Fine for now. A read-only `/assets` DAV tree could come later. |
| Search, browsing | Users need to find and reuse assets. | `GET /assets` listing (own, shared, public), plus an asset library in the UI. |
| Cross-origin embedding | A Voyager hosted elsewhere loading an eCorpus scene would fetch `/assets/…` from its own origin. | Out of scope. That case already breaks today for scene-relative paths served cross-origin. |
| Legacy models | Existing scenes keep plain files in `models/`. | Both coexist. A later "convert to asset" action can ingest a scene file and rewrite the reference. |

## 9. Missing building blocks

Ordered roughly by dependency.

| # | Building block | Why | Notes |
|---|---|---|---|
| 1 | **Durable, resumable jobs** | Output runs last up to hours and must survive restarts. Today `reapOrphans()` fails every unfinished task on boot, and the watchdog kills anything past 1h. | On boot, re-queue output runs whose `state` is `queued`/`processing` instead of failing them. The served level is in the DB, so a restarted run can skip the placeholder. Give long runs their own time budget and their own queue, so they don't block placeholders, uploads or other tasks (today there's one root queue of 4). |
| 2 | **Event bus** | Something has to connect "output emitted" (in a task) to "SSE clients" (in HTTP handlers). Neither exists. | Postgres `LISTEN/NOTIFY` (payload = event id) plus an `events` table for replay. Works with one process now and with several processes or external workers later. |
| 3 | **SSE endpoint infrastructure** | No streaming route exists. | Auth, heartbeats, connection limits, documented reverse-proxy settings (buffering, timeouts). |
| 4 | **Asset entity, ACL and routes** | Assets are a new top-level resource. | Tables (§4), `/assets` routes (create from upload, list, get, archive, ACL), and an ACL model shared with scenes where possible (`UserManager.getAccessRights` currently assumes scenes). |
| 5 | **Reference index and save-time validation** | Needed for output access through scenes, "used in" lists, safe deletion, export and GC. | Parse model URIs on every `scene.svx.json` write (`routes/scenes/scene/files/put/document.ts`, `structuredDocMerge`, archive import). Refuse references to assets the writer can't read. Maintain `scene_asset_refs`. |
| 6 | **Master format and ingestors** | No master concept exists. | Canonical `.gltf` writer, extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings. Port `toGlb`/`objToGlb` to the ingestor contract. |
| 7 | **Output processors writing `.gltf` + hashed resources** | `optimizeGlb` writes a single `.glb` today. | Write external resources named by content hash, and store the blobs and the resource list. |
| 8 | **Config schema and versioning** | Configs need validation, a default per profile, and to stay meaningful when the optimizer changes. | JSON schema with a `schema_version`. Restrict configs to transformations that keep the coordinate frame (§5.3). Decide whether a pipeline upgrade re-runs outputs automatically (probably not: offer it, or do it lazily). |
| 9 | **Progress reporting from tasks** | Needed for `progress` and `X-Asset-State`. Tasks only log text today. | A throttled `context.progress(fraction)` hook, written to `asset_outputs` and published as an event. |
| 10 | **Placeholder generator** | Has to be fast on arbitrarily large inputs. Today's `Thumb` preset still loads and processes the whole mesh. | Start with `Thumb`, then add sampling or a bounding-box proxy. |
| 11 | **Cleanup reachability** | `cleanLooseObjects` only keeps blobs referenced by `files.hash`. | Also count master resources, output resources (with the grace period from §7.2) and retained uploads. |
| 12 | **Export with asset inlining** | Scene zips must stay self-contained. | Follow `scene_asset_refs`, copy outputs, rewrite URIs in the exported svx. |
| 13 | **Upload retention** | Ingestion may lose data for some formats. Deleting the upload immediately makes a bad conversion unrecoverable. | Keep the upload blob (`source_hash`) for a configurable number of days. Maybe let admins pin it. |

Not strictly required at first, but worth deciding early:
- **External workers**: blocks 1 and 2 (a DB-backed queue plus NOTIFY) make heavy processing on dedicated machines a deployment choice rather than a redesign.
- **Quotas and storage tiering**: masters can be very large. A separate `masters_dir` (cold storage, not served) and per-user quotas.

## 10. Open questions

1. **Several outputs per asset?** For example, Voyager quality levels (Thumb/Low/High as separate derivatives, which Voyager already loads progressively) or AR/USDZ. The schema supports it through `profile`. What's missing is how the scene's `derivatives[]` maps to profiles, and who decides which profiles exist (per asset config, or instance-wide defaults).
2. **Swap policy during re-runs**: serve the new placeholder as soon as possible, or keep the previous final until the new final is ready? Per config, or a global default?
3. **Replacing a master with different geometry**: allow it as a new version (and warn), or force a new asset? See §5.3.
4. **Output access through scenes**: is the reference-index approach (§6) acceptable, or do we start with the capability-URL shortcut?
5. **Non-model uploads**: should images (for articles or textures) eventually go through the same asset system (e.g. responsive variants), or does it stay models-only?
6. **Upload retention**: what default grace period?

## 11. Suggested phasing

1. **Foundations**: durable jobs (1), event bus + SSE (2, 3), progress hook (9). Useful on their own, e.g. live upload/task status in the UI.
2. **Assets and masters**: entity, ACL and routes (4), ingestors (6), retention and cleanup (11, 13). Uploads create assets.
3. **Outputs**: processors (7), config schema (8), placeholder (10), manifest and serving (§7.2, §7.3), events (§7.4).
4. **Scene integration**: reference index and validation (5), scene creation from an upload writes `/assets/…` references, export inlining (12).
5. **Voyager integration** (separate design).
