# Design: Server-managed 3D models

> Status: **draft / request for comments**, revision 5
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
| Where models live | **Every model upload creates a scene** that owns the master: a *model scene* (§3). There is no separate asset entity. Other scenes reference a model scene's outputs. |
| Entry points | **One server operation**, "create a model scene from an upload", used both by the upload page and by Voyager's editor (§5.1). |
| Master | A new, versioned representation (`.gltf` + external resources) **stored outside `files`**, attached to its model scene but never visible in its file tree, WebDAV or exports (§4). |
| Output format | **`.gltf` with external resources** by default. Profiles handed to an external AR app use the single-file format that app requires (§3.2). |
| What gets versioned | **Master and config are versioned. Outputs are not**: an output is a function of (master version, config version, pipeline) and can always be regenerated. |
| Master deduplication | **Not forced.** Uploading a file whose source hash matches an existing master gives a warning (and an offer to reuse it), nothing more. Bytes are deduplicated anyway at the blob level. |
| Outputs per model | **A set**, one per *profile*. Voyager quality levels and AR variants are all profiles. New model scenes get `web` (Web3D/High) and maybe `thumb` (Web3D/Thumb). The rest is enabled when tuning (§3.2). |
| Scenes and newly enabled outputs | **Referencing scenes don't pick up new outputs by themselves.** Their svx is the only source of truth. Someone has to revisit a scene to add, for example, an AR derivative. The model scene's own document is updated when it's tuned (§7.1). |
| Old output during regeneration | **Up to each processor**, depending on how long the run should take (§5.3). |
| Replacing a master | **Allowed, with no similarity requirement.** Consequences are surfaced, not prevented (§5.4). |
| Access control | **The scene ACL system, as is.** Read access is transitive through references: a user who can read a model scene may publish its outputs in a more visible scene (§6). |
| Stable URLs | Stored references use the model scene's **immutable id**, in a top-level namespace separate from scene names (§7.1). |
| Viewing a model on its own | **The model scene itself** (§7.5). |

### Non-goals (for this phase)

- Writing the Voyager integration. This document only lists what it must support.
- Choosing every converter for every input format.
- Migrating existing scenes. Plain model files in `scenes/<name>/models/` keep working as they do today.

## 2. What exists today

Server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. |
| Scenes | `scenes`, `vfs/Scenes.ts` | `scene_id` is a random 48-bit integer (`Uid.make()`) with a base64url string form (`Uid.toString`). `scene_name` is unique, free text, and **mutable** (`routes/scenes/scene/patch.ts` renames). All HTTP routes address scenes by name. `scene_type` (`voyager` \| `html`) already exists. |
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
   ▼  "create model scene from upload"
 ┌──────────────── scene B "statue" (id 7Kx9…) — a model scene ─────────────────┐
 │  master  v1 ── v2 ── v3   (versioned, hidden: not in files/WebDAV/exports)   │
 │  config  v1 ── v2         (versioned)                                        │
 │      │                                                                       │
 │      ▼ derive, per enabled profile                                           │
 │  outputs: web (.gltf) · thumb (.gltf) · ar-app (.glb) · …                    │
 │           mutable, not versioned, served at /outputs/7Kx9…/<profile>/…       │
 │                                                                              │
 │  scene.svx.json: one model, whose derivatives point at the outputs above,    │
 │                  + whatever the user adds (annotations, articles, tours…)    │
 └───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ referenced by URL (+ grant, §6)
                 scene A ────────────┤  uri: "/outputs/7Kx9…/web/model.gltf"
                 scene C ────────────┘
```

- **Model scene**: a scene that owns a master. It's an ordinary scene in every other respect: users can open it, annotate it, write articles, change its permissions. "Model scene" is a **derived property** (a master row points at it), not a new `scene_type`. The one hard rule is **at most one master per scene**.
- **Upload**: the bytes the user sent. Transient. Deleted after a successful ingestion, with a configurable grace period.
- **Master**: the canonical form of the upload, a `.gltf` plus external resources (`.bin` buffers, original image files). Immutable per version. A new master version comes from replacing the source, or from re-ingesting with a better converter.
- **Config**: the transformation parameters for each profile, plus which optional profiles are enabled. A small JSON value with a schema and a `schema_version`. Each change is a new version.
- **Profile**: a kind of output, defined by the instance (not by users). It sets the format, the processor and the Voyager derivative it maps to.
- **Output**: one mutable slot per (model scene, profile), holding the result of the current master and config. It moves from `placeholder` to `final`, and is replaced when the master or config changes. No history: a past output is reproduced by re-running the pipeline.
- **Reference**: a model entry in some scene's svx whose derivative URIs point at another scene's outputs. A model scene's own svx references its own outputs the same way.

### 3.1 Why model scenes rather than a separate asset entity

The previous revision of this design had a separate `/assets` entity, with its own ACL tables, routes, listing and playground view. Model scenes replace all of that with existing machinery:

- **Permissions are the scene system**, not a parallel copy of it.
- **Viewing a model on its own is just opening its scene**, which can carry the object's own annotations and articles.
- **Listing, search, tags, thumbnails, archiving, and the explorer and editor pages** are reused.
- **The upload page keeps its current shape**: upload a file, get a scene.

What it costs (each point is handled below):
- Stored references need ids, because scene names are mutable (§7.1).
- Outputs must stay out of `files`, otherwise every refinement would create a file version (§4).
- One scene ACL now covers the scene's page, its outputs and its master, so master download needs a higher level than `read` (§6).
- Deleting and renaming scenes have to take references into account (§8).
- Scene lists need a "models" filter, because uploads from Voyager create scenes users didn't explicitly ask for (§8).

The asset-entity design is summarized in §11 as the alternative considered.

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

**All outputs of one model share the master's coordinate frame.** Voyager treats them as derivatives of one model and swaps between them with the same transform and annotations. Processors may decimate, retexture and compress, but never re-center, re-orient or rescale.

**AR apps fetch the file without the user's session.** Scene Viewer and Quick Look download the URL themselves, without cookies. AR outputs of a non-public model will fail to load there. The same problem exists today for AR files in private scenes. Possible fix: short-lived signed URLs (building block 15).

## 4. Storage model

All blobs (master resources, output resources) go into the existing content-addressed store, so bytes are stored once however many masters reference them. Masters could later move to a colder `masters_dir`, since they're never served to the web.

None of these tables touch `files`. A model scene's file tree contains only what users put there, plus its `scene.svx.json`.

```sql
-- Versioned like `files`: (scene, generation), append-only. At most one master lineage per scene.
CREATE TABLE scene_masters (
  fk_scene_id  BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  gltf_hash    VARCHAR(43) NOT NULL,      -- the .gltf JSON; resource URIs relative to the master root
  source_name  TEXT NOT NULL,             -- original upload name
  source_mime  TEXT NOT NULL,
  source_hash  VARCHAR(43) NOT NULL,      -- hash of the upload: duplicate warnings, traceability
  converter    TEXT NOT NULL,             -- "gltf-transform@4.x", "obj2gltf@3.x"…
  warnings     JSONB NOT NULL DEFAULT '[]', -- anything lost or approximated during ingestion
  stats        JSONB NOT NULL DEFAULT '{}', -- faces, vertices, bounds, image sizes, extensions
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, generation)
);
CREATE INDEX scene_masters_source ON scene_masters(source_hash);

CREATE TABLE scene_master_resources (
  fk_scene_id BIGINT NOT NULL,
  generation  INTEGER NOT NULL,
  uri         TEXT NOT NULL,      -- as written in the .gltf ("buffers/0.bin", "textures/albedo.jpg")
  hash        VARCHAR(43) NOT NULL,
  size        BIGINT NOT NULL,
  mime        TEXT NOT NULL,
  PRIMARY KEY (fk_scene_id, generation, uri),
  FOREIGN KEY (fk_scene_id, generation) REFERENCES scene_masters ON DELETE CASCADE
);

-- One config document per version, covering every profile:
-- { "schema_version": 1, "profiles": { "web": {"preset": "High"}, "ar-app": {"preset": "AR"} } }
-- A profile missing from `profiles` is disabled ("web" is always enabled).
CREATE TABLE scene_model_configs (
  fk_scene_id  BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  config       JSONB NOT NULL,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, generation)
);

-- Not versioned: one row per (scene, profile), overwritten in place.
CREATE TYPE output_state AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE output_level AS ENUM ('none', 'placeholder', 'partial', 'final');

CREATE TABLE scene_outputs (
  fk_scene_id       BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
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
  PRIMARY KEY (fk_scene_id, profile)
);
-- scene_output_resources(fk_scene_id, profile, hash, size, mime): blobs the served .gltf references

-- Cross-scene references and grants (§6)
CREATE TABLE scene_refs (
  fk_scene_id     BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE, -- referencing scene
  fk_model_scene  BIGINT NOT NULL REFERENCES scenes(scene_id),                   -- referenced model scene
  PRIMARY KEY (fk_scene_id, fk_model_scene)
);
CREATE INDEX scene_refs_model ON scene_refs(fk_model_scene);

CREATE TABLE scene_grants (
  fk_scene_id     BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_model_scene  BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_granted_by   BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, fk_model_scene)
);
```

## 5. Processing pipeline

### 5.1 One entry point: create a model scene from an upload

```
 upload page ─────────┐                                      ┌──▶ open scene B
                      ├──▶ POST "create model scene" ──▶ B ──┤
 Voyager (editing A) ─┘    (returns B's id + output URLs     └──▶ add a model to A whose derivatives
                            right away, before ingestion)         point at /outputs/<B>/…, grant A→B
                                   │
                                   ▼ background
                       ingest ──▶ master v1 ──▶ runs for the enabled profiles ──▶ events
```

The operation:
1. Receives the upload (resumable, for large files).
2. Creates scene B right away: name derived from the file name (suffixed if it collides, since names are unique), uploader as owner, instance default permissions. **Nothing is copied from A.** Writes B's `scene.svx.json` with one model whose derivatives point at B's default profiles.
3. **Returns immediately** with B's id, name and the output URLs. Those URLs are stable before any content exists: they answer with `state: queued` until the first emit.
4. Queues ingestion, then output runs.

When called from Voyager while editing scene A, the client then adds a model to A pointing at B's outputs, and saves A. The save creates the A → B grant (§6.2), which works because the uploader owns B.

Both entry points end in the same state, with the same tuning UI (§7.6). The only difference is what the client does with B afterwards: open it, or reference it.

**Replacing a model from Voyager stays local.** "Replace this model" while editing A creates a new model scene B′ and repoints A's model at it. It never pushes a new master version into B, which may be referenced elsewhere. "Replace the source everywhere" is an explicit action on B itself (§5.4).

**Forking.** A user who can write A but only read B can't tune B. "Fork" creates B′ with a master pointing at the same blobs (almost free) and its own config, then repoints A. It's the way to re-tune a model you don't control without affecting other people's scenes.

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

When ingestion finishes, the server looks up `source_hash` among masters the user can read. If it finds a match, the result says so (`duplicates: [{scene_id, name}]`) so the UI can offer to reference the existing model scene instead (and delete the new one). Nothing is merged automatically.

### 5.3 Output runs

A run computes `(master vN, config vM) → output` for one profile, and calls `emit(level, dir)` zero or more times before it finishes:

1. **Placeholder**, target < 30 s whatever the input size. Aggressive simplification and small textures, or a bounding-box or point-sampled proxy for huge inputs.
2. **Final**, the actual config (today's `optimizeGlb` presets, adapted to write `.gltf` + resources).
3. **Partial** emits are optional, decided by the processor.

Each `emit` stores the new resources as blobs, updates `scene_outputs` in one transaction, then publishes an event (§7.4).

Runs for different profiles are independent tasks and may run in parallel. `thumb` and `web` get priority. A config change only re-runs the profiles whose section changed. A new master re-runs every profile. A new run cancels the one in progress for the same profile (`AbortSignal`).

**What happens to the previous output during a re-run is up to the processor.** It gets two primitives: `invalidate()` (stop serving the previous output right away, `level` back to `none`) and `emit(...)` (replace whatever is served). A short run can keep the old output and emit once. A multi-hour run will probably emit a placeholder early. Clients only rely on `state`/`level` and events.

### 5.4 Consequences of unversioned outputs and replaceable masters

Referencing scenes don't pin a version: they always show the current outputs. Annotations, tours and transforms are stored in each scene's svx, in the model's coordinate frame.

- **Config changes never move the model**, since all outputs share the master's frame (§3.2).
- **Master replacement may move the model, and that's allowed.** Annotations in B and in every scene referencing B (including old versions restored from history) may end up misplaced. The server makes it visible instead of preventing it:
  - before replacing, the UI shows the scenes referencing B (§6.1) and suggests forking instead when there are any;
  - after ingestion, a large difference in bounds from the previous version is reported as a warning.

## 6. Access control

Model scenes are scenes, so **the scene ACL system applies unchanged**. On a model scene:

| Action | Required level on the model scene |
|---|---|
| View the scene, read outputs, manifest, events | `read`, or transitive read through a referencing scene (outputs, manifest and events only, §6.2) |
| Reference it from another scene (creates a grant) | `read`, direct only (§6.2) |
| Edit its document (annotations, articles…) | `write` |
| Change config, enable/disable profiles, replace master | `write` |
| **Download the master** | **`write`**: a public model scene must not expose a huge and often sensitive master to everyone |
| Change ACL, archive, revoke a grant | `admin` |
| Create one (upload) | user role `create`, same as any scene |

Scene permission changes never propagate between scenes.

### 6.1 Reference index

`scene_refs` is rebuilt from the derivative URIs of the **current** `scene.svx.json` on every document write. A model scene's references to its own outputs aren't recorded. It's used for:
- **Transitive access** (§6.2), together with grants.
- **"Used in N scenes"** on the model scene, and warnings before changing its config or replacing its master.
- **Deletion and renaming guards** (§8).
- **Garbage collection and scene export** (§8).

### 6.2 Transitive read access

A user who can read model scene B may reference its outputs in scene A, even if A is more visible than B. Readers of A can then load those outputs. The publisher already had the right to see them, so this isn't a permission violation.

- **A grant (A → B) is created when a write to A's document adds a reference to B**, if A has no grant for B yet. The writer must have **direct** `read` on B. Otherwise the write is refused (`403`, naming B). This check stops someone from putting a random id in their own scene to read it.
- **Access doesn't chain.** Read access obtained through A doesn't let you grant B to another scene. Otherwise making A private again would no longer protect B. One consequence: duplicating A checks the references again against the user making the copy.
- **Grants belong to the (A, B) pair, not to a document version.** A reference that's removed and comes back later (undo, history restore) needs no new check.
- **Effective read on B's outputs** for user U: `read(U, B) OR EXISTS(scene A: read(U, A) AND ref(A, B) AND grant(A, B))`.
- **Scope:** outputs, the output part of the manifest, and events. Not B's own page, document, master or config.

### 6.3 Changing a model scene's permissions doesn't break scenes

Scenes hold their own grants, so **changing B's ACL only changes direct access to B**. Scenes that reference it keep working.
- B's permission page lists **which scenes still give access to its outputs**, with their visibility.
- **"Revoke from scene"** (`admin` on B) deletes a grant and lists what breaks. It's the only way, besides deleting B, to take access back from a referencing scene.

Possible extension, not proposed for now: a flag on B refusing grants to scenes more visible than B.

## 7. Contract with Voyager

### 7.1 Stable URLs and references

**Scene names are mutable, so stored references can't use them.** Scene ids are immutable, but they can't share the `/scenes/:name` namespace:
- Scene names are free text, so any id string is also a valid scene name.
- A reserved segment (`/scenes/by-id/:id`) makes some names special, still leaves confusing near-misses, and isn't resource-oriented.
- Restricting names to keep them from looking like ids would need a migration, and can't be done safely retroactively.

Proposal: **a top-level collection named after what it serves, keyed only by the immutable id.** The only thing a document stores a URL to is outputs, so:

```
/outputs/:sceneId/:profile/model.gltf         # sceneId = Uid.toString(scene_id), base64url
/outputs/:sceneId/:profile/res/<hash>.<ext>
/outputs/:sceneId                             # manifest (§7.3)
/outputs/events?id=…                          # notifications (§7.4)
```

- This follows a common pattern: mutable, human-friendly names for browsing, plus a separate id-keyed collection for stable references. GitHub's REST API does this, with `/repos/{owner}/{repo}` next to `/repositories/{id}`.
- It's resource-oriented: the outputs are a resource of their own, already stored outside the scene's file tree (§4). They aren't "the scene, addressed differently".
- Everything that isn't stored in documents stays under `/scenes/:name/…`, including master download, config, ACL and the tuning UI. Clients look those up fresh, so renames don't matter there.
- A generic `/ids/:id` namespace was considered and rejected. It would address scenes, users or groups by id without saying which, and it would be a second address for the whole scene, when only the outputs need one.

A scene referencing B:

```jsonc
// scene.svx.json of A, models[i]
"derivatives": [
  { "usage": "Web3D", "quality": "Thumb", "assets": [{ "type": "Model", "uri": "/outputs/7Kx9pQ2a/thumb/model.gltf" }] },
  { "usage": "Web3D", "quality": "High",  "assets": [{ "type": "Model", "uri": "/outputs/7Kx9pQ2a/web/model.gltf", "byteSize": 1234567, "numFaces": 200000 }] },
  { "usage": "App3D", "quality": "AR",    "assets": [{ "type": "Model", "uri": "/outputs/7Kx9pQ2a/ar-app/model.glb" }] }
]
```

B's own `scene.svx.json` uses the same URIs, so a model copied from B to A is the same JSON.

- **Root-relative URIs** resolve correctly from `/scenes/<name>/`, the history views, the standalone viewer and embeds, and survive renames and domain changes. They would break if eCorpus were served under a sub-path, which isn't supported today.
- **The svx is the only source of truth for which derivatives a scene uses.** A referencing scene doesn't pick up profiles enabled later on B. Someone has to revisit it and add them, and the editor can offer the outputs listed in B's manifest that A doesn't use yet. A derivative whose profile was disabled answers `404`.
- **B's own document is updated when B is tuned.** Enabling or disabling a profile on B adds or removes the matching derivative in B's svx, in the same request (a user-initiated document write, going through the existing merge). Refinements never touch the document: they only change what's behind stable URLs.
- `byteSize`/`numFaces` are hints and may go stale. The live values are in the manifest.
- No svx schema change is needed.

To verify on the Voyager side: that `/outputs/…` URIs survive Voyager's save round-trip unchanged (`CVAssetManager.getAssetPath`).

### 7.2 Serving outputs

```
GET /outputs/7Kx9pQ2a/web/model.gltf            # the only mutable URL per profile
ETag: "<entry hash>"
Cache-Control: no-cache                          # always revalidate: cheap 304 while unchanged
Link: </outputs/7Kx9pQ2a>; rel="describedby"; type="application/json"
X-Output-Level: placeholder                      # none | placeholder | partial | final
X-Output-State: processing                       # queued | processing | ready | failed

GET /outputs/7Kx9pQ2a/web/res/<hash>.<ext>      # buffers and textures referenced by the .gltf
Cache-Control: public, max-age=31536000, immutable
```

- The served `.gltf` only references resources by content hash, as relative URIs, so Voyager's `extractUrlBase` resolves them correctly.
- **Atomic swaps**: a client that fetched the `.gltf` before a swap keeps loading consistent resources, because they're never overwritten.
- **Cheap refinement**: resources that don't change between emits keep their URL and stay cached.
- Resources from a replaced output stay readable for a grace period (minutes to hours), so clients that are mid-load don't get 404s.
- Single-file profiles (`.glb`, `.usdz`) are served like the entry `.gltf`.
- The master is downloadable from `/scenes/:name/master/…` (`write` on B). Voyager never loads it.

### 7.3 Manifest (pull)

`GET /outputs/7Kx9pQ2a`:

```jsonc
{
  "scene": { "id": "7Kx9pQ2a", "name": "statue" },   // name is informational; may change
  "master": { "generation": 3, "source_name": "statue.obj", "warnings": [] },
  "outputs": {
    "web": {
      "derivative": { "usage": "Web3D", "quality": "High" },
      "href": "/outputs/7Kx9pQ2a/web/model.gltf",
      "state": "processing", "progress": 0.42,
      "computing": { "master": 3, "config": 2 },
      "serving":   { "level": "placeholder", "master": 3, "config": 2, "numFaces": 2000, "bounds": { … } }
    },
    "ar-app": {
      "derivative": { "usage": "App3D", "quality": "AR" },
      "href": "/outputs/7Kx9pQ2a/ar-app/model.glb",
      "state": "ready",
      "serving": { "level": "final", "master": 3, "config": 2 }
    }
  },
  "events": "/outputs/events?id=7Kx9pQ2a"
}
```

Master details beyond the name and warnings, and the config, are only included for users with `write` on B. The manifest supports `ETag`/`If-None-Match`.

### 7.4 Change notifications (push)

`GET /outputs/events?id=7Kx9pQ2a&id=…` returns `text/event-stream` (Server-Sent Events).

- The client lists the model scenes it cares about, typically the ones its open scene references, and B itself in B's own view. One connection per open scene.
- Access is checked per id at connect time (§6.2).
- SSE rather than WebSockets: one-way traffic is all we need, it goes through ordinary auth/cookies and proxies, the browser has `EventSource` built in, and `Last-Event-ID` gives resume after reconnecting.

```
id: 1832
event: output
data: {"scene":"7Kx9pQ2a","profile":"web","state":"processing","progress":0.42}

id: 1833
event: output
data: {"scene":"7Kx9pQ2a","profile":"web","state":"ready","level":"final","etag":"…"}
```

Expected Voyager behavior (informative only): on a new `etag` for a profile the scene uses, reload that derivative and swap it in place. Events for profiles the scene doesn't use are ignored, except by the editor, which can offer them. Enabling or disabling a profile sends `state: "queued"` or `"removed"`.

The stream needs `X-Accel-Buffering: no`, no compression, a heartbeat every ~25 s, event ids that stay monotonic across restarts, and a bounded replay window. If a client's `Last-Event-ID` is too old, the server sends a `reset` and the client re-reads the manifests.

### 7.5 Viewing a model on its own

It's **the model scene itself**: `/ui/scenes/<name>/view`, as for any scene. It's public if B is public. There's no separate playground to build. On top of what any scene has:
- While `web` is at `none` or `placeholder`, the page shows the state and progress from the manifest around the viewer (eCorpus UI, no Voyager change).
- B's view subscribes to its own events and swaps outputs as they're refined. That's a natural first target for Voyager's server-awareness.

### 7.6 Tuning UI

The same tuning UI must be reachable from:
- B's scene page in eCorpus;
- the upload flow, right after upload;
- **inside Voyager's editor, from any model that references a model scene**, whether it's B itself or a scene A referencing B. This is where "uploads through Voyager are first class" (goal 5) is either kept or lost.

It shows the enabled profiles, their settings, their state and progress, and the "used in N scenes" warning. It offers "fork" when the user can't write B (§5.1). Implementation options for the Voyager side: a Voyager panel calling B's config API, or an eCorpus web component embedded in Voyager. A link to B's settings page is the cheap first version. This is a requirement for the Voyager design.

## 8. Other consequences

| Area | Consequence | Proposed handling |
|---|---|---|
| Scene lists | Every model upload creates a scene, including uploads from inside Voyager's editor. | A "models" filter (scenes that own a master), and probably a default view that separates models from composite scenes. |
| Scene renaming | No effect on references (ids), but the name is how people find a model. | Nothing to guard. Renaming stays free. |
| Deleting a model scene | Would break every scene that references it. | Refused while references exist. Archive instead, and outputs stay served. |
| Archiving | Archived model scenes keep serving outputs to referencing scenes. | Grants and outputs are kept. |
| Scene zip export | A composite scene's svx points to `/outputs/…`. | Export follows `scene_refs`: copy each referenced output into the archive and rewrite the URIs. Exporting a model scene includes its outputs, never its master. |
| Scene history | Restoring an old version shows the *current* outputs. | Accepted. Config changes keep annotations aligned. A master replacement may not (§5.4). |
| Scene duplication | Copying A copies references, and grants are checked again for the user making the copy. Copying a model scene B creates a scene that references B. It doesn't fork B. | The copy response lists models the user can't reference. Forking is an explicit action. |
| WebDAV | Masters and outputs don't appear in any scene tree. | Fine for now. |
| Legacy scenes | Existing scenes keep plain files in `models/`. | Both coexist. A later action could turn a scene model into a model scene, using the current `.glb` as a (degraded) master. |
| Cross-origin embedding | Root-relative URIs load from the embedding origin. | Out of scope. That case already breaks today. |

## 9. Missing building blocks

| # | Building block | Why | Notes |
|---|---|---|---|
| 1 | **Durable, resumable jobs** | Output runs last up to hours and must survive restarts. Today `reapOrphans()` fails every unfinished task on boot, and the watchdog kills anything past 1h. | Re-queue `queued`/`processing` output runs on boot instead of failing them. A separate time budget and separate queues, so long runs don't block placeholders, uploads or other tasks. |
| 2 | **Event bus** | Something has to connect "output emitted" (in a task) to "SSE clients" (in HTTP handlers). Neither exists. | Postgres `LISTEN/NOTIFY` plus an `events` table for replay. Works with one process now and with external workers later. |
| 3 | **SSE endpoint infrastructure** | No streaming route exists. | Auth, heartbeats, connection limits, documented reverse-proxy settings. |
| 4 | **"Create model scene" operation** | The single entry point (§5.1). Today `createSceneFromFiles` only returns once processing has finished. | Resumable upload, immediate response with id and output URLs, background ingestion and runs, name collision handling. Reused by the upload page and by Voyager. |
| 5 | **`/outputs` routes** | Stable, id-based serving (§7.1–7.4). | Entry files, hashed resources, manifest, events, with the access check `direct OR (ref AND grant)`. That check runs on every resource request, so it needs indexes and probably a short per-user cache. |
| 6 | **Reference index and grants** | Transitive access (a security boundary), "used in", deletion guards, export, GC. | Parse derivative URIs on **every** path that writes a `scene.svx.json`: `put/document.ts`, `structuredDocMerge`, archive import, scene copy, history restore. Refuse new references the writer can't read directly. "Revoke from scene" action. |
| 7 | **Master format and ingestors** | No master concept exists. | Canonical `.gltf` writer, extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings. Port `toGlb`/`objToGlb`. |
| 8 | **Profile registry and output processors** | `optimizeGlb` writes one `.glb` with one preset. | Instance-level profiles. A `.gltf` writer whose resources are named by content hash. `.glb` for `ar-app`. `invalidate()`/`emit()`. |
| 9 | **Config schema and versioning** | Validation, per-profile defaults, stability across optimizer changes. | JSON schema with a `schema_version`. Only frame-preserving transformations. Compare each profile's section between versions to re-run only what changed. On enabling or disabling a profile, update B's svx. |
| 10 | **Progress reporting from tasks** | Needed for `progress` and `X-Output-State`. | A throttled `context.progress(fraction)` hook. |
| 11 | **Placeholder generator** | Has to be fast on arbitrarily large inputs. | Start with the `Thumb` preset, then sampling or a bounding-box proxy. |
| 12 | **Cleanup reachability** | `cleanLooseObjects` only knows `files.hash`. | Add master resources, output resources (with the grace period from §7.2) and retained uploads. |
| 13 | **Export with output inlining** | Scene zips must stay self-contained. | Follow `scene_refs`, copy outputs, rewrite URIs. |
| 14 | **glTF → USDZ converter** | `ar-ios` needs USDZ, and nothing in the stack produces it. | Evaluate Blender in headless mode, Pixar's `usd` tools, or three.js `USDZExporter`. |
| 15 | **Signed URLs for external AR apps** | Scene Viewer and Quick Look fetch without the user's session (§3.2). | A short-lived signed URL per output, requested by Voyager right before launching AR. |
| 16 | **Upload retention** | A bad conversion must stay recoverable. | Keep the upload blob for a configurable number of days. |
| 17 | **Fork and local replace** | Re-tuning or replacing a model without affecting other scenes (§5.1). | Fork = new scene + master pointing at the same blobs + own config. Replace from Voyager = new model scene + repoint. |
| 18 | **Tuning UI, reachable from Voyager** | Goal 5 (§7.6). | Requirement for the Voyager design. A link to B's settings page as a first version. |
| 19 | **Voyager upload path** | Voyager's editor must call "create model scene" (4) instead of PUTting files, then add a referencing model. | Requirement for the Voyager design. The PUT path stays for standalone, server-unaware Voyager. |
| 20 | **Scene list "models" filter** | Uploads create many scenes (§8). | UI plus a query parameter on `GET /scenes`. |

Worth deciding early:
- **External workers**: blocks 1 and 2 make heavy processing on dedicated machines a deployment choice rather than a redesign.
- **Quotas and storage tiering**: masters can be very large.

## 10. Open questions

1. **Is `thumb` enabled by default?** As an instance setting (proposed), or always?
2. **Scope of transitive access**: all of B's outputs (proposed), or only the profiles A references?
3. **Restricting publication**: do we need the "no grants to more visible scenes" flag (§6.3) from the start?
4. **Default view of the scene list**: hide model scenes by default, show them in a separate tab, or mix everything with a filter?
5. **Route name**: `/outputs/:id` (proposed). Other candidates: `/models/:id` (clashes with the scene `models/` folder and Voyager's "model"), or `/derivatives/:id` (Voyager's vocabulary, but it names one derivative, not the set).
6. **Non-model uploads**: should images eventually go through the same system?
7. **Upload retention**: what default grace period?

## 11. Alternative considered: a separate asset entity

The previous revision (rev. 4) proposed a top-level `/assets/:id` entity, outside the scene hierarchy, holding the master, configs and outputs. It had parallel ACL tables (`assets_users_acl`, `assets_groups_acl`) using the same rules as scenes, scene → asset grants, and a generated, read-only playground view.

It was dropped in favour of model scenes because:
- it duplicated the ACL system, routes, listing, search, tags and viewer pages for a new entity;
- the playground was a weaker version of what a scene already is (no annotations, no articles);
- it gave Voyager uploads no natural "home". With model scenes, an upload from anywhere produces the same kind of object as the upload page.

What it did better:
- **A cleaner separation between "the object" and "a presentation of it."** A model scene is both, so one ACL covers its page, its outputs and its master. Master download needing `write` compensates for that.
- **No scene list noise.**

Everything else (masters, configs, profiles, unversioned outputs, events, transitive grants) carries over unchanged.

## 12. Suggested phasing

1. **Foundations**: durable jobs (1), event bus + SSE (2, 3), progress hook (10). Useful on their own, e.g. live upload/task status.
2. **Masters**: ingestors (7), master storage, retention and cleanup (12, 16). The current upload pipeline keeps a master next to what it already produces. This doesn't depend on any other decision, and from then on every upload has something to re-derive from.
3. **Model scenes and outputs**: "create model scene" (4), `/outputs` routes (5), profiles and processors for `web`, `thumb`, `ar-web` and `ar-app` (8), config (9), placeholder (11), state display on the scene page. The upload page switches to it.
4. **Cross-scene use**: reference index and grants (6), fork and local replace (17), export inlining (13), "models" filter (20).
5. **Voyager integration** (separate design): upload path (19), tuning UI (18), live swaps, adding derivatives.
6. **iOS AR and external apps**: USDZ (14), signed URLs (15).
