# Design: Server-managed 3D assets

> Status: **draft / request for comments**, revision 4
> Scope: server-side data model, processing pipeline and the HTTP contract Voyager will consume.
> Out of scope: the Voyager-side implementation.

## 1. Goals

For every 3D file a user uploads, eCorpus produces an **asset**. Voyager loads the asset's **outputs**: a set of derived files (at least a web glTF, optionally AR versions), each of which:

1. **Exists almost immediately**, even if it's only a rough placeholder.
2. **Is mutable**: it gets refined (progressively or in one go) as processing goes on, which may take 30s to several hours.
3. **Can be re-derived**: the user may change the transformation parameters (the *config*) afterwards, which replaces the output.
4. **Comes from a normalized source**, never from the raw upload: on ingestion, the upload is converted as losslessly as possible into a glTF with external resources (the *master*). All later processing starts from the master.

The server has to tell Voyager what is available and when it changes.

### Decisions so far

| Question | Decision |
|---|---|
| Where assets live | In a **new top-level hierarchy (`/assets`)**, outside of `scenes`. Masters are often too large to view on the web and have nothing to do in a scene tree. Outputs are attached to the master, so they live there too. Scenes reference outputs by URL. |
| Output format | **`.gltf` with external resources** by default (same family as the master). Profiles that get handed to an external AR app use the single-file format that app requires (§3.1). |
| What gets versioned | **Master and config are versioned. Outputs are not**: an output is a function of (master version, config version, pipeline) and can always be regenerated. |
| Master deduplication | **Not forced.** Uploading a file whose source hash matches an existing master gives a warning (and an offer to reuse it), nothing more. Bytes are deduplicated anyway at the blob level. |
| Outputs per asset | **A set**, one per *profile*. Voyager quality levels and AR variants are all profiles. New assets get `web` (Web3D/High) and maybe `thumb` (Web3D/Thumb). The rest is enabled per asset (§3.1). |
| Scenes and newly enabled outputs | **Scenes don't pick up new outputs by themselves.** The svx lists the derivatives the scene uses, and it's the only source of truth. If AR is enabled on an asset later, someone has to revisit the scene and add the AR derivative (§7.1). |
| Old output during regeneration | **Up to each processor.** It decides whether to drop the previous output right away or keep serving it until it emits something new, depending on how long the run should take (§5.2). |
| Replacing a master | **Allowed, with no similarity requirement.** The new master doesn't have to resemble the old one. The consequences for scenes are documented, not prevented (§5.3). |
| Access control | **Same system as scenes**: owner, per-user and per-group access levels, `default_access`, `public_access`. Same levels, same code (§6). Scene permissions are never copied onto assets. |
| Using an asset in a scene | **Read access is transitive through scenes.** A user who can use an asset may publish it in a scene that's more visible than the asset. Readers of that scene can then load the outputs it references. That isn't a permission violation (§6.2). Changing an asset's permissions must not silently break scenes that use it (§6.3). |
| Viewing an asset on its own | **A playground view** in voyager-explorer shows an asset without any scene. It's public if the asset is public (§7.5). |

### Non-goals (for this phase)

- Writing the Voyager integration.
- Choosing every converter for every input format. We only need the contract a converter has to fulfil.
- Migrating existing scenes. Plain model files in `scenes/<name>/models/` keep working as they do today.

## 2. What exists today

Relevant parts of the current server (as of `510cdd7`):

| Component | Where | What matters here |
|---|---|---|
| VFS files | `migrations/001-initial.sql`, `vfs/Files.ts` | Append-only `files` table keyed by `(scene, name, generation)`. Blobs are content-addressed in `objects/<sha256>`. That's the versioning pattern we can reuse for masters and configs. |
| Scene ACL | `scenes`, `users_acl`, groups | Per-scene owner / user / group access levels plus `public_access` / `default_access`. Assets reuse the same system (§6). |
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
                       │                ▼  derive(master vN, config vM) for each profile    │
                       │  output "web"     : .gltf  — always present                        │
                       │  output "ar-web"  : .gltf  ┐                                       │
                       │  output "ar-app"  : .glb   ├ optional, enabled per asset           │
                       │  output "ar-ios"  : .usdz  ┘                                       │
                       │  (each one: one slot, mutable, not versioned,                      │
                       │   state placeholder → partial → final)                             │
                       └───────────────────────────┬────────────────────────────────────────┘
                                                   │ referenced by URL
                   scene A  scene.svx.json ────────┤  uri: "/assets/42/web/model.gltf"
                   scene B  scene.svx.json ────────┘  (+ one derivative per enabled profile)
```

- **Asset**: the identity the user manages. Name, owner, ACL, and the current master and config. It lives under `/assets/:id` and is independent of any scene. Several scenes may use one asset.
- **Upload**: the bytes the user sent. Transient. Deleted after a successful ingestion, with a configurable grace period.
- **Master**: the canonical form of the upload, a `.gltf` plus external resources (`.bin` buffers, original image files). Immutable per version. A new master version comes from re-uploading or replacing the source, or from re-ingesting with a better converter.
- **Config**: the transformation parameters for each profile (target quality, decimation, texture size, compression…), plus which optional profiles are enabled. A small JSON value with a schema and a `schema_version`. Each change is a new version. Today's `TDerivativeQuality` presets become named starting points.
- **Profile**: a kind of output, defined by the instance (not by users). It sets the file format, the processor, and the Voyager derivative it maps to.
- **Output**: what Voyager loads. One mutable slot per (asset, profile), holding the result of the current master and config. It moves from `placeholder` to `final`, and gets replaced when the master or config changes. There's no history: a past output is reproduced by re-running the pipeline on the past master and config.

### 3.1 Profiles and AR

Voyager picks derivatives by `(usage, quality)` (`CVARManager`):

| Profile | Voyager derivative | Used by | Format | Enabled by default |
|---|---|---|---|---|
| `web` | `Web3D` / `High` | the viewer | `.gltf` + external resources | **yes** (always present) |
| `thumb` | `Web3D` / `Thumb` | the viewer: first thing shown while `High` loads | `.gltf` + external resources | probably (instance setting) |
| `low`, `medium`, `highest` | `Web3D` / `Low`, `Medium`, `Highest` | the viewer, by device/bandwidth | `.gltf` + external resources | no |
| `ar-web` | `Web3D` / `AR` | WebXR, inside the viewer | `.gltf` + external resources | no |
| `ar-app` | `App3D` / `AR` | Android Scene Viewer | `.glb` | no |
| `ar-ios` | `iOSApp3D` / `AR` | iOS Quick Look | `.usdz` | no |

Notes:
- The profile list (format, processor, derivative, default config, enabled by default) is configured on the server, not by users.
- `ar-app` is a single `.glb` because Voyager passes the URL to an external app in an Android intent. `ar-ios` is `.usdz` because Quick Look only takes USDZ, which needs a glTF → USDZ converter (building block 14).
- **`thumb` and the `web` placeholder aren't the same thing.** The placeholder is temporary: it's what the `web` slot serves while the real output is computed. `thumb` is a permanent, small derivative that Voyager loads first, then replaces with `High` (it already does this). A processor may reuse one for the other: when `thumb` finishes first, the `web` run can emit the same blobs as its placeholder at no extra storage cost.

**All outputs of one asset must share the master's coordinate frame.** Voyager treats them as derivatives of the same model and swaps between them (e.g. when entering AR) with the same transform and annotations. Processors may decimate, retexture and compress, but never re-center, re-orient or rescale.

**AR apps fetch the file without the user's session.** Scene Viewer and Quick Look download the URL themselves, without the browser's cookies. AR outputs of a non-public asset will fail to load in those apps. The same problem exists today for AR files in private scenes. Possible fix: short-lived signed URLs, generated by the server when Voyager asks to launch AR (building block 15).

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
  -- same columns, constraints and semantics as `scenes` (§6)
  public_access SMALLINT NOT NULL DEFAULT 1 CHECK(0 <= public_access AND public_access <= 1 AND public_access <= default_access),
  default_access SMALLINT NOT NULL DEFAULT 1 CHECK(0 <= default_access AND default_access <= 2)
);
-- Same shape as users_acl / groups_acl (migrations 001 and 003), keyed on assets
CREATE TABLE assets_users_acl (
  fk_user_id  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fk_asset_id BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  access_level SMALLINT NOT NULL CHECK(1 <= access_level AND access_level <= 3),
  UNIQUE(fk_user_id, fk_asset_id)
);
CREATE TABLE assets_groups_acl (
  fk_group_id BIGINT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  fk_asset_id BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  access_level SMALLINT NOT NULL CHECK(1 <= access_level AND access_level <= 3),
  UNIQUE(fk_group_id, fk_asset_id)
);

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

-- One config document per asset version, covering every profile:
-- { "schema_version": 1, "profiles": { "web": {"preset": "High"}, "ar-app": {"preset": "AR"} } }
-- A profile missing from `profiles` is disabled ("web" is always enabled, with defaults if omitted).
CREATE TABLE asset_configs (
  fk_asset_id  BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  generation   INTEGER NOT NULL,
  config       JSONB NOT NULL,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, generation)
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
  entry_hash        VARCHAR(43),            -- the .gltf, or the single .glb / .usdz file
  stats             JSONB NOT NULL DEFAULT '{}',
  mtime             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_asset_id, profile)
);
-- asset_output_resources(fk_asset_id, profile, hash, size, mime): blobs the served .gltf references
```

Because outputs aren't versioned, there's no row per refinement. The row says what's being computed (`master_generation`, `config_generation`, `state`) and what's being served (`level`, `entry_hash`). The two can differ while a new run is in progress, if the processor chose to keep the previous result (§5.2). Disabling a profile deletes its row, and cleanup collects its blobs.

## 5. Processing pipeline

```
upload task ──▶ ingest ──▶ master vN ──┐
                                       ├──▶ for each enabled profile:
            user edits config ─▶ vM ───┘      run(profile) ──▶ emit placeholder ──▶ emit partial* ──▶ emit final
                                              (cancels any run   each emit: write blobs, swap the served
                                               for older inputs)  entry file, publish an event
```

Runs for different profiles are independent tasks and may run in parallel. `thumb` and `web` get priority, since they're what the viewer shows. A config change only re-runs the profiles whose settings changed (comparing each profile's section between config versions). A new master re-runs every profile.

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
- **The coordinate frame is kept** (see §3.1). Units and orientation are normalized to glTF conventions only when the source format defines them unambiguously, and the original values go into `stats`.

Initial coverage: `glb`/`gltf` (gltf-transform), `obj` (obj2gltf, non-binary). Each new format (`fbx`, `ply`, `stl`, `usdz`, `e57`/`las`…) only means adding an ingestor.

When ingestion finishes, the server looks up `source_hash` among masters the user can read. If it finds a match, the upload result says so (`duplicates: [{asset_id, name}]`) so the UI can offer to reuse that asset. Nothing is merged automatically.

### 5.2 Output runs

A run computes `(master vN, config vM) → output`. It calls `emit(level, dir)` zero or more times before it finishes. Suggested default strategy:

1. **Placeholder**, target < 30 s whatever the input size. Aggressive simplification and small textures (roughly today's `Thumb` preset). For huge inputs, fall back to a bounding-box or point-sampled proxy built from the master's `stats`.
2. **Final**, the actual config (today's `optimizeGlb` presets, adapted to write `.gltf` + resources).
3. **Partial** emits are optional, decided by the processor. For example, geometry done but textures still raw.

Each `emit` stores the new resources as blobs, then updates `asset_outputs` (`level`, `gltf_hash`, resources) in one transaction, then publishes an event (§7.3).

A new master or config version starts a new run and cancels the one in progress (`AbortSignal`, which tasks already support).

**What happens to the previous output during a re-run is up to the processor.** The framework gives it two primitives:
- `invalidate()`: stop serving the previous output right away (`level` goes back to `none`, and the entry URL answers `404` with the manifest's `state`) until the next `emit`.
- `emit(...)`: replace whatever is served.

A processor that expects to finish in seconds can keep the previous output and emit once. A multi-hour processor will probably emit a fresh placeholder early. If a processor calls neither, the previous output stays served until its first emit. Clients only rely on the `state`/`level` fields and on events, never on a particular sequence.

### 5.3 Consequences of unversioned outputs and replaceable masters

A scene doesn't pin a version: it always shows the current outputs. Annotations, tours and the model transform are stored in the scene's `svx`, in the model's coordinate frame.

- **Config changes must not move the model.** That's already required because all outputs of an asset share a frame (§3.1), and processors aren't allowed to re-center, re-orient or rescale. So a config change never shifts annotations.
- **Master replacement may move the model, and that's allowed.** A new master can be anything: a better scan, a different object. Annotations in the scenes that reference the asset (including old scene versions restored from history) may then be misplaced. The server doesn't prevent it. It makes it visible:
  - before replacing, the UI shows the "used in N scenes" list from the reference index (§6.1);
  - after ingestion, the master's stats include its bounds, and a large difference with the previous version is reported as a warning in the upload result and the manifest.
- Orientation, scale and centering corrections belong in the scene's model transform, where Voyager already puts them.

## 6. Access control

Assets use **the same ACL system as scenes**: the same columns (`default_access`, `public_access`), the same levels (`none` / `read` / `write` / `admin`), per-user and per-group grants, and admin override. Only the tables are parallel (`assets_users_acl`, `assets_groups_acl`).

| Action | Required level on the asset |
|---|---|
| Read outputs, manifest, events | `read`, or transitive read through a scene (§6.2) |
| Playground view (§7.5) | `read` |
| Download the master | `read` |
| Use the asset in a scene (adds a grant) | `read`, direct only (§6.2) |
| Change config, enable/disable profiles, replace master | `write` |
| Change ACL, archive, revoke a scene's grant | `admin` |
| Create an asset (upload) | user role `create`, same as scene creation |

Implementation: `UserManager.getAccessRights(scene, uid)` and the ACL routes are written against `scenes`/`users_acl`/`groups_acl`. They should be generalized over a resource type (`scene` | `asset`) instead of duplicated, so both stay identical by construction (building block 4).

Rules that are specific to assets:
- **No copying of permissions from scenes.** A new asset gets the instance defaults, like a new scene: the uploader is owner, and `default_access`/`public_access` take their default values. If it was created from a scene upload, that scene automatically gets a grant (§6.2), so the scene works whatever the asset's own ACL says.
- **Scene permission changes never propagate to assets.**
- Reading an asset's outputs can also come **through a scene** (§6.2). Everything else (master, config, playground, ACL) requires access on the asset itself.

### 6.1 Reference index

`scene_asset_refs(fk_scene_id, fk_asset_id)` is rebuilt from the model URIs of the **current** `scene.svx.json` on every document write. It's used for:
- **Transitive access** (§6.2), together with grants.
- **"Used in N scenes"** on the asset page, and a warning before changing a config or replacing a master that affects other scenes.
- **Deletion**: an asset that's still referenced is archived, not deleted.
- **Garbage collection and scene export** (§8).

### 6.2 Transitive read access through scenes

A user who can use an asset may put it in a scene that's more visible than the asset. Readers of the scene can then load the outputs it references. The publisher already had the right to see those outputs, so publishing them isn't a permission violation.

Mechanism:

```sql
CREATE TABLE scene_asset_grants (
  fk_scene_id   BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_asset_id   BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  fk_granted_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_scene_id, fk_asset_id)
);
```

- **A grant is created when a document write adds a reference** to an asset the scene has no grant for yet. The writer must have **direct** `read` access on the asset (through the asset's ACL, not through another scene). Otherwise the write is refused (`403`, naming the asset). This check is what stops someone from putting a random asset id in their own scene to read it.
- **Access doesn't chain.** Access obtained through a scene doesn't let you grant the asset to another scene. Otherwise anyone viewing a public scene could re-publish its assets elsewhere, and making the original scene private again would no longer protect them. One consequence: duplicating a scene validates its references again against the user doing the copy. A user who only has transitive access gets a copy with missing models.
- **Grants belong to the (scene, asset) pair, not to a document version.** If a reference is removed and later comes back (an undo, or a history restore), the existing grant still applies and no new check is needed. A user who restores an old version doesn't need access to the assets it referenced.
- **Effective read on asset A's outputs** for user U:
  `direct_read(U, A) OR EXISTS(scene S: read(U, S) AND ref(S, A) AND grant(S, A))`
  Both the current reference and the grant are required. A scene that no longer uses the asset doesn't expose it, even with a grant.
- **Scope:** transitive read covers the outputs (entry files and resources), the output part of the manifest, and events. It doesn't cover the master, the config, the playground view, or anything that writes.

### 6.3 Changing asset permissions: don't break scenes

Because scenes hold their own grants, **changing an asset's ACL only changes direct access**. Scenes that use the asset keep working, whatever the new ACL is. That's the reverse of propagation: asset changes don't reach into scenes.

To keep this understandable for the asset's admins:
- The asset ACL routes and UI show **which scenes still give access to the asset**, with their visibility (public, or visible to these groups). After making an asset private, its admin can see that "public scene X" still shows it.
- An explicit **"revoke from scene"** action (asset `admin`) deletes a grant. The response lists what breaks (the scene shows the model as unavailable). It's the only way, besides archiving or deleting the asset, to take access back from a scene.
- Archiving an asset keeps the grants (scenes keep working). Deleting it is refused while references exist (§6.1).

Possible extension (not proposed for now): a per-asset flag "may not be published beyond its own ACL", which refuses new grants to scenes that are more visible than the asset.

## 7. Contract with Voyager

### 7.1 How a scene references an asset

```jsonc
// scene.svx.json, models[i]: the derivatives this scene chose to use
"derivatives": [
  { "usage": "Web3D",    "quality": "Thumb", "assets": [{ "type": "Model", "uri": "/assets/42/thumb/model.gltf" }] },
  { "usage": "Web3D",    "quality": "High",  "assets": [{ "type": "Model", "uri": "/assets/42/web/model.gltf", "byteSize": 1234567, "numFaces": 200000 }] },
  { "usage": "App3D",    "quality": "AR",    "assets": [{ "type": "Model", "uri": "/assets/42/ar-app/model.glb" }] }
]
```

**The svx is the only source of truth for which derivatives a scene uses.** When a scene references an asset, the derivatives for the profiles enabled at that moment are written into it. After that, scenes don't detect new outputs:
- If AR is enabled on an asset later, the scenes that reference it don't show AR until someone revisits each scene and adds the AR derivative. The asset manifest lists the available outputs, so the editor can offer them, but adding one is always a deliberate edit to the scene.
- A derivative whose profile was disabled since answers `404` (the manifest says `removed`). Voyager already handles a missing derivative. The "used in N scenes" list (§6.1) lets the asset's owner see which scenes are affected before disabling a profile.
- Everything a scene shows is in its svx, so scene history, exports and server-unaware clients all see the same thing.

How the URIs are written:

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

Single-file profiles (`ar-app/model.glb`, `ar-ios/model.usdz`) are served the same way as the entry `.gltf` (stable URL, `ETag`, `no-cache`). They have no separate resources, so there's no consistency problem when they're swapped.

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
      "derivative": { "usage": "Web3D", "quality": "High" },
      "href": "/assets/42/web/model.gltf",
      "state": "processing", "progress": 0.42,
      "computing": { "master": 3, "config": 2 },
      "serving":   { "level": "placeholder", "master": 3, "config": 2, "numFaces": 2000, "bounds": { … } },
      "config": { "preset": "High" }
    },
    "ar-app": {
      "derivative": { "usage": "App3D", "quality": "AR" },
      "href": "/assets/42/ar-app/model.glb",
      "state": "ready",
      "serving": { "level": "final", "master": 3, "config": 2 }
    }
  },
  "events": "/assets/events?id=42"
}
```

It supports `ETag`/`If-None-Match`, so polling it is cheap when push isn't available.

### 7.4 Change notifications (push)

`GET /assets/events?id=42&id=57` returns `text/event-stream` (Server-Sent Events).

- The client lists the assets it cares about (the ones the scene references), so the server doesn't need to know which scene is open. One connection per open scene.
- Access is checked per id at connect time: `read` on each asset, direct or through a scene (§6.2).
- Why SSE rather than WebSockets: one-way traffic is all we need, it goes through ordinary HTTP auth/cookies and proxies, the browser has `EventSource` built in, and `Last-Event-ID` gives resume after reconnecting.

```
id: 1832
event: output
data: {"asset":42,"profile":"web","state":"processing","progress":0.42}

id: 1833
event: output
data: {"asset":42,"profile":"web","state":"ready","level":"final","etag":"…"}
```

Expected Voyager behavior (informative only): on an `output` event with a new `etag` for a profile the scene uses, reload that derivative and swap it in place. Annotations and transforms belong to the scene. They still line up after a config change (§3.1), and may not after a master replacement (§5.3). Events for profiles the scene doesn't use are ignored, except by the editor, which can use them to offer the new outputs (§7.1). Enabling or disabling a profile sends an `output` event (`state: "queued"` or `"removed"`).

The stream needs `X-Accel-Buffering: no`, no compression on this route, a heartbeat every ~25 s, event ids that stay monotonic across restarts (DB sequence), and a bounded replay window. If a client's `Last-Event-ID` is too old, the server sends a `reset` event and the client re-reads the manifests.

### 7.5 Playground view

Users can look at an asset directly in voyager-explorer, without any scene. It's useful to check an upload while it's processing, compare profiles, and decide whether to use the asset.

- **URL:** `/ui/assets/42/view`. It renders the existing `scene/explorer` template with `scenePath: "/assets/42/playground/"`. That's the same pattern as the history view (`/scenes/:scene/history/:id/view`, which points the explorer at `/history/…/show/`).
- **`GET /assets/42/playground/scene.svx.json` is generated on every request and never stored**, like `createDocumentFromFiles` does today. It has one model with **every enabled profile** as a derivative, default lighting and environment, and the asset name as title. Unlike scenes, this generated document always follows the current outputs, since there's nothing a user curated to protect.
- **Access:** direct `read` on the asset (§6), **so the view is public when the asset is public**. Transitive access through a scene doesn't open the playground: a viewer of a scene sees the asset the way that scene presents it, not on its own.
- **Read-only:** no editing, no saving. A "create a scene from this asset" action (which grants the new scene, §6.2) is the way to start authoring.
- **Live:** it subscribes to the asset's events and swaps outputs as they're refined. That makes it a natural first target for Voyager's server-awareness: it's simpler than a scene, and every asset has one.
- **Processing state:** while `web` is at `none` or `placeholder`, the page shows the state and progress from the manifest around the viewer. That's eCorpus UI, not Voyager, so it doesn't need any Voyager change.
- Also useful later: generating the asset's thumbnail for listings by rendering the playground.

## 8. Other consequences of living outside scenes

| Area | Consequence | Proposed handling |
|---|---|---|
| Scene zip export | The export would contain an svx pointing to `/assets/…` and no model. | Export follows the reference index: copy each referenced output into the archive (e.g. `models/<asset-name>/…`) and rewrite the URIs in the exported svx. Re-importing such an archive creates scene-local files, or offers to re-create assets. |
| Scene history | Restoring an old scene version shows the *current* output of its assets, not the one it had back then. | Accepted, given unversioned outputs. Config changes keep annotations aligned (§3.1). A master replacement may not (§5.3). If needed, the past output can be regenerated from the master/config versions in effect at that date. |
| Scene duplication | Copying a scene copies references, not models. Grants are re-checked against the user making the copy (§6.2). | Both scenes share the asset, which the "used in" list makes visible. A user with only transitive access gets a copy with missing models, and the copy response lists them. |
| Scene permissions | Making a scene more visible than its assets is allowed, through its grants (§6.2). | Nothing to sync. Scene permission changes never touch assets. |
| Asset permissions | Making an asset more private doesn't affect scenes that hold a grant (§6.3). | The asset's permission page lists the scenes that still give access to it, and offers "revoke from scene". |
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
| 4 | **Asset entity, routes, and an ACL layer generalized over scenes and assets** | Assets are a new top-level resource with the same ACL system as scenes. | Tables (§4), `/assets` routes (create from upload, list, get, archive). Make `UserManager.getAccessRights`, the scene permission routes and the group-grant code work on a resource type (`scene` \| `asset`) instead of duplicating them. |
| 5 | **Reference index and scene grants** | Needed for transitive access (a security boundary), "used in" lists, safe deletion, export and GC. | Parse model URIs on **every** path that writes a `scene.svx.json`: `routes/scenes/scene/files/put/document.ts`, `structuredDocMerge`, archive import, scene copy, history restore. Maintain `scene_asset_refs`. Create grants after checking the writer's direct `read`, and refuse the write otherwise. The output access check is `direct OR (scene read AND ref AND grant)`. It runs on every output and resource request, so it needs an index on `scene_asset_refs(fk_asset_id)` and probably a short per-user cache. Plus the asset-side list of granting scenes and the "revoke from scene" action. |
| 6 | **Master format and ingestors** | No master concept exists. | Canonical `.gltf` writer, extraction of embedded images without re-encoding, Draco/meshopt decoding, pass-through of unknown extensions, loss warnings. Port `toGlb`/`objToGlb` to the ingestor contract. |
| 7 | **Profile registry and output processors** | `optimizeGlb` writes a single `.glb` with one preset today. | An instance-level list of profiles (format, processor, Voyager derivative, default config). A `.gltf` writer whose external resources are named by content hash. `.glb` output for `ar-app`. The `invalidate()`/`emit()` primitives (§5.2). |
| 8 | **Config schema and versioning** | Configs need validation, defaults per profile, and to stay meaningful when the optimizer changes. | JSON schema with a `schema_version` and a section per profile. Only transformations that keep the coordinate frame are allowed (§3.1). Compare each profile's section between versions so only the affected profiles re-run. Decide whether a pipeline upgrade re-runs outputs automatically (probably not: offer it, or do it lazily). |
| 9 | **Progress reporting from tasks** | Needed for `progress` and `X-Asset-State`. Tasks only log text today. | A throttled `context.progress(fraction)` hook, written to `asset_outputs` and published as an event. |
| 10 | **Placeholder generator** | Has to be fast on arbitrarily large inputs. Today's `Thumb` preset still loads and processes the whole mesh. | Start with `Thumb`, then add sampling or a bounding-box proxy. |
| 11 | **Cleanup reachability** | `cleanLooseObjects` only keeps blobs referenced by `files.hash`. | Also count master resources, output resources (with the grace period from §7.2) and retained uploads. |
| 12 | **Export with asset inlining** | Scene zips must stay self-contained. | Follow `scene_asset_refs`, copy outputs, rewrite URIs in the exported svx. |
| 13 | **Upload retention** | Ingestion may lose data for some formats. Deleting the upload immediately makes a bad conversion unrecoverable. | Keep the upload blob (`source_hash`) for a configurable number of days. Maybe let admins pin it. |
| 14 | **glTF → USDZ converter** | `ar-ios` needs USDZ, and nothing in the stack produces it today. | Options to evaluate: a native tool (e.g. Blender in headless mode, or Pixar's `usd` Python tools) run as an external process, or a JS exporter (three.js `USDZExporter`, which needs a DOM-less environment). Its output quality decides whether `ar-ios` is viable at all. |
| 15 | **Signed URLs for external AR apps** | Scene Viewer and Quick Look fetch the file without the user's session, so non-public AR outputs fail to load (§3.1). | A short-lived, signed URL for one output, issued on request by a user who has `read` access. Voyager asks for it right before launching AR. The same need already exists for private scenes. |
| 16 | **Playground view** | Seeing an asset without a scene (§7.5). | A generated `playground/scene.svx.json` (reusing `createDocumentFromFiles`), a `/ui/assets/:id/view` route reusing the `scene/explorer` template, and processing state shown in the page. |
| 17 | **Editor support for adding derivatives** | Scenes don't pick up new outputs, so users need an easy way to add them (§7.1). | Shows the outputs listed in the asset manifest that the scene doesn't use yet, and adds the derivatives on request. Probably in Voyager story (Voyager design). |

Not strictly required at first, but worth deciding early:
- **External workers**: blocks 1 and 2 (a DB-backed queue plus NOTIFY) make heavy processing on dedicated machines a deployment choice rather than a redesign.
- **Quotas and storage tiering**: masters can be very large. A separate `masters_dir` (cold storage, not served) and per-user quotas.

## 10. Open questions

1. **Is `thumb` enabled by default?** As an instance setting (proposed), or always?
2. **Scope of transitive access**: should a scene grant all of an asset's outputs (proposed, simpler), or only the profiles the scene references? Limiting it would mean storing the profile in `scene_asset_refs`, and AR outputs would only become visible through the scene once someone adds them.
3. **Restricting publication**: do we need the per-asset "may not be published beyond its own ACL" flag (§6.3) from the start, or is "revoke from scene" enough?
4. **Non-model uploads**: should images (for articles or textures) eventually go through the same asset system (e.g. responsive variants), or does it stay models-only?
5. **Upload retention**: what default grace period?

## 11. Suggested phasing

1. **Foundations**: durable jobs (1), event bus + SSE (2, 3), progress hook (9). Useful on their own, e.g. live upload/task status in the UI.
2. **Assets and masters**: entity, ACL and routes (4), ingestors (6), retention and cleanup (11, 13). Uploads create assets.
3. **Outputs and playground**: profile registry and processors for `web`, `thumb`, `ar-web` and `ar-app` (7), config schema (8), placeholder (10), manifest and serving (§7.2, §7.3), events (§7.4), playground view (16). This gives a usable asset library before scenes even use it.
4. **Scene integration**: reference index and grants (5), scene creation from an upload writes `/assets/…` references and creates the grant, export inlining (12), editor support for adding derivatives (17).
5. **iOS AR and external apps**: USDZ converter (14), signed URLs (15). Independent from the rest, so it can come later.
6. **Voyager integration** (separate design).
