# Design: Server-managed 3D assets

> Status: **draft / request for comments**, revision 7
> Scope: server-side data model, processing pipeline, storage of masters, long-running jobs, and the HTTP contract Voyager will consume.
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
| What an upload produces | **An asset, owned by a scene (its *home scene*).** The asset holds the master versions, the config versions and the outputs. **A scene can own any number of assets.** The upload page creates a new scene plus its assets. Uploading in Voyager while editing scene A creates an asset owned by A, and no new scene (§3). |
| Entry point | **One server operation**, `POST /assets`, used both by the upload page and by Voyager's editor (§5.1). |
| Master | A new, versioned representation (`.gltf` + external resources) **stored outside `files`**, never visible in the home scene's file tree, WebDAV or exports. Exposed as the asset's *inputs* (§10). |
| Output format | **`.gltf` with external resources** by default. Profiles handed to an external AR app use the single-file format that app requires (§3.2). |
| What gets versioned | **Master and config are versioned. Outputs are not**: an output is a function of (master version, config version, pipeline) and can always be regenerated. |
| Master deduplication | **Not forced.** Uploading a file whose source hash matches an existing master gives a warning (and an offer to reuse it), nothing more. Bytes are deduplicated anyway at the blob level. |
| Outputs per asset | **A set**, one per *profile*. Voyager quality levels and AR variants are all profiles. New assets get `web` (Web3D/High) and maybe `thumb` (Web3D/Thumb). The rest is enabled when tuning (§3.2). |
| Who edits scene documents | **The server only writes a svx when the upload page creates a scene.** After that, scene documents are edited by users (through Voyager) only. Enabling a profile doesn't add derivatives to any scene: the editor offers to add it to the scene being edited, and other scenes must be revisited (§7.2). |
| Old output during regeneration | **Up to each processor**, depending on how long the run should take (§5.3). |
| Replacing a master | **Allowed, with no similarity requirement.** Consequences are surfaced, not prevented (§5.4). |
| Access control | **The scene ACL system, as is.** An asset's permissions are its home scene's. Read access is transitive through references: a user who can read an asset may publish its outputs in a more visible scene (§6). |
| URLs | **`/assets/:id`**, keyed by the asset's immutable id, separate from mutable scene names (§7.1). |
| Viewing an asset on its own | **A generated, read-only per-asset view** (§7.6). Its home scene may contain many other things. |
| Asset lifecycle | Assets can be **moved** to another home scene, or **extracted** into a new scene of their own. Deleting a scene never strands assets that other scenes use. Unused assets are cleaned up only once no version of any scene document references them (§8). |
| Long-running work | **Durable jobs**: an extension of the existing tasks table with leases, heartbeats, checkpoints, named queues and supersession (§11). |

### Non-goals (for this phase)

- Writing the Voyager integration. This document only lists what it must support.
- Choosing every converter for every input format.
- Migrating existing scenes. Plain model files in `scenes/<name>/models/` keep working as they do today.

## 2. What exists today

Server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. `writeFile` streams to `uploads/`, hashes, then renames into `objects/`. `copyFile` hashes in place, then hard-links. |
| Scenes | `scenes`, `vfs/Scenes.ts` | `scene_id` is a random 48-bit integer (`Uid.make()`) with a base64url string form (`Uid.toString`). `scene_name` is unique, free text, and **mutable**. All HTTP routes address scenes by name. |
| Scene ACL | `users_acl`, `groups_acl`, `UserManager.getAccessRights` | Owner, per-user and per-group levels, `public_access`/`default_access`, admin override. |
| Tasks | `tasks/scheduler.ts`, `tasks/manager.ts`, `tasks/queue.ts` | Rows in `tasks` (type, data, output, status, parent) and `tasks_logs`. Handlers are **in-memory closures** passed to `run()`. A row records its `type` (= handler name) but nothing a restarted process could use to resume. One in-process root queue (concurrency 4), nested queues (concurrency 1) for child tasks, a wall-clock watchdog (`task_timeout_seconds`, 3600). `reapOrphans()` marks every non-terminal task as failed at startup (`create.ts`). |
| Chunked uploads | `routes/tasks/post.ts`, `routes/tasks/task/artifacts/put.ts` | `POST /tasks` with `{type: "parseUserUpload", data: {filename, size}, status: "initializing"}`, then `PUT /tasks/:id/artifact` with `Content-Range` chunks into the task workspace. When the upload completes, `parseUserUpload` runs. **Resumable uploads already exist.** |
| Upload page pipeline | `tasks/handlers/uploads.ts` | `createSceneFromFiles`: OBJ goes through `toGlb`, then optionally `optimizeGlb` (one preset). The result is copied to `scenes/<name>/models/` and a `scene.svx.json` is generated. The upload is then dropped. It only returns once everything has finished. |
| Optimization | `tasks/handlers/optimizeGlb.ts` | gltf-transform pipeline driven by `TDerivativeQuality` presets. Becomes the first output processor. |
| Viewer pages | `routes/views/index.ts`, `templates/scene/explorer.hbs` | The explorer template takes a `scenePath` root. The history view uses it to point Voyager at `/history/…/show/`. |

Voyager (submodule `source/voyager`, at `f7a70e6`):

- **Uploading in the editor:** `CVMediaManager.uploadFile` PUTs the raw file at `<scene root>/<path>`. `ImportMenu` then asks for a parent model and a derivative quality chosen by hand. There's no conversion, no optimization, no inspection.
- **URI resolution:** `CVAssetManager.getAssetUrl(path)` resolves asset `uri`s with `new URL(path, baseUrl)`. **Root-relative and absolute URIs already load.** Scene-relative paths break under the history view's root, which is another reason for root-relative URIs.
- **External glTF resources:** `ModelReader.get(url)` resolves them against the URL *requested*, not the URL it was redirected to. **External resources must be reachable relative to the URL written in the svx.**
- **AR:** `CVARManager` looks for `Web3D/AR` (WebXR), `App3D/AR` (Scene Viewer, URL passed in an Android intent) and `iOSApp3D/AR` (Quick Look) derivatives.

## 3. Concepts

```
 upload page ──▶ new scene B + assets          Voyager, editing scene A ──▶ new asset owned by A
                         │                                                     │
 ┌──────── scene A (home scene of 2 assets) ─────────────────────────────────────────────────────┐
 │  ACL · page · scene.svx.json (models, annotations, tours, articles…)                          │
 │                                                                                               │
 │  owns ┌─ asset 7Kx9pQ2a "statue" ───────────────┐   ┌─ asset Rt4hW1xz "pedestal" ─┐           │
 │       │ inputs:  master v1 ── v2 ── v3          │   │ …                           │           │
 │       │ config:  v1 ── v2                       │   └─────────────────────────────┘           │
 │       │ outputs: web · thumb · ar-app (mutable) │                                             │
 │       └─────────────────────────────────────────┘                                             │
 └──────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                │ referenced by URL (+ grant, §6)
            scene C ────────────┘  uri: "/assets/7Kx9pQ2a/outputs/web/model.gltf"
```

- **Asset**: the processing unit behind one uploaded model: its master versions (inputs), config versions and outputs. It has an **immutable id** (`Uid`, base64url in URLs), a **name** (the source file name by default, renamable), and **no ACL of its own**.
- **Home scene**: the scene that owns an asset and provides its permissions. Each asset has exactly one home scene at a time. A scene can be home to any number of assets, or none (composite and legacy scenes). The home scene usually references its assets in its svx, but doesn't have to.
- **Upload**: the bytes the user sent. Kept for a configurable grace period after ingestion, then deleted unless pinned (§10.1).
- **Master**: the canonical form of the upload, a `.gltf` plus external resources (`.bin` buffers, original image files). Immutable per version. A new master version comes from replacing the source, re-ingesting a retained upload with a better converter, or restoring a previous version. Exposed under `/assets/:id/inputs`.
- **Config**: the transformation parameters for each profile, plus which optional profiles are enabled. A small JSON value with a schema and a `schema_version`. Each change is a new version.
- **Profile**: a kind of output, defined by the instance (not by users). It sets the format, the processor and the Voyager derivative it maps to.
- **Output**: one mutable slot per (asset, profile), holding the result of the current master and config. It moves from `placeholder` to `final`, and is replaced when the master or config changes. No history: a past output is reproduced by re-running the pipeline.
- **Reference**: a model entry in a scene's svx whose derivative URIs point at an asset's outputs. References from the home scene and from other scenes look exactly the same.

### 3.1 Why assets owned by scenes, several per scene

- **Permissions, listing, search, tags, thumbnails, archiving and viewer/editor pages stay the scene's.** There's no parallel system to maintain.
- **It matches how eCorpus is used:** "I add a model to my scene." Uploading in Voyager adds an asset to the scene being edited, as today, except that it now goes through the pipeline. No scene is created as a side effect, so there are no auto-named scenes and nothing extra in scene lists.
- **The upload page keeps its current shape**: a multi-file upload gives one scene with N assets.
- **The asset is a real resource with a stable address** (`/assets/:id`). It groups everything that isn't user-editable scene content: inputs, config, outputs, state. Because the asset has its own id, it can move to another home scene without any stored URL changing.

What it costs (each point is handled below):
- Viewing one asset on its own needs a generated view, since its home scene can contain anything (§7.6).
- Permissions are per scene. To share one model without its scene, reference it from another scene, or move or extract it (§6, §8).
- Assets can become unused (removed from the svx, replaced locally), so their cleanup has to take document history into account (§8).
- Deleting a scene must not strand assets that other scenes use (§8).
- Outputs must stay out of `files`, otherwise every refinement would create a file version (§4).
- One scene ACL covers the page, the outputs and the inputs, so input download needs a higher level than `read` (§6).

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

All blobs (uploads, master resources, output resources) go into the existing content-addressed store, `objects/<sha256>`. Bytes are stored once however many masters or outputs use them. None of these tables touch `files`: a home scene's file tree only contains what users put there.

The tables for inputs (`asset_uploads`, `asset_masters`, `asset_master_resources`) are detailed in §10.

```sql
CREATE TABLE assets (
  asset_id     BIGINT PRIMARY KEY,                    -- Uid.make(); base64url in URLs
  fk_scene_id  BIGINT NOT NULL REFERENCES scenes(scene_id),  -- home scene; many assets per scene.
                                                      -- No cascade: scene deletion handles assets explicitly (§8)
  name         TEXT NOT NULL,                         -- source file name by default; renamable
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted      TIMESTAMPTZ DEFAULT NULL               -- soft delete, see §8
);
CREATE INDEX assets_scene ON assets(fk_scene_id);

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
  fk_task_id        BIGINT REFERENCES tasks(task_id) ON DELETE SET NULL,  -- current durable job (§11)
  error             JSON,
  -- what is being served (may come from older inputs while a new run is in progress)
  level             output_level NOT NULL DEFAULT 'none',
  entry_hash        VARCHAR(43),            -- the .gltf, or the single .glb / .usdz file
  stats             JSONB NOT NULL DEFAULT '{}',
  mtime             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, profile)
);
-- asset_output_resources(fk_asset_id, profile, hash, size, mime): blobs the served .gltf references

-- References from the CURRENT document of every scene, home scenes included (§6.1)
CREATE TABLE scene_asset_refs (
  fk_scene_id  BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id),
  PRIMARY KEY (fk_scene_id, fk_asset_id)
);
CREATE INDEX scene_asset_refs_asset ON scene_asset_refs(fk_asset_id);

-- Grants for scenes other than the home scene (§6.2)
CREATE TABLE scene_asset_grants (
  fk_scene_id   BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_asset_id   BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  fk_granted_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, fk_asset_id)
);
```

## 5. Processing pipeline

### 5.1 One entry point: `POST /assets`

```
 client ──▶ POST /tasks {type:"parseUserUpload", status:"initializing"} ──▶ PUT /tasks/:id/artifact (chunks)
   │          (existing resumable upload, unchanged)
   ▼
 POST /assets { upload: <task id>, scene?: "A", name? }
   │   ├─ scene given  → needs write on A; the asset's home is A
   │   └─ no scene     → creates a new scene (upload page) and writes its initial svx
   ▼
 201 { asset id, home scene, output URLs }      ◀── returned before ingestion starts
   │
   ▼ durable jobs (§11)
 ingest ──▶ master v1 ──▶ output runs for the enabled profiles ──▶ events
```

- **The upload itself reuses the existing chunked upload** (`POST /tasks` + `PUT /tasks/:id/artifact`). `POST /assets` takes the id of a completed upload task, so it's a small JSON request whatever the file size. A multi-file upload (the upload page) passes several upload ids and gets one asset per model.
- **With `scene`** (Voyager, editing A): needs `write` on A. The asset is created with A as home. **The server doesn't touch A's svx.** Voyager adds the model, pointing at the returned output URLs, and saves A as usual.
- **Without `scene`** (upload page): creates a scene named after the upload (or the requested name), the uploader as owner, with the instance default permissions. The server writes that scene's initial `scene.svx.json`, with one model per asset pointing at the default profiles. That's the only svx the server ever writes.
- **It returns immediately** with the asset id(s), the home scene and the output URLs. Those URLs are stable before any content exists: they answer with `state: queued` until the first emit.
- Non-model uploads in the same request (images, articles…) are copied into the scene's files, as `createSceneFromFiles` does today.

Both entry points end in the same state, with the same tuning UI (§7.7).

**Replacing a model from Voyager stays local.** "Replace this model" while editing A creates a new asset in A and repoints A's model at it. The previous asset is left alone, since it may be referenced elsewhere, and becomes unused in A (§8). "Replace the source everywhere" is an explicit action on the asset itself (`POST /assets/:id/inputs`, §10.3).

**Forking.** A user who can write A but only read an asset owned elsewhere can't tune it. `POST /assets/:id/fork {scene: "A"}` creates a new asset owned by A, with a master pointing at the same blobs (almost free) and its own config, and returns its output URLs for Voyager to repoint the model.

Server-unaware clients (standalone Voyager) keep today's behaviour: a PUT into the scene folder creates a plain file, outside this system.

### 5.2 Ingestion (upload → master)

Detailed in §10.2. In short: one ingestor per input family, images copied byte for byte, geometry decoded, unknown extensions kept, the coordinate frame kept, and loss recorded as warnings. When it finishes, the server looks up `source_hash` among assets the user can read and reports duplicates (`duplicates: [{asset_id, name, scene}]`), so the UI can offer to reference the existing asset instead. Nothing is merged automatically.

### 5.3 Output runs

A run is a durable job (§11) that computes `(master vN, config vM) → output` for one profile, and calls `emit(level, dir)` zero or more times before it finishes:

1. **Placeholder**, target < 30 s whatever the input size. Aggressive simplification and small textures, or a bounding-box or point-sampled proxy for huge inputs.
2. **Final**, the actual config (today's `optimizeGlb` presets, adapted to write `.gltf` + resources).
3. **Partial** emits are optional, decided by the processor.

Each `emit` stores the new resources as blobs, updates `asset_outputs` in one transaction, then publishes an event (§7.5). Since the served level is in the DB, a run restarted after a crash knows what's already being served.

Runs for different profiles are independent jobs. `thumb` and `web` go to the interactive queue, the heavy work to the heavy queue (§11.4). A config change only re-runs the profiles whose section changed. A new master re-runs every profile. A new run **supersedes** the one in progress for the same profile (§11.5).

**What happens to the previous output during a re-run is up to the processor.** It gets two primitives: `invalidate()` (stop serving the previous output right away, `level` back to `none`) and `emit(...)` (replace whatever is served). A short run can keep the old output and emit once. A multi-hour run will probably emit a placeholder early. Clients only rely on `state`/`level` and events.

### 5.4 Consequences of unversioned outputs and replaceable masters

Referencing scenes don't pin a version: they always show the current outputs. Annotations, tours and transforms are stored in each scene's svx, in the model's coordinate frame.

- **Config changes never move the model**, since all outputs share the master's frame (§3.2).
- **Master replacement may move the model, and that's allowed.** Annotations in every scene referencing the asset (including old versions restored from history) may end up misplaced. The server makes it visible instead of preventing it:
  - before replacing, the UI shows the scenes referencing the asset (§6.1) and suggests forking instead when there are other scenes;
  - after ingestion, a large difference in bounds from the previous version is reported as a warning.

## 6. Access control

An asset's permissions are its home scene's: **the scene ACL system applies unchanged**, through the home scene. "Level on the asset" below means "level on its home scene".

| Action | Required level on the asset |
|---|---|
| Read asset data (`/assets/:id`), outputs, events | `read`, or transitive read through a referencing scene (§6.2) |
| Per-asset view (§7.6) | `read`, direct only |
| Reference the asset from another scene (creates a grant) | `read`, direct only (§6.2) |
| Rename, change config, enable/disable profiles, replace master | `write` |
| **Download inputs** (masters, retained upload) | **`write`**: a public scene must not expose huge and often sensitive masters to everyone |
| Move the asset to another scene / extract it | `admin` on the current home scene, plus `write` on the destination (or the `create` role to extract into a new scene) |
| Revoke a scene's grant, delete the asset | `admin` |
| Create an asset | `write` on the target scene, or the user role `create` for a new scene |

Scene permission changes never propagate between scenes.

### 6.1 Reference index

`scene_asset_refs` is rebuilt from the derivative URIs of the **current** `scene.svx.json` on every document write, **home scenes included** (an asset isn't implicitly "used" by its home scene anymore). It's used for:
- **Transitive access** (§6.2), together with grants.
- **"Used in N scenes"** on the asset, and warnings before changing its config or replacing its master.
- **Unused assets** (§8): assets that no current document references.
- **Scene deletion** (§8), **export** and **GC**.

### 6.2 Transitive read access

A user who can read an asset may reference its outputs in scene A, even if A is more visible than the asset's home scene. Readers of A can then load those outputs. The publisher already had the right to see them, so this isn't a permission violation.

- **A reference from the home scene needs no grant.**
- **A grant (A → asset) is created when a write to A's document adds a reference** to an asset owned elsewhere, if A has no grant for it yet. The writer must have **direct** `read` on the asset (that is, on its home scene). Otherwise the write is refused (`403`, naming the asset). This check stops someone from putting a random asset id in their own scene to read it.
- **Access doesn't chain.** Read access obtained through A doesn't let you grant the asset to another scene. One consequence: duplicating A checks the references again against the user making the copy.
- **Grants belong to the (scene, asset) pair, not to a document version.** A reference that's removed and comes back later (undo, history restore) needs no new check.
- **Effective read on asset X's data and outputs** for user U: `read(U, home(X)) OR EXISTS(scene A: read(U, A) AND ref(A, X) AND grant(A, X))`.
- **Moving an asset** to another home scene keeps existing grants. The old home scene gets a grant if it still references the asset.
- **Scope:** outputs, the public part of the asset data, and events. Not the per-asset view, not the inputs, not the config.

### 6.3 Changing the home scene's permissions doesn't break scenes

Scenes hold their own grants, so **changing the home scene's ACL only changes direct access**. Scenes that reference its assets keep working.
- The home scene's permission page lists, per asset, **which other scenes still give access to its outputs**, with their visibility.
- **"Revoke from scene"** (`admin`) deletes a grant and lists what breaks.

Possible extension, not proposed for now: a flag refusing grants to scenes more visible than the home scene.

## 7. Contract with Voyager

### 7.1 URL layout

Anything a document stores a URL to has to use an immutable id, in a namespace separate from (mutable, free-text) scene names:

```
POST   /assets                                         create asset(s) from completed upload(s) (§5.1)
GET    /assets/:id                                     asset data: name, home scene, profiles, state, warnings (§7.4)
PATCH  /assets/:id                                     rename; move to another home scene                 (§6)
DELETE /assets/:id                                     delete (refused while other scenes reference it)   (§8)
GET    /assets/:id/outputs/:profile/model.gltf         entry file: the only mutable URL per profile
GET    /assets/:id/outputs/:profile/res/<hash>.<ext>   immutable resources
GET    /assets/:id/inputs…                             masters and retained uploads                      (§10.3)
POST   /assets/:id/inputs                              new master version                                 (§10.3)
GET    /assets/:id/config · PUT /assets/:id/config     versioned config                                   (write)
POST   /assets/:id/fork                                new asset in another scene, sharing master blobs
POST   /assets/:id/extract                             move into a new scene of its own
GET    /assets/:id/view                                per-asset view: generated svx                      (§7.6)
GET    /assets/events?id=…&id=…                        notifications                                      (§7.5)
GET    /scenes/:name/assets                            assets owned by a scene, with "used in" and "unused" flags
```

- `:id` is the asset id in base64url (`Uid.toString`). It never changes, whatever happens to the home scene.
- Everything about scenes as scenes (page, document, ACL, tags) stays under `/scenes/:name/…`.
- `inputs` and `outputs` mirror each other: what goes into processing and what comes out. Inputs are never loaded by Voyager.

### 7.2 How scenes reference an asset

```jsonc
// any scene.svx.json, models[i]
"derivatives": [
  { "usage": "Web3D", "quality": "Thumb", "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/thumb/model.gltf" }] },
  { "usage": "Web3D", "quality": "High",  "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/web/model.gltf", "byteSize": 1234567, "numFaces": 200000 }] },
  { "usage": "App3D", "quality": "AR",    "assets": [{ "type": "Model", "uri": "/assets/7Kx9pQ2a/outputs/ar-app/model.glb" }] }
]
```

References from the home scene and from other scenes are identical, so moving a model between scenes is the same JSON. (Voyager's svx also uses the word "asset", for one file of a derivative. The two meanings don't collide in practice, but it's worth knowing when reading code.)

- **Root-relative URIs** resolve correctly from `/scenes/<name>/`, the history views, the per-asset view, the standalone viewer and embeds. They survive renames, moves and domain changes. They would break if eCorpus were served under a sub-path, which isn't supported today.
- **The svx is the only source of truth for which derivatives a scene uses, and the server never edits it after creation.** When a profile is enabled on an asset, no scene changes. Voyager's editor offers the outputs listed in the asset data that the scene doesn't use yet, and the user adds them. That's what happens when tuning from inside the editor. Other scenes have to be revisited. A derivative whose profile was disabled answers `404`.
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
Cache-Control: public, max-age=31536000, immutable   # "private" when the asset isn't public
```

- The served `.gltf` only references resources by content hash, as relative URIs, so Voyager's `extractUrlBase` resolves them correctly.
- **Atomic swaps**: a client that fetched the `.gltf` before a swap keeps loading consistent resources, because they're never overwritten.
- **Cheap refinement**: resources that don't change between emits keep their URL and stay cached.
- Resources from a replaced output stay readable for a grace period (minutes to hours), so clients that are mid-load don't get 404s.
- Single-file profiles (`.glb`, `.usdz`) are served like the entry `.gltf`.

### 7.4 Asset data (pull)

`GET /assets/7Kx9pQ2a`:

```jsonc
{
  "id": "7Kx9pQ2a",
  "name": "statue",
  "scene": { "id": "Qm3vT8cd", "name": "excavation-site" },   // home scene; name is informational
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
  "used_in": ["Qm3vT8cd", "Zp0aB2ef"]
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

### 7.6 Per-asset view

A home scene can hold many models, tours and articles, so viewing one asset on its own needs its own view:

- **URL:** `/ui/assets/:id/view`. It renders the existing `scene/explorer` template with `scenePath: "/assets/:id/view/"`, the same pattern as the history view.
- **`GET /assets/:id/view/scene.svx.json` is generated on every request and never stored**, as `createDocumentFromFiles` does today. It has one model with every enabled profile as a derivative, default lighting and environment, and the asset name as title. Unlike scenes, it always follows the current outputs, since there's nothing a user curated to protect.
- **Access:** direct `read` on the asset, **so it's public when the home scene is public**. Transitive access doesn't open it.
- **Read-only.** "Extract to its own scene" (§8) and "add to a scene" are the ways to start authoring.
- **Live:** it subscribes to the asset's events and swaps outputs as they're refined, and shows state and progress around the viewer. It's a natural first target for Voyager's server-awareness: simpler than a scene, and every asset has one.
- Also useful later: rendering the asset's thumbnail for listings.

### 7.7 Tuning UI

The same tuning UI must be reachable from:
- the upload flow, right after upload;
- the per-asset view and the scene's asset list (`/scenes/:name/assets`);
- **inside Voyager's editor, from any model that references an asset.** This is where "uploads through Voyager are first class" (goal 5) is either kept or lost.

It shows the enabled profiles, their settings, their state and progress, and the "used in N scenes" warning, which must be prominent since tuning can affect scenes the user isn't looking at. When a profile is enabled from the editor, it offers to add the matching derivative to the scene being edited (a client-side change, saved with the scene). It offers "fork" when the user can't write the asset. It talks to `/assets/:id/config` and `/assets/:id/inputs`. Implementation options: a Voyager panel calling those routes, or an eCorpus web component embedded in Voyager. A link to the per-asset view with its settings is the cheap first version. This is a requirement for the Voyager design.

## 8. Lifecycle and other consequences

### 8.1 Unused assets

An asset is **unused** when no current scene document references it (`scene_asset_refs` is empty for it). That happens when a model is removed from the svx, or replaced locally from Voyager.

- `/scenes/:name/assets` lists the scene's assets and flags unused ones, with their storage size (masters can be huge). Users can delete them explicitly.
- **Automatic cleanup must take document history into account.** Restoring an old version of a scene may bring back a reference to an asset that was cleaned up. Proposal: an unused asset is cleaned up automatically only when **no retained document version of any scene** references it, and it has been unused for longer than a grace period. Its lifetime then follows document history retention: once old document versions are pruned by the VFS cleanup policy, the assets only they referenced go too.
- That needs a historical index: a `doc_asset_refs(fk_file_id, fk_asset_id)` table filled on every document write. The alternative is to scan document history during cleanup. It's slower, but needs no new table, and cleanup is a background task (open question 4).
- **Deletion is soft first** (`assets.deleted`): outputs answer `410 Gone` and inputs are kept for a grace period, so a mistaken delete can be undone. After that, cleanup removes the rows and blobs.

### 8.2 Moving and extracting assets

- **Move** (`PATCH /assets/:id {scene}`): changes the home scene. URLs don't change. Existing grants stay, and the old home scene gets a grant if it still references the asset.
- **Extract** (`POST /assets/:id/extract`): creates a new scene (named after the asset), moves the asset into it, and writes the new scene's initial svx with that one model. That's the way to give an asset its own page, permissions and annotations.

### 8.3 Other consequences

| Area | Consequence | Proposed handling |
|---|---|---|
| Deleting a scene | Its assets may be referenced by other scenes. | Assets referenced elsewhere are **extracted automatically** into new scenes owned by the asset's author (or the deleting user), and the response lists them. Other assets are soft-deleted with the scene. Deleting a scene is never blocked by its assets. |
| Archiving a scene | Its assets keep serving their outputs to referencing scenes. | Grants and outputs are kept. |
| Renaming a scene | No effect (references use asset ids). | — |
| Scene zip export | The svx points to `/assets/…`. | Export follows `scene_asset_refs`: copy each referenced output into the archive and rewrite the URIs. Inputs are never exported. |
| Scene history | Restoring an old version shows the *current* outputs. Assets it referenced may have been deleted. | Accepted for outputs (config changes keep annotations aligned, a master replacement may not, §5.4). History-aware cleanup (§8.1) keeps referenced assets alive. Explicitly deleted ones answer `410`. |
| Scene duplication | Copying A copies its references. The assets stay owned by A, and the copy gets grants (checked against the user making the copy). | Assets aren't copied. "Copy with assets" could fork each asset into the new scene if needed later. |
| WebDAV | Inputs and outputs don't appear in any scene tree. | Fine for now. |
| Legacy scenes | Existing scenes keep plain files in `models/`. | Both coexist. A later action can turn a scene model into an asset, using the current `.glb` as a (degraded) master. |
| Cross-origin embedding | Root-relative URIs load from the embedding origin. | Out of scope. That case already breaks today. |

## 9. Missing building blocks

| # | Building block | Why | Notes |
|---|---|---|---|
| 1 | **Durable jobs** | Output runs last up to hours and must survive restarts (§11). | Leases, heartbeats, checkpoints, registry of resumable handlers, named queues, supersession, cancellation. Replaces `reapOrphans()` for durable work. |
| 2 | **Event bus** | Something has to connect "output emitted" (in a job) to "SSE clients" (in HTTP handlers). Neither exists. | Postgres `LISTEN/NOTIFY` plus an `events` table for replay. Shared with job wake-ups (§11.3). |
| 3 | **SSE endpoint infrastructure** | No streaming route exists. | Auth, heartbeats, connection limits, documented reverse-proxy settings. |
| 4 | **`POST /assets`** | The single entry point (§5.1). | Takes completed upload task ids, an optional target scene, and answers right away. Scene creation and initial svx for the upload page. Replaces `createSceneFromFiles`. |
| 5 | **`/assets/:id` routes** | Stable, id-based access (§7.1). | Access is resolved through the home scene, plus `ref AND grant` for transitive reads. That check runs on every resource request, so it needs indexes and probably a short per-user cache. |
| 6 | **Reference index and grants** | Transitive access (a security boundary), "used in", unused assets, export, GC. | Parse derivative URIs on **every** path that writes a `scene.svx.json`: `put/document.ts`, `structuredDocMerge`, archive import, scene copy, history restore. Refuse new references the writer can't read directly. |
| 7 | **Blob store API and master storage** | Masters need content-addressed storage outside `files` (§10). | Factor `vfs.writeFile`/`copyFile` hashing into a blob API. `asset_uploads`, `asset_masters`, `asset_master_resources`. Materialization into job workspaces through hard links. |
| 8 | **Ingestors** | No master concept exists (§10.2). | Canonical `.gltf` writer, extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings, validation report. Port `toGlb`/`objToGlb`. |
| 9 | **Profile registry and output processors** | `optimizeGlb` writes one `.glb` with one preset. | Instance-level profiles. A `.gltf` writer whose resources are named by content hash. `.glb` for `ar-app`. `invalidate()`/`emit()`. |
| 10 | **Config schema and versioning** | Validation, per-profile defaults, stability across optimizer changes. | JSON schema with a `schema_version`. Only frame-preserving transformations. Compare each profile's section between versions to re-run only what changed. |
| 11 | **Placeholder generator** | Has to be fast on arbitrarily large inputs. | Start with the `Thumb` preset, then sampling or a bounding-box proxy. |
| 12 | **Cleanup reachability** | `cleanLooseObjects` only knows `files.hash`. | Add uploads (until `retain_until`), master resources, output resources (with the grace period from §7.3). History-aware cleanup of unused assets (§8.1). |
| 13 | **Export with output inlining** | Scene zips must stay self-contained. | Follow `scene_asset_refs`, copy outputs, rewrite URIs. |
| 14 | **glTF → USDZ converter** | `ar-ios` needs USDZ, and nothing in the stack produces it. | Evaluate Blender in headless mode, Pixar's `usd` tools, or three.js `USDZExporter`. |
| 15 | **Signed URLs for external AR apps** | Scene Viewer and Quick Look fetch without the user's session (§3.2). | A short-lived signed URL per output, requested by Voyager right before launching AR. |
| 16 | **Move, extract, fork, scene deletion with extraction** | Asset lifecycle (§8.2, §8.3). | Includes the grant adjustments from §6.2. |
| 17 | **Per-asset view** | §7.6. | A generated svx (reusing `createDocumentFromFiles`) and a `/ui/assets/:id/view` route reusing the `scene/explorer` template. |
| 18 | **Tuning UI, reachable from Voyager** | Goal 5 (§7.7). | Requirement for the Voyager design. A link to the per-asset view as a first version. |
| 19 | **Voyager upload path** | Voyager's editor must call the chunked upload + `POST /assets {scene}` instead of PUTting files, then add a referencing model. | Requirement for the Voyager design. The PUT path stays for standalone, server-unaware Voyager. |
| 20 | **Scene asset list** | `/scenes/:name/assets` with "used in", unused flags and sizes (§8.1). | UI on the scene's settings page. |

Worth deciding early:
- **External workers**: durable jobs and the event bus make heavy processing on dedicated machines a deployment choice rather than a redesign (§11.8).
- **Quotas and storage tiering**: masters can be very large. Per-user quotas, and possibly a colder volume for masters.

## 10. Storing masters (draft)

### 10.1 Data model

Three layers: the **upload** (the original bytes, kept for a while), the **master versions** derived from it, and each master's **resources**.

```sql
-- The original upload, kept for re-ingestion and traceability. One upload can produce
-- several master versions (re-ingestion with a newer converter).
CREATE TABLE asset_uploads (
  upload_id    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  hash         VARCHAR(43) NOT NULL,          -- blob in objects/; also used for duplicate warnings
  name         TEXT NOT NULL,                 -- original file name
  mime         TEXT NOT NULL,
  size         BIGINT NOT NULL,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retain_until TIMESTAMPTZ,                   -- NULL = pinned (kept indefinitely)
  purged       TIMESTAMPTZ DEFAULT NULL       -- set when cleanup drops the blob; the row stays for traceability
);
CREATE INDEX asset_uploads_hash ON asset_uploads(hash);

-- Master versions: append-only, like `files` generations.
CREATE TABLE asset_masters (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  fk_upload_id BIGINT REFERENCES asset_uploads(upload_id),  -- NULL for a restore of a previous version
  gltf_hash    VARCHAR(43) NOT NULL,          -- the .gltf JSON, resource URIs relative to the master root
  converter    TEXT NOT NULL,                 -- "gltf-transform@4.1.0", "obj2gltf@3.1.6"…
  warnings     JSONB NOT NULL DEFAULT '[]',   -- anything lost or approximated
  validation   JSONB,                         -- glTF validator report summary (errors/warnings counts, messages)
  stats        JSONB NOT NULL DEFAULT '{}',   -- faces, vertices, bounds, image sizes, extensions, original units/up axis
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, generation)
);

CREATE TABLE asset_master_resources (
  fk_asset_id BIGINT NOT NULL,
  generation  INTEGER NOT NULL,
  uri         TEXT NOT NULL,                  -- exactly as written in the .gltf ("buffers/0.bin", "textures/albedo.jpg")
  hash        VARCHAR(43) NOT NULL,           -- blob in objects/
  size        BIGINT NOT NULL,
  mime        TEXT NOT NULL,
  PRIMARY KEY (fk_asset_id, generation, uri),
  FOREIGN KEY (fk_asset_id, generation) REFERENCES asset_masters ON DELETE CASCADE
);
CREATE INDEX asset_master_resources_hash ON asset_master_resources(hash);   -- cleanup reachability
```

- **The current master** is the highest generation, like `files`.
- **A master is a directory**: the `.gltf` JSON at `model.gltf`, plus resources at their relative `uri`. The JSON keeps ordinary relative URIs, and the resources table maps each one to a blob. Any glTF tool can read a master once it's materialized, and the HTTP routes serve it as-is.
- **Restoring a previous version** inserts a new generation pointing at the same `gltf_hash` and resource hashes, with no blob copied. That's the same approach as file restore in the VFS.
- **Forking** copies the master rows (not the blobs) into the new asset as its generation 1, with the same hashes.
- **URIs must be safe**: normalized, relative, no `..`, no absolute paths, no `data:` URIs (embedded data is extracted during ingestion). This is checked when a master is written, because those paths are later used to build directories.

### 10.2 Ingestion job

```
upload task (existing) ── file in artifacts/<task>/ ──▶ POST /assets
   │
   ├─ 1. hard-link the upload into objects/<hash>, insert asset_uploads (retain_until = now + grace)
   │
   └─ 2. enqueue durable job "ingest" {asset, upload}           (queue: interactive, §11.4)
           ├─ materialize the upload into the job workspace
           ├─ pick an ingestor (magic bytes + mime), run it → workspace/master/model.gltf + resources
           ├─ check URIs, run the glTF validator, compute stats
           ├─ for each file: hash → objects/<hash> (hard link)
           ├─ one transaction: insert asset_masters (next generation) + asset_master_resources
           ├─ duplicate lookup on asset_uploads.hash → warnings
           └─ enqueue output runs for the enabled profiles (supersedes any running ones)
```

Ingestor contract:

```ts
interface Ingestor {
  readonly name: string;                     // recorded with its version in asset_masters.converter
  accepts(mime: string, magic: Buffer): boolean;
  ingest(input: string, outDir: string, ctx: JobContext): Promise<{
    gltf: string;                            // path of the .gltf in outDir
    warnings: string[];
    stats: MasterStats;
  }>;
}
```

Rules for "as lossless as possible":
- **Images are copied byte for byte** (no re-encoding). glb-embedded images and `data:` URIs are extracted to files.
- **Geometry is decoded**: Draco and meshopt are decompressed so the master doesn't depend on decoders. Quantization that's already baked in is kept, not "restored".
- **Unknown glTF extensions are kept**: their JSON is passed through. If that isn't possible, record a `warning`.
- **The coordinate frame is kept.** Units and orientation are normalized to glTF conventions only when the source format defines them unambiguously, and the original values go into `stats`.
- Initial coverage: `glb`/`gltf` (gltf-transform), `obj` (obj2gltf, non-binary). A multi-file source (`.gltf` + `.bin` + textures, `.obj` + `.mtl` + textures) arrives as a zip and is unpacked into the workspace first.

Ingestion is short compared with output runs, but it can still take minutes for large files. Making it a durable job means a restart re-runs it from the retained upload. It's idempotent: re-running writes the same blobs and inserts the master row only once (the job's checkpoint records the generation it created).

**Materializing a master** for a job (output runs, re-ingestion) hard-links each blob into `workspace/master/<uri>` and writes `model.gltf` the same way. It's cheap and copies no bytes, because `objects/`, `uploads/` and `artifacts/` are on the same volume (already required by `vfs/Base.ts`). Jobs must treat materialized files as read-only, since they're hard links to the store.

### 10.3 Routes

All input routes need `write` on the asset.

```
GET  /assets/:id/inputs
     → { masters: [{ generation, ctime, author, converter, warnings, validation, stats,
                     upload: { id, name, size, purged } | null, current: bool }],
         uploads: [{ id, name, mime, size, ctime, retain_until, purged }] }

GET  /assets/:id/inputs/masters/:generation/                 → resource listing (uri, size, mime)
GET  /assets/:id/inputs/masters/:generation/model.gltf       → the master's .gltf
GET  /assets/:id/inputs/masters/:generation/<uri…>           → one resource (ETag = hash, immutable)
GET  /assets/:id/inputs/masters/:generation.zip              → the whole master, streamed as a zip
GET  /assets/:id/inputs/uploads/:upload_id                   → the original file (while not purged)

POST /assets/:id/inputs  { upload: <completed upload task id> }   new source → new upload + ingest
POST /assets/:id/inputs  { reingest: <upload_id> }                 re-run ingestion on a retained upload
POST /assets/:id/inputs  { restore: <generation> }                 new generation pointing at an old master's blobs
     → 202 { generation (once known), job: <task id> }   followed through events and asset data

PATCH /assets/:id/inputs/uploads/:upload_id  { pinned: true|false }   keep the original indefinitely (admin)
```

- `masters/:generation/` mirrors a directory, so a master can be opened directly in tools that load a `.gltf` from a URL.
- `restore` doesn't involve ingestion. It inserts the generation right away and enqueues output runs.
- Every new master generation re-runs every enabled profile, and triggers the "used in N scenes" warning beforehand in the UI (§5.4).

### 10.4 Retention and cleanup

- **Uploads** are kept until `retain_until` (default: instance setting, e.g. 30 days after ingestion), or indefinitely when pinned. Cleanup then drops the blob (if nothing else references the hash) and sets `purged`. The row stays, so masters keep their provenance.
- **Master versions** are kept as long as the asset exists. A later policy may prune old generations (keep the current one, the first one, and those less than N days old). Unlike outputs, a pruned master can't be regenerated, so pruning should be explicit or very conservative.
- **Cleanup reachability** (`cleanLooseObjects`) must treat as live any hash in `files`, `asset_uploads` (not purged), `asset_masters.gltf_hash`, `asset_master_resources`, `asset_outputs.entry_hash` and `asset_output_resources`, plus output resources inside their grace period.

## 11. Long-running tasks (draft)

### 11.1 The problem with the current scheduler

The current `TaskScheduler` suits short, nested work that a caller waits on:
- handlers are closures passed to `run()`, so nothing in the database says how to resume a task;
- the queue lives in the process: a restart loses it, and `reapOrphans()` marks every unfinished task as failed;
- a single root queue (concurrency 4) means one multi-hour optimization takes a quarter of the capacity, and four of them block uploads;
- the watchdog is wall-clock based (default 1h), and that can't be the right limit both for a placeholder and for a 6-hour texture compression;
- cancellation only exists as an `AbortSignal` held in memory by whoever started the task.

### 11.2 Durable jobs: an extension of tasks, not a new system

Keep `tasks` as the single table (logs, task tree, task UI and permissions all keep working), and mark some tasks as **durable**. A durable task is defined entirely by its row: a registered `type` plus JSON `data`. Any process can pick it up, and restarting it from scratch or from a checkpoint is safe.

```sql
ALTER TYPE task_status ADD VALUE 'cancelled';

ALTER TABLE tasks
  ADD COLUMN durable        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN queue          TEXT,                      -- 'interactive' | 'heavy' | 'maintenance' (durable only)
  ADD COLUMN priority       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN run_after      TIMESTAMPTZ,               -- delayed start / retry backoff
  ADD COLUMN attempts       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts   SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN lease_owner    TEXT,                      -- worker id (hostname:pid:random)
  ADD COLUMN lease_until    TIMESTAMPTZ,               -- extended by heartbeats
  ADD COLUMN checkpoint     JSONB,                     -- handler-defined resume state
  ADD COLUMN progress       REAL,                      -- 0..1, best effort
  ADD COLUMN cancel_requested TIMESTAMPTZ,             -- cooperative cancellation
  ADD COLUMN supersede_key  TEXT;                      -- e.g. 'output:<asset>:<profile>' (§11.5)

-- Claiming: find runnable work fast
CREATE INDEX tasks_runnable ON tasks(queue, priority DESC, task_id)
  WHERE durable AND status = 'pending';
CREATE INDEX tasks_leases ON tasks(lease_until)
  WHERE durable AND status = 'running';
CREATE INDEX tasks_supersede ON tasks(supersede_key)
  WHERE supersede_key IS NOT NULL AND status IN ('pending', 'running');
```

Non-durable tasks keep behaving exactly as today, including `reapOrphans()`, which is restricted to `NOT durable`.

### 11.3 Claiming, leases and heartbeats

Each process runs a **job worker** next to the HTTP server, with one loop per queue:

```sql
-- claim one job (in a short transaction)
UPDATE tasks SET status = 'running', lease_owner = $worker, lease_until = now() + interval '60 seconds',
                 attempts = attempts + 1
WHERE task_id = (
  SELECT task_id FROM tasks
  WHERE durable AND queue = $queue AND status = 'pending'
    AND (run_after IS NULL OR run_after <= now())
  ORDER BY priority DESC, task_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

- `FOR UPDATE SKIP LOCKED` is the standard Postgres job-queue pattern. Several workers, in one or several processes, never claim the same job.
- **Wake-up**: inserting a durable job does `NOTIFY jobs, '<queue>'`. Workers `LISTEN` and claim, with a periodic poll (e.g. every 10 s) as a fallback for missed notifications and `run_after`. This uses the same LISTEN connection as the event bus (building block 2).
- **Heartbeat**: while a job runs, the worker extends `lease_until` every ~20 s. The same query reads `cancel_requested`, and writes `progress` and `checkpoint` if they changed. That's one round-trip, and it's how cancellation reaches a job on another process.
- **Crash recovery replaces `reapOrphans()`**: a running job whose `lease_until` is in the past is put back to `pending` by any worker (with `run_after` backoff), or failed if `attempts >= max_attempts`. At startup, a process also releases leases still recorded under its own previous worker ids. No startup reaping is needed, and it works with several processes.
- **Graceful shutdown**: `TaskScheduler.close()` aborts running jobs with a "shutdown" reason. A job that observes it saves its checkpoint and throws `ShutdownError`. The worker puts the job back to `pending` **without** counting the attempt, and clears the lease.

### 11.4 Queues and limits

| Queue | For | Concurrency (per process, configurable) | Stall limit |
|---|---|---|---|
| `interactive` | ingestion, placeholders, `thumb`, short profiles | 2–4 | 10 min without heartbeat progress |
| `heavy` | final outputs, texture compression, USDZ | 1 (CPU-bound, may spawn external processes) | 1 h without progress, plus an optional max wall time per type |
| `maintenance` | cleanup, re-runs after a pipeline upgrade | 1 | as today |

- Durable jobs **don't use the global wall-clock watchdog**. They're stopped when they **stall**: the lease is fine but neither `progress` nor `checkpoint` has changed within the queue's stall limit. A long job that keeps making progress is allowed to run for hours. Handler types may also declare a hard maximum.
- Short in-process tasks (today's `run()`) are unchanged and keep their own queue. A durable job can still use `ctx.tasks.run()` for sub-steps. Those sub-steps are logged as children as today, but aren't durable: if the process dies, the job restarts from its last checkpoint and runs them again.
- Priority within a queue: interactive work for a scene someone currently has open (known from SSE subscriptions) can be bumped. That's an optional refinement.

### 11.5 Supersession and cancellation

- **Supersession**: a new output run for `(asset, profile)` is inserted with `supersede_key = 'output:<asset>:<profile>'`. In the same transaction, older `pending` jobs with that key are set to `cancelled`, and `cancel_requested` is set on a `running` one. The running job stops at its next heartbeat. A newer job on the same key doesn't wait: if the old one still emits before stopping, `emit()` checks that its job is still the output's current job (`asset_outputs.fk_task_id`) and ignores the emit otherwise. Late emits from superseded jobs never overwrite newer results.
- **User cancellation**: `DELETE /tasks/:id` (existing route) on a durable job sets `cancel_requested` instead of deleting the row while it's running.
- Cancellation is cooperative, as today: the job's `signal` is aborted, and processors must check it between steps and pass it to external processes (kill on abort).

### 11.6 Handler contract

```ts
interface DurableJobHandler<TData, TCheckpoint = unknown, TResult = unknown> {
  readonly type: string;            // registry key, stored in tasks.type
  readonly queue: "interactive" | "heavy" | "maintenance";
  readonly maxAttempts?: number;
  readonly maxDurationMs?: number;  // hard limit, on top of stall detection
  run(job: {
    task: TaskDefinition<TData>;
    checkpoint: TCheckpoint | null;               // last saved state, null on first attempt
    attempt: number;
  }, ctx: JobContext<TCheckpoint>): Promise<TResult>;
}

interface JobContext<TCheckpoint> extends TaskHandlerContext {
  signal: AbortSignal;                            // cancel, supersede, shutdown, stall
  checkpoint(state: TCheckpoint): Promise<void>;  // persisted at the next heartbeat (or immediately with flush)
  progress(fraction: number): void;               // throttled, also published as an event
  workspace: string;                              // persists across attempts (artifacts/<task_id>/)
}
```

- **Registry**: durable handlers are registered by `type` at startup, so a restarted process can resume them. Enqueueing a type that isn't registered is an error. That's stricter than today's `createUserTask`, which accepts any exported handler name with unvalidated data. Each durable handler validates its `data`.
- **Idempotence is required**: a job may run more than once (crash, lease expiry). Writes go through content-addressed blobs (naturally idempotent) and short transactions guarded by the checkpoint (e.g. "master generation 3 already inserted").
- **The workspace persists across attempts** (`artifacts/<task_id>/` isn't deleted on failure while the task is retryable), so expensive intermediate files survive a restart. Cleanup removes it when the task reaches a terminal state, as `cleanTaskArtifacts` does today.
- **Errors**: `BadRequestError`-like errors (invalid input, unsupported format) fail immediately without retry. Other errors are retried with exponential backoff (`run_after`) up to `maxAttempts`.

Output runs on top of this: the output processor wraps a `DurableJobHandler` and adds `emit()` and `invalidate()`. Its checkpoint records what was already emitted (`{emitted: "placeholder"}`), so a restarted run doesn't redo the placeholder.

### 11.7 Observability

- Durable jobs appear in the existing task views, with `queue`, `attempts`, `progress`, lease owner and checkpoint summary. Each attempt starts with a log line (`attempt 2/3, resumed from checkpoint …`) in the same `tasks_logs`.
- Admin view: queue depths, running jobs per worker, stalled and failed jobs, and a "retry" action (resets `attempts`, sets `pending`).
- `progress` changes are published on the event bus, so the asset events (§7.5) and the task UI get them without polling.

### 11.8 Toward external workers

Nothing above assumes the worker runs inside the HTTP process: claiming, leases, heartbeats, checkpoints and wake-ups all go through Postgres. A dedicated worker process (`node server/worker.js --queues heavy`) can run on a separate machine, provided it shares the storage volume (blobs and workspaces are hard links on the same filesystem). Object storage is a separate, later design. The HTTP process can then run with `heavy` concurrency set to 0.

### 11.9 Migration path

1. Add the columns, the registry and the worker loops. Restrict `reapOrphans()` to non-durable tasks.
2. Make `cleanup` a `maintenance` job (low risk, already periodic in `create.ts`) to validate the machinery.
3. Implement ingestion and output runs as durable jobs from the start (they're new code).
4. Leave the existing upload-page tasks as they are until `POST /assets` replaces them.

## 12. Open questions

1. **Is `thumb` enabled by default?** As an instance setting (proposed), or always?
2. **Scope of transitive access**: all of an asset's outputs (proposed), or only the profiles the referencing scene uses?
3. **Restricting publication**: do we need the "no grants to more visible scenes" flag (§6.3) from the start?
4. **History-aware cleanup**: maintain a `doc_asset_refs` table on every document write (proposed), or scan document history during cleanup?
5. **Scene deletion**: extract referenced assets automatically (proposed), or ask the user first?
6. **Upload retention**: what default grace period, and should master versions ever be pruned automatically?
7. **Non-model uploads**: should images eventually go through the same system?

## 13. Alternatives considered

**Standalone asset entity (rev. 4).** A top-level asset with its own parallel ACL tables (same rules as scenes), listing and a generated playground. Dropped because it duplicated the ACL system, listing, search, tags and viewer pages, and gave Voyager uploads no natural home. The current design keeps its generated per-asset view.

**Every upload creates its own scene (rev. 5 and 6).** First as "model scenes" owning a master, with outputs at `/outputs/:sceneId/…`, then as one asset per home scene under `/assets/:id`. The home scene was the asset's page, which avoided a generated view. Dropped because uploading from Voyager created a scene as a side effect every time: auto-naming, name collisions, noisy scene lists, and a model that lived in a different scene from the one the user was editing. The current design keeps from rev. 6 the `/assets/:id` namespace and the separate asset id, which is what makes several assets per scene, and moving them, possible without changing stored URLs.

**Rejected URL schemes**: `/scenes/by-id/:id` (a reserved segment inside a free-text namespace, which still allows confusing scene names), a generic `/ids/:id` (doesn't say what's addressed), and `/outputs/:sceneId` (keyed by the scene, so it can't hold several assets per scene).

**A separate job system** (e.g. a dedicated queue library or service) instead of extending `tasks`. Not proposed: the tasks table already has logs, a task tree, UI and permissions, and Postgres `SKIP LOCKED` + `LISTEN/NOTIFY` covers what's needed at eCorpus's scale without new infrastructure.

## 14. Suggested phasing

1. **Foundations**: durable jobs (1, §11), event bus + SSE (2, 3). Validate the job machinery on cleanup.
2. **Masters**: blob store API and master storage (7, §10), ingestors (8), retention and cleanup (12). The current upload pipeline keeps a master next to what it already produces. This doesn't depend on any other decision, and from then on every upload has something to re-derive from.
3. **Assets and outputs**: `POST /assets` (4), `/assets/:id` routes (5), profiles and processors for `web`, `thumb`, `ar-web` and `ar-app` (9), config (10), placeholder (11), per-asset view (17), scene asset list (20). The upload page switches to it.
4. **Cross-scene use and lifecycle**: reference index and grants (6), move/extract/fork and scene deletion (16), export inlining (13), history-aware cleanup (§8.1).
5. **Voyager integration** (separate design): upload path (19), tuning UI (18), live swaps, adding derivatives.
6. **iOS AR and external apps**: USDZ (14), signed URLs (15).
