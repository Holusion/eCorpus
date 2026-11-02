# Design: Server-managed 3D assets

> Status: **draft / request for comments**, revision 6
> Scope: server-side data model, processing pipeline and the HTTP contract Voyager will consume.
> Out of scope: the Voyager-side implementation.

## 1. Goals

For every 3D file a user uploads, eCorpus keeps a normalized **master** and serves Voyager a set of **outputs** derived from it (at least a web glTF, optionally other quality levels and AR versions). Each output:

1. **Exists almost immediately**, even if it's only a rough placeholder.
2. **Is mutable**: it gets refined (progressively or in one go) as processing goes on, which may take 30s to several hours.
3. **Can be re-derived**: the user may change the transformation parameters (the *config*) afterwards, which replaces the output.
4. **Comes from a normalized source**, never from the raw upload: on ingestion, the upload is converted as losslessly as possible into a glTF with external resources (the master). All later processing starts from the master.

Additionally:

5. **Uploading through Voyager is a first-class path.** Today, the initial upload page converts and optionally optimizes models, while a model added later in Voyager's editor is just a raw file PUT into the scene folder, with a quality picked by hand. Both entry points must go through the same pipeline and offer the same reprocessing options.
6. **Models can be reused across scenes** without copying, and can be viewed on their own.

The server has to tell Voyager what is available and when it changes.

### Decisions so far

| Question | Decision |
|---|---|
| What an upload produces | **A scene and an asset.** The asset holds the master, its configs and its outputs. It's owned by exactly one scene, its *home scene*, which shows it and controls who can access it. There's no standalone asset with its own ACL (§3). |
| Entry points | **One server operation**, "create an asset from an upload", used both by the upload page and by Voyager's editor (§5.1). |
| Master | A new, versioned representation (`.gltf` + external resources) **stored outside `files`**, never visible in the home scene's file tree, WebDAV or exports (§4). Exposed as the asset's *inputs*. |
| Output format | **`.gltf` with external resources** by default. Profiles handed to an external AR app use the single-file format that app requires (§3.2). |
| What gets versioned | **Master and config are versioned. Outputs are not**: an output is a function of (master version, config version, pipeline) and can always be regenerated. |
| Master deduplication | **Not forced.** Uploading a file whose source hash matches an existing master gives a warning (and an offer to reuse it), nothing more. Bytes are deduplicated anyway at the blob level. |
| Outputs per asset | **A set**, one per *profile*. Voyager quality levels and AR variants are all profiles. New assets get `web` (Web3D/High) and maybe `thumb` (Web3D/Thumb). The rest is enabled when tuning (§3.2). |
| Scenes and newly enabled outputs | **Referencing scenes don't pick up new outputs by themselves.** Their svx is the only source of truth, so someone has to revisit a scene to add, for example, an AR derivative. The home scene's document is updated when the asset is tuned (§7.2). |
| Old output during regeneration | **Up to each processor**, depending on how long the run should take (§5.3). |
| Replacing a master | **Allowed, with no similarity requirement.** Consequences are surfaced, not prevented (§5.4). |
| Access control | **The scene ACL system, as is.** An asset's permissions are its home scene's. Read access is transitive through references: a user who can read the home scene may publish the asset's outputs in a more visible scene (§6). |
| URLs | **`/assets/:id`**, keyed by the asset's immutable id, separate from mutable scene names: `/assets/:id` (asset data), `/assets/:id/outputs/…`, `/assets/:id/inputs/…`, `/assets/:id/config` (§7.1). |
| Viewing an asset on its own | **Its home scene** (§7.6). |

### Non-goals (for this phase)

- Writing the Voyager integration. This document only lists what it must support.
- Choosing every converter for every input format.
- Migrating existing scenes. Plain model files in `scenes/<name>/models/` keep working as they do today.

## 2. What exists today

Server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. |
| Scenes | `scenes`, `vfs/Scenes.ts` | `scene_id` is a random 48-bit integer (`Uid.make()`) with a base64url string form (`Uid.toString`). `scene_name` is unique, free text, and **mutable** (`routes/scenes/scene/patch.ts` renames). All HTTP routes address scenes by name. |
| Scene ACL | `users_acl`, `groups_acl`, `UserManager.getAccessRights` | Owner, per-user and per-group levels, `public_access`/`default_access`, admin override. |
| Tasks | `tasks/scheduler.ts`, `tasks/manager.ts` | Persisted tasks with a parent/child tree, logs, an in-process queue (concurrency 4), and per-task workspaces. |
| Upload page pipeline | `tasks/handlers/uploads.ts` | `parseUserUpload` → `createSceneFromFiles`. OBJ goes through `toGlb`, then optionally `optimizeGlb` (one preset). The result is copied to `scenes/<name>/models/`, a `scene.svx.json` is generated, and the upload is then dropped. `createSceneFromFiles` only returns once everything has finished. |
| Optimization | `tasks/handlers/optimizeGlb.ts` | gltf-transform pipeline driven by `TDerivativeQuality` presets. Becomes the first output processor. |
| Viewer pages | `routes/views/index.ts`, `templates/scene/explorer.hbs` | The explorer template takes a `scenePath` root. The history view uses it to point Voyager at `/history/…/show/`. |

Voyager (submodule `source/voyager`, at `f7a70e6`):

- **Uploading in the editor:** `CVMediaManager.uploadFile` PUTs the raw file at `<scene root>/<path>`. `ImportMenu` then asks for a parent model and a derivative quality chosen by hand. There's no conversion, no optimization, no inspection.
- **URI resolution:** `CVAssetManager.getAssetUrl(path)` resolves asset `uri`s with `new URL(path, baseUrl)`. **Root-relative and absolute URIs already load.** Scene-relative paths break under the history view's root, which is another reason for root-relative URIs.
- **External glTF resources:** `ModelReader.get(url)` resolves them against the URL *requested*, not the URL it was redirected to. **External resources must be reachable relative to the URL written in the svx.** A redirect would load the `.gltf`, then fail on its buffers and textures.
- **AR:** `CVARManager` looks for `Web3D/AR` (WebXR), `App3D/AR` (Scene Viewer, URL passed in an Android intent) and `iOSApp3D/AR` (Quick Look) derivatives.

Gaps:

- Uploads aren't kept in any normalized form, so there's nothing to re-derive from.
- No way to push changes to clients.
- Tasks can't outlive the process. `TaskScheduler.reapOrphans()` fails every unfinished task on startup, and the watchdog (`task_timeout_seconds`, default 3600) aborts anything longer than an hour.

## 3. Concepts

```
 upload (from the upload page, or from Voyager while editing scene A)
   │
   ▼  "create asset from upload"
 ┌─────────── scene B "statue" (home scene) ────────────────────────────────────┐
 │  ACL, page, scene.svx.json (one model pointing at the asset's outputs,       │
 │  + whatever users add: annotations, articles, tours…)                        │
 │                                                                              │
 │   owns ┌──────────── asset 7Kx9pQ2a ──────────────────────────────────────┐  │
 │        │  inputs:  master v1 ── v2 ── v3  (versioned, never in files)     │  │
 │        │  config:  v1 ── v2                (versioned)                     │  │
 │        │      │                                                          │  │
 │        │      ▼ derive, per enabled profile                               │  │
 │        │  outputs: web (.gltf) · thumb (.gltf) · ar-app (.glb) · …        │  │
 │        │           mutable, not versioned                                  │  │
 │        └──────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ referenced by URL (+ grant, §6)
                 scene A ────────────┤  uri: "/assets/7Kx9pQ2a/outputs/web/model.gltf"
                 scene C ────────────┘
```

- **Asset**: the processing unit behind one uploaded model: its master versions (inputs), config versions and outputs. It has an **immutable id** (`Uid`, base64url in URLs) and its own URL namespace. It has **no name and no ACL of its own**: both come from its home scene.
- **Home scene**: the scene that owns an asset. **Each asset has exactly one home scene, and a scene is home to at most one asset.** Otherwise it's an ordinary scene: users can open it, annotate it, write articles, rename it, change its permissions. Its svx contains a model pointing at its asset's outputs, like any referencing scene. A scene with no asset is a plain scene, either composite or legacy.
- **Upload**: the bytes the user sent. Transient. Deleted after a successful ingestion, with a configurable grace period.
- **Master**: the canonical form of the upload, a `.gltf` plus external resources (`.bin` buffers, original image files). Immutable per version. A new master version comes from replacing the source, or from re-ingesting with a better converter. Exposed under `/assets/:id/inputs`.
- **Config**: the transformation parameters for each profile, plus which optional profiles are enabled. A small JSON value with a schema and a `schema_version`. Each change is a new version.
- **Profile**: a kind of output, defined by the instance (not by users). It sets the format, the processor and the Voyager derivative it maps to.
- **Output**: one mutable slot per (asset, profile), holding the result of the current master and config. It moves from `placeholder` to `final`, and is replaced when the master or config changes. No history: a past output is reproduced by re-running the pipeline.
- **Reference**: a model entry in a scene's svx whose derivative URIs point at an asset's outputs. Its home scene references it the same way.

### 3.1 Why an asset owned by a scene

There are two simpler-looking options, and each fails on something:
- **A standalone asset entity** (rev. 4, see §11): it needs a parallel ACL, listing, search and viewer pages. It also gives Voyager uploads no natural home.
- **A scene with no separate asset identity** (rev. 5): URLs then have to be keyed by scene id, which doesn't say what's being addressed. And the scene, as an object, gets mixed up with its processing data.

An asset owned by a home scene keeps the good part of each:
- **Permissions, listing, search, tags, thumbnails, archiving and viewer/editor pages are the scene's.** No parallel system.
- **Viewing an asset on its own is opening its home scene**, which can carry the object's own annotations and articles.
- **The asset is a real resource with a stable address** (`/assets/:id`). It groups everything that isn't user-editable scene content: inputs, config, outputs and state.
- **The upload page keeps its current shape**: upload a file, get a scene.
- Keeping a separate asset id, rather than reusing the scene id, leaves room to move an asset to another home scene or to relax the one-asset-per-scene rule later, without changing any stored URL.

What it costs (each point is handled below):
- Outputs must stay out of `files`, otherwise every refinement would create a file version (§4).
- One scene ACL covers the home scene's page, the asset's outputs and its inputs, so input download needs a higher level than `read` (§6).
- Deleting home scenes has to take references into account (§8).
- Scene lists need a filter, because uploads from Voyager create scenes users didn't explicitly ask for (§8).

### 3.2 Profiles and AR

Voyager picks derivatives by `(usage, quality)`:

| Profile | Voyager derivative | Used by | Format | Enabled by default |
|---|---|---|---|---|
| `web` | `Web3D` / `High` | the viewer | `.gltf` + external resources | **yes** (always present) |
| `thumb` | `Web3D` / `Thumb` | the viewer: first thing shown while `High` loads | `.gltf` + external resources | probably (instance setting) |
| `low`, `medium`, `highest` | `Web3D` / `Low`, `Medium`, `Highest` | the viewer, by device/bandwidth | `.gltf` + external resources | no |
| `ar-web` | `Web3D` / `AR` | WebXR, inside the viewer | `.gltf` + external resources | no |
| `ar-app` | `App3D` / `AR` | Android Scene Viewer | `.glb` | no |
| `ar-ios` | `iOSApp3D` / `AR` | iOS Quick Look | `.usdz` | no |

- The profile list (format, processor, derivative, default config, enabled by default) is configured on the server.
- `ar-app` is a single `.glb` because Voyager passes the URL to an external app in an Android intent. `ar-ios` is `.usdz` because Quick Look only takes USDZ, which needs a converter (building block 14).
- **`thumb` and the `web` placeholder are different things.** The placeholder is temporary: it's what the `web` slot serves while the real output is computed. `thumb` is a permanent derivative that Voyager loads first. A processor may reuse one for the other: when `thumb` finishes first, the `web` run can emit the same blobs as its placeholder at no extra storage cost.

**All outputs of one asset share the master's coordinate frame.** Voyager treats them as derivatives of one model and swaps between them with the same transform and annotations. Processors may decimate, retexture and compress, but never re-center, re-orient or rescale.

**AR apps fetch the file without the user's session.** Scene Viewer and Quick Look download the URL themselves, without cookies. AR outputs of a non-public asset will fail to load there. The same problem exists today for AR files in private scenes. Possible fix: short-lived signed URLs (building block 15).

## 4. Storage model

All blobs (master resources, output resources) go into the existing content-addressed store, so bytes are stored once however many masters reference them. Masters could later move to a colder `masters_dir`, since they're never served to Voyager.

None of these tables touch `files`. A home scene's file tree contains only what users put there, plus its `scene.svx.json`.

```sql
CREATE TABLE assets (
  asset_id     BIGINT PRIMARY KEY,                    -- Uid.make(); base64url in URLs
  fk_scene_id  BIGINT NOT NULL UNIQUE                 -- home scene: exactly one, and one asset per scene
               REFERENCES scenes(scene_id),           -- no cascade: deleting a referenced home scene is refused (§8)
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inputs. Versioned like `files`: (asset, generation), append-only.
CREATE TABLE asset_masters (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  gltf_hash    VARCHAR(43) NOT NULL,      -- the .gltf JSON; resource URIs relative to the master root
  source_name  TEXT NOT NULL,             -- original upload name
  source_mime  TEXT NOT NULL,
  source_hash  VARCHAR(43) NOT NULL,      -- hash of the upload: duplicate warnings, traceability, retention
  converter    TEXT NOT NULL,             -- "gltf-transform@4.x", "obj2gltf@3.x"…
  warnings     JSONB NOT NULL DEFAULT '[]', -- anything lost or approximated during ingestion
  stats        JSONB NOT NULL DEFAULT '{}', -- faces, vertices, bounds, image sizes, extensions
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, generation)
);
CREATE INDEX asset_masters_source ON asset_masters(source_hash);

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

-- One config document per version, covering every profile:
-- { "schema_version": 1, "profiles": { "web": {"preset": "High"}, "ar-app": {"preset": "AR"} } }
-- A profile missing from `profiles` is disabled ("web" is always enabled).
CREATE TABLE asset_configs (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  config       JSONB NOT NULL,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, generation)
);

-- Outputs. Not versioned: one row per (asset, profile), overwritten in place.
CREATE TYPE output_state AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE output_level AS ENUM ('none', 'placeholder', 'partial', 'final');

CREATE TABLE asset_outputs (
  fk_asset_id       BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  profile           TEXT NOT NULL,
  -- what is being computed
  master_generation INTEGER NOT NULL,
  config_generation INTEGER NOT NULL,
  pipeline          TEXT NOT NULL,          -- processor name + version
  state             output_state NOT NULL DEFAULT 'queued',
  progress          REAL,
  fk_task_id        BIGINT REFERENCES tasks(task_id) ON DELETE SET NULL,
  error             JSON,
  -- what is being served (may come from older inputs while a new run is in progress)
  level             output_level NOT NULL DEFAULT 'none',
  entry_hash        VARCHAR(43),            -- the .gltf, or the single .glb / .usdz file
  stats             JSONB NOT NULL DEFAULT '{}',
  mtime             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, profile)
);
-- asset_output_resources(fk_asset_id, profile, hash, size, mime): blobs the served .gltf references

-- Cross-scene references and grants (§6)
CREATE TABLE scene_asset_refs (
  fk_scene_id  BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,  -- referencing scene
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id),
  PRIMARY KEY (fk_scene_id, fk_asset_id)
);
CREATE INDEX scene_asset_refs_asset ON scene_asset_refs(fk_asset_id);

CREATE TABLE scene_asset_grants (
  fk_scene_id   BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_asset_id   BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  fk_granted_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, fk_asset_id)
);
```

## 5. Processing pipeline

### 5.1 One entry point: create an asset from an upload

```
 upload page ─────────┐                                         ┌──▶ open scene B
                      ├──▶ POST /assets ──▶ asset + home scene B ┤
 Voyager (editing A) ─┘    (returns ids + output URLs right      └──▶ add a model to A whose derivatives
                            away, before ingestion)                   point at /assets/<id>/outputs/…, grant A→asset
                                   │
                                   ▼ background
                       ingest ──▶ master v1 ──▶ runs for the enabled profiles ──▶ events
```

`POST /assets`:
1. Receives the upload (resumable, for large files).
2. Creates the asset and its home scene B right away. B's name is derived from the file name (suffixed if it collides, since scene names are unique), the uploader is owner, and the instance default permissions apply. **Nothing is copied from A.** It writes B's `scene.svx.json` with one model whose derivatives point at the asset's default profiles.
3. **Returns immediately** with the asset id, B's id and name, and the output URLs. Those URLs are stable before any content exists: they answer with `state: queued` until the first emit.
4. Queues ingestion, then output runs.

When called from Voyager while editing scene A, the client then adds a model to A pointing at the asset's outputs, and saves A. The save creates the A → asset grant (§6.2), which works because the uploader owns B.

Both entry points end in the same state, with the same tuning UI (§7.7). The only difference is what the client does afterwards: open B, or reference the asset from A.

**Replacing a model from Voyager stays local.** "Replace this model" while editing A creates a new asset (with its own home scene) and repoints A's model at it. It never pushes a new master version into the existing asset, which may be referenced elsewhere. "Replace the source everywhere" is an explicit action on the asset itself (`POST /assets/:id/inputs`, §5.4).

**Forking.** A user who can write A but only read the asset's home scene can't tune it. "Fork" creates a new asset and home scene, with a master pointing at the same blobs (almost free) and its own config, then repoints A. It's the way to re-tune a model you don't control without affecting other people's scenes.

Server-unaware clients (standalone Voyager) keep today's behaviour: a PUT into the scene folder creates a plain file, outside this system.

### 5.2 Ingestion (upload → master)

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
- **Unknown glTF extensions are kept**: their JSON is passed through. If that isn't possible, record a `warning`.
- **The coordinate frame is kept.** Units and orientation are normalized to glTF conventions only when the source format defines them unambiguously, and the original values go into `stats`.

Initial coverage: `glb`/`gltf` (gltf-transform), `obj` (obj2gltf, non-binary). Each new format only means adding an ingestor.

When ingestion finishes, the server looks up `source_hash` among assets the user can read. If it finds a match, the result says so (`duplicates: [{asset_id, scene}]`) so the UI can offer to reference the existing asset instead (and delete the new one). Nothing is merged automatically.

### 5.3 Output runs

A run computes `(master vN, config vM) → output` for one profile, and calls `emit(level, dir)` zero or more times before it finishes:

1. **Placeholder**, target < 30 s whatever the input size. Aggressive simplification and small textures, or a bounding-box or point-sampled proxy for huge inputs.
2. **Final**, the actual config (today's `optimizeGlb` presets, adapted to write `.gltf` + resources).
3. **Partial** emits are optional, decided by the processor.

Each `emit` stores the new resources as blobs, updates `asset_outputs` in one transaction, then publishes an event (§7.5).

Runs for different profiles are independent tasks and may run in parallel. `thumb` and `web` get priority. A config change only re-runs the profiles whose section changed. A new master re-runs every profile. A new run cancels the one in progress for the same profile (`AbortSignal`).

**What happens to the previous output during a re-run is up to the processor.** It gets two primitives: `invalidate()` (stop serving the previous output right away, `level` back to `none`) and `emit(...)` (replace whatever is served). A short run can keep the old output and emit once. A multi-hour run will probably emit a placeholder early. Clients only rely on `state`/`level` and events.

### 5.4 Consequences of unversioned outputs and replaceable masters

Referencing scenes don't pin a version: they always show the current outputs. Annotations, tours and transforms are stored in each scene's svx, in the model's coordinate frame.

- **Config changes never move the model**, since all outputs share the master's frame (§3.2).
- **Master replacement may move the model, and that's allowed.** Annotations in the home scene and in every referencing scene (including old versions restored from history) may end up misplaced. The server makes it visible instead of preventing it:
  - before replacing, the UI shows the scenes referencing the asset (§6.1) and suggests forking instead when there are any;
  - after ingestion, a large difference in bounds from the previous version is reported as a warning.

## 6. Access control

An asset's permissions are its home scene's: **the scene ACL system applies unchanged**, through the home scene. "Level on the asset" below means "level on its home scene".

| Action | Required level on the asset |
|---|---|
| Read asset data (`/assets/:id`), outputs, events | `read`, or transitive read through a referencing scene (§6.2) |
| View the home scene | `read` on the home scene (as for any scene), not transitive |
| Reference the asset from another scene (creates a grant) | `read`, direct only (§6.2) |
| Change config, enable/disable profiles, replace master | `write` |
| **Download inputs** (master, retained upload) | **`write`**: a public home scene must not expose a huge and often sensitive master to everyone |
| Revoke a scene's grant | `admin` |
| Create an asset (upload) | user role `create`, same as creating a scene |

Scene permission changes never propagate between scenes.

### 6.1 Reference index

`scene_asset_refs` is rebuilt from the derivative URIs of the **current** `scene.svx.json` on every document write. A home scene's reference to its own asset isn't recorded. It's used for:
- **Transitive access** (§6.2), together with grants.
- **"Used in N scenes"** on the asset, and warnings before changing its config or replacing its master.
- **Deletion guards** (§8).
- **Garbage collection and scene export** (§8).

### 6.2 Transitive read access

A user who can read an asset may reference its outputs in scene A, even if A is more visible than the asset's home scene. Readers of A can then load those outputs. The publisher already had the right to see them, so this isn't a permission violation.

- **A grant (A → asset) is created when a write to A's document adds a reference to the asset**, if A has no grant for it yet. The writer must have **direct** `read` on the asset (that is, on its home scene). Otherwise the write is refused (`403`, naming the asset). This check stops someone from putting a random asset id in their own scene to read it.
- **Access doesn't chain.** Read access obtained through A doesn't let you grant the asset to another scene. Otherwise making A private again would no longer protect the asset. One consequence: duplicating A checks the references again against the user making the copy.
- **Grants belong to the (scene, asset) pair, not to a document version.** A reference that's removed and comes back later (undo, history restore) needs no new check.
- **Effective read on asset X's data and outputs** for user U: `read(U, home(X)) OR EXISTS(scene A: read(U, A) AND ref(A, X) AND grant(A, X))`.
- **Scope:** outputs, the public part of the asset data, and events. Not the home scene's page or document, not the inputs, not the config.

### 6.3 Changing the home scene's permissions doesn't break scenes

Scenes hold their own grants, so **changing the home scene's ACL only changes direct access**. Scenes that reference the asset keep working.
- The home scene's permission page lists **which scenes still give access to its asset's outputs**, with their visibility.
- **"Revoke from scene"** (`admin`) deletes a grant and lists what breaks. It's the only way, besides deleting the asset, to take access back from a referencing scene.

Possible extension, not proposed for now: a flag refusing grants to scenes more visible than the home scene.

## 7. Contract with Voyager

### 7.1 URL layout

Scene names are mutable, so anything a document stores a URL to has to use an immutable id, in a namespace of its own. Scene names are free text, so no id format could be kept from colliding with them inside `/scenes/:name`. Assets give that namespace a meaning:

```
POST /assets                                      create an asset (and its home scene) from an upload (§5.1)
GET  /assets/:id                                  asset data: home scene, profiles, state, warnings (§7.4)
GET  /assets/:id/outputs/:profile/model.gltf      entry file: the only mutable URL per profile
GET  /assets/:id/outputs/:profile/res/<hash>.<ext>  immutable resources
GET  /assets/:id/inputs                           master versions (and the retained upload, if any)
GET  /assets/:id/inputs/:generation/…             a master's .gltf and resources       (write)
POST /assets/:id/inputs                           replace the source: new master version (write)
GET  /assets/:id/config                           current config, with its history      (write)
PUT  /assets/:id/config                           new config version                    (write)
POST /assets/:id/fork                             new asset + home scene sharing the same master blobs
GET  /assets/events?id=…&id=…                     notifications (§7.5)
```

- `:id` is the asset id in base64url (`Uid.toString`). It never changes, whatever happens to the home scene's name.
- Everything about the home scene as a scene (page, document, ACL, tags) stays under `/scenes/:name/…`. `GET /assets/:id` gives the home scene's current id and name, so clients can follow it.
- `inputs` and `outputs` mirror each other: what goes into processing and what comes out. Inputs are never loaded by Voyager.
- `/assets` also gives a natural place for a later listing (`GET /assets`: the user's assets, through their home scenes).

### 7.2 How scenes reference an asset

```jsonc
// scene.svx.json of A (or of the home scene B), models[i]
"derivatives": [
  { "usage": "Web3D", "quality": "Thumb", "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/thumb/model.gltf" }] },
  { "usage": "Web3D", "quality": "High",  "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/web/model.gltf", "byteSize": 1234567, "numFaces": 200000 }] },
  { "usage": "App3D", "quality": "AR",    "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/ar-app/model.glb" }] }
]
```

The home scene and referencing scenes use the same URIs, so a model copied from B to A is the same JSON. (Voyager's svx also uses the word "asset", for one file of a derivative. The two meanings don't collide in practice, but it's worth knowing when reading code.)

- **Root-relative URIs** resolve correctly from `/scenes/<name>/`, the history views, the standalone viewer and embeds, and survive renames and domain changes. They would break if eCorpus were served under a sub-path, which isn't supported today.
- **The svx is the only source of truth for which derivatives a scene uses.** A referencing scene doesn't pick up profiles enabled later. Someone has to revisit it and add them, and the editor can offer the outputs listed in the asset data that the scene doesn't use yet. A derivative whose profile was disabled answers `404`.
- **The home scene's document is updated when the asset is tuned.** Enabling or disabling a profile adds or removes the matching derivative in the home scene's svx, in the same request (a user-initiated document write, going through the existing merge). Refinements never touch any document: they only change what's behind stable URLs.
- `byteSize`/`numFaces` are hints and may go stale. The live values are in the asset data.
- No svx schema change is needed.

To verify on the Voyager side: that `/assets/…` URIs survive Voyager's save round-trip unchanged (`CVAssetManager.getAssetPath`).

### 7.3 Serving outputs

```
GET /assets/7Kx9pQ2a/outputs/web/model.gltf
ETag: "<entry hash>"
Cache-Control: no-cache                          # always revalidate: cheap 304 while unchanged
Link: </assets/7Kx9pQ2a>; rel="describedby"; type="application/json"
X-Output-Level: placeholder                      # none | placeholder | partial | final
X-Output-State: processing                       # queued | processing | ready | failed

GET /assets/7Kx9pQ2a/outputs/web/res/<hash>.<ext>
Cache-Control: public, max-age=31536000, immutable
```

- The served `.gltf` only references resources by content hash, as relative URIs, so Voyager's `extractUrlBase` resolves them correctly.
- **Atomic swaps**: a client that fetched the `.gltf` before a swap keeps loading consistent resources, because they're never overwritten.
- **Cheap refinement**: resources that don't change between emits keep their URL and stay cached.
- Resources from a replaced output stay readable for a grace period (minutes to hours), so clients that are mid-load don't get 404s.
- Single-file profiles (`.glb`, `.usdz`) are served like the entry `.gltf`.
- Non-public responses get `Cache-Control: private` instead of `public`.

### 7.4 Asset data (pull)

`GET /assets/7Kx9pQ2a`:

```jsonc
{
  "id": "7Kx9pQ2a",
  "scene": { "id": "Qm3vT8cd", "name": "statue" },    // home scene; name is informational
  "source": { "name": "statue.obj", "warnings": [] },
  "outputs": {
    "web": {
      "derivative": { "usage": "Web3D", "quality": "High" },
      "href": "/assets/7Kx9pQ2a/outputs/web/model.gltf",
      "state": "processing", "progress": 0.42,
      "computing": { "master": 3, "config": 2 },
      "serving":   { "level": "placeholder", "master": 3, "config": 2, "numFaces": 2000, "bounds": { … } }
    },
    "ar-app": {
      "derivative": { "usage": "App3D", "quality": "AR" },
      "href": "/assets/7Kx9pQ2a/outputs/ar-app/model.glb",
      "state": "ready",
      "serving": { "level": "final", "master": 3, "config": 2 }
    }
  },
  "events": "/assets/events?id=7Kx9pQ2a",
  // only with write access:
  "inputs": "/assets/7Kx9pQ2a/inputs",
  "config": "/assets/7Kx9pQ2a/config",
  "used_in": 4
}
```

It supports `ETag`/`If-None-Match`, so polling it is cheap when push isn't available.

### 7.5 Change notifications (push)

`GET /assets/events?id=7Kx9pQ2a&id=…` returns `text/event-stream` (Server-Sent Events).

- The client lists the assets it cares about, typically the ones its open scene references. One connection per open scene.
- Access is checked per id at connect time (§6.2).
- SSE rather than WebSockets: one-way traffic is all we need, it goes through ordinary auth/cookies and proxies, the browser has `EventSource` built in, and `Last-Event-ID` gives resume after reconnecting.

```
id: 1832
event: output
data: {"asset":"7Kx9pQ2a","profile":"web","state":"processing","progress":0.42}

id: 1833
event: output
data: {"asset":"7Kx9pQ2a","profile":"web","state":"ready","level":"final","etag":"…"}
```

Expected Voyager behavior (informative only): on a new `etag` for a profile the scene uses, reload that derivative and swap it in place. Events for profiles the scene doesn't use are ignored, except by the editor, which can offer them. Enabling or disabling a profile sends `state: "queued"` or `"removed"`.

The stream needs `X-Accel-Buffering: no`, no compression, a heartbeat every ~25 s, event ids that stay monotonic across restarts, and a bounded replay window. If a client's `Last-Event-ID` is too old, the server sends a `reset` and the client re-reads the asset data.

### 7.6 Viewing an asset on its own

It's **the home scene**: `/ui/scenes/<name>/view`, as for any scene. It's public if the home scene is public. There's no separate playground to build. On top of what any scene has:
- While `web` is at `none` or `placeholder`, the page shows the state and progress from the asset data around the viewer (eCorpus UI, no Voyager change).
- The page subscribes to its asset's events and swaps outputs as they're refined. That's a natural first target for Voyager's server-awareness.

### 7.7 Tuning UI

The same tuning UI must be reachable from:
- the home scene's page in eCorpus;
- the upload flow, right after upload;
- **inside Voyager's editor, from any model that references an asset**, whether in its home scene or in a referencing scene. This is where "uploads through Voyager are first class" (goal 5) is either kept or lost.

It shows the enabled profiles, their settings, their state and progress, and the "used in N scenes" warning. It offers "fork" when the user can't write the asset (§5.1). It talks to `/assets/:id/config` and `/assets/:id/inputs`. Implementation options for the Voyager side: a Voyager panel calling those routes, or an eCorpus web component embedded in Voyager. A link to the home scene's settings page is the cheap first version. This is a requirement for the Voyager design.

## 8. Other consequences

| Area | Consequence | Proposed handling |
|---|---|---|
| Scene lists | Every model upload creates a home scene, including uploads from inside Voyager's editor. | A filter for scenes that are home to an asset, and probably a default view that separates them from composite scenes. |
| Renaming a home scene | No effect on references (asset ids). | Renaming stays free. |
| Deleting a home scene | Would delete the asset and break every scene that references it. | Refused while references exist. Archive instead, and outputs stay served. Without references, deleting the home scene deletes the asset. |
| Archiving | An archived home scene keeps serving its asset's outputs to referencing scenes. | Grants and outputs are kept. |
| Scene zip export | A composite scene's svx points to `/assets/…`. | Export follows `scene_asset_refs`: copy each referenced output into the archive and rewrite the URIs. Exporting a home scene includes its outputs, never its inputs. |
| Scene history | Restoring an old version shows the *current* outputs. | Accepted. Config changes keep annotations aligned. A master replacement may not (§5.4). |
| Scene duplication | Copying A copies references, and grants are checked again for the user making the copy. Copying a home scene creates a plain scene that references the same asset. It doesn't fork it. | The copy response lists models the user can't reference. Forking is an explicit action. |
| WebDAV | Inputs and outputs don't appear in any scene tree. | Fine for now. |
| Legacy scenes | Existing scenes keep plain files in `models/`. | Both coexist. A later action could turn a scene model into an asset, using the current `.glb` as a (degraded) master. |
| Cross-origin embedding | Root-relative URIs load from the embedding origin. | Out of scope. That case already breaks today. |

## 9. Missing building blocks

| # | Building block | Why | Notes |
|---|---|---|---|
| 1 | **Durable, resumable jobs** | Output runs last up to hours and must survive restarts. Today `reapOrphans()` fails every unfinished task on boot, and the watchdog kills anything past 1h. | Re-queue `queued`/`processing` output runs on boot instead of failing them. A separate time budget and separate queues, so long runs don't block placeholders, uploads or other tasks. |
| 2 | **Event bus** | Something has to connect "output emitted" (in a task) to "SSE clients" (in HTTP handlers). Neither exists. | Postgres `LISTEN/NOTIFY` plus an `events` table for replay. Works with one process now and with external workers later. |
| 3 | **SSE endpoint infrastructure** | No streaming route exists. | Auth, heartbeats, connection limits, documented reverse-proxy settings. |
| 4 | **`POST /assets`** | The single entry point (§5.1). Today `createSceneFromFiles` only returns once processing has finished. | Resumable upload, immediate response with ids and output URLs, home scene creation (name collision handling, initial svx), background ingestion and runs. Reused by the upload page and by Voyager. |
| 5 | **`/assets/:id` routes** | Stable, id-based access to asset data, outputs, inputs, config and events (§7.1). | Access is resolved through the home scene, plus `ref AND grant` for transitive reads. That check runs on every resource request, so it needs indexes and probably a short per-user cache. |
| 6 | **Reference index and grants** | Transitive access (a security boundary), "used in", deletion guards, export, GC. | Parse derivative URIs on **every** path that writes a `scene.svx.json`: `put/document.ts`, `structuredDocMerge`, archive import, scene copy, history restore. Refuse new references the writer can't read directly. "Revoke from scene" action. |
| 7 | **Master format and ingestors** | No master concept exists. | Canonical `.gltf` writer, extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings. Port `toGlb`/`objToGlb`. |
| 8 | **Profile registry and output processors** | `optimizeGlb` writes one `.glb` with one preset. | Instance-level profiles. A `.gltf` writer whose resources are named by content hash. `.glb` for `ar-app`. `invalidate()`/`emit()`. |
| 9 | **Config schema and versioning** | Validation, per-profile defaults, stability across optimizer changes. | JSON schema with a `schema_version`. Only frame-preserving transformations. Compare each profile's section between versions to re-run only what changed. On enabling or disabling a profile, update the home scene's svx. |
| 10 | **Progress reporting from tasks** | Needed for `progress` and `X-Output-State`. | A throttled `context.progress(fraction)` hook. |
| 11 | **Placeholder generator** | Has to be fast on arbitrarily large inputs. | Start with the `Thumb` preset, then sampling or a bounding-box proxy. |
| 12 | **Cleanup reachability** | `cleanLooseObjects` only knows `files.hash`. | Add master resources, output resources (with the grace period from §7.3) and retained uploads. |
| 13 | **Export with output inlining** | Scene zips must stay self-contained. | Follow `scene_asset_refs`, copy outputs, rewrite URIs. |
| 14 | **glTF → USDZ converter** | `ar-ios` needs USDZ, and nothing in the stack produces it. | Evaluate Blender in headless mode, Pixar's `usd` tools, or three.js `USDZExporter`. |
| 15 | **Signed URLs for external AR apps** | Scene Viewer and Quick Look fetch without the user's session (§3.2). | A short-lived signed URL per output, requested by Voyager right before launching AR. |
| 16 | **Upload retention** | A bad conversion must stay recoverable. | Keep the upload blob for a configurable number of days, listed under `/assets/:id/inputs`. |
| 17 | **Fork and local replace** | Re-tuning or replacing a model without affecting other scenes (§5.1). | Fork = new asset + home scene, master pointing at the same blobs, own config. Replace from Voyager = new asset + repoint. |
| 18 | **Tuning UI, reachable from Voyager** | Goal 5 (§7.7). | Requirement for the Voyager design. A link to the home scene's settings page as a first version. |
| 19 | **Voyager upload path** | Voyager's editor must call `POST /assets` instead of PUTting files, then add a referencing model. | Requirement for the Voyager design. The PUT path stays for standalone, server-unaware Voyager. |
| 20 | **Scene list filter** | Uploads create many home scenes (§8). | UI plus a query parameter on `GET /scenes`. |

Worth deciding early:
- **External workers**: blocks 1 and 2 make heavy processing on dedicated machines a deployment choice rather than a redesign.
- **Quotas and storage tiering**: masters can be very large.

## 10. Open questions

1. **Is `thumb` enabled by default?** As an instance setting (proposed), or always?
2. **Scope of transitive access**: all of an asset's outputs (proposed), or only the profiles the referencing scene uses?
3. **Restricting publication**: do we need the "no grants to more visible scenes" flag (§6.3) from the start?
4. **Default view of the scene list**: hide home scenes by default, show them in a separate tab, or mix everything with a filter?
5. **Moving an asset**: should an asset be transferable to another home scene (e.g. when a home scene that's no longer wanted is deleted while still referenced)? The separate asset id makes it possible without breaking URLs.
6. **Non-model uploads**: should images eventually go through the same system?
7. **Upload retention**: what default grace period?

## 11. Alternatives considered

**Standalone asset entity (rev. 4).** A top-level asset with its own parallel ACL tables (same rules as scenes), its own listing, and a generated, read-only playground view. Dropped because:
- it duplicated the ACL system, listing, search, tags and viewer pages;
- its playground was a weaker version of what a scene already is (no annotations, no articles);
- it gave Voyager uploads no natural home.

Its advantage was a clean separation between the object and its presentations, with no extra scenes in lists. The current design keeps part of that separation: the asset is a resource of its own, whose access is borrowed from its home scene.

**Model scenes without an asset identity (rev. 5).** The scene itself owned the master, and outputs were served from an id-keyed `/outputs/:sceneId/…` collection. Dropped in favour of an explicit asset, owned by its home scene:
- `/assets/:id/{outputs,inputs,config}` groups everything that isn't scene content under one meaningful resource, instead of a technical alias keyed by scene id;
- a separate asset id leaves room to move an asset or relax the one-per-scene rule without changing stored URLs.

**Rejected URL schemes**, for the record:
- `/scenes/by-id/:id`: a reserved segment inside a free-text namespace, which still allows confusing scene names.
- A generic `/ids/:id`: doesn't say what is addressed, and would give the whole scene a second address.

## 12. Suggested phasing

1. **Foundations**: durable jobs (1), event bus + SSE (2, 3), progress hook (10). Useful on their own, e.g. live upload/task status.
2. **Masters**: ingestors (7), master storage, retention and cleanup (12, 16). The current upload pipeline keeps a master next to what it already produces. This doesn't depend on any other decision, and from then on every upload has something to re-derive from.
3. **Assets and outputs**: `POST /assets` (4), `/assets/:id` routes (5), profiles and processors for `web`, `thumb`, `ar-web` and `ar-app` (8), config (9), placeholder (11), state display on the home scene's page. The upload page switches to it.
4. **Cross-scene use**: reference index and grants (6), fork and local replace (17), export inlining (13), scene list filter (20).
5. **Voyager integration** (separate design): upload path (19), tuning UI (18), live swaps, adding derivatives.
6. **iOS AR and external apps**: USDZ (14), signed URLs (15).
