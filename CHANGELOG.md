# Changelog

## Unreleased (since v0.1.0)

This release introduces a task processing subsystem, runtime-editable
configuration, a deep rework of the UI templates and forms, history previews,
asynchronous email delivery, pagination on the users list, accent- and
case-insensitive scene search, and an update of the embedded DPO-Voyager to
v0.61.0. Below is a summary of the meaningful changes.

### Task processing subsystem

A new background task system can offload heavy file processing and other
long-running operations from the request thread, with a structure that leaves
room for worker threads or external processes.

- New scheduler, handlers, routes, and persistent task records, with
  pagination on the listing endpoint and a ZIP download route for task
  artifacts.
- A redesigned upload manager UI that surfaces task progress, links to
  upload logs, and handles drag & drop more robustly.
- Dedicated admin and user task views, with a per-scene tasks tab and a
  cleaner summary layout.
- Tasks can be linked to a parent task and to a scene, with cycle prevention
  and consistency checks on scene linkage.
- Workspaces are created cleanly even if stale folders are left behind from
  a previous run.
- The legacy in-process glTF code has been removed in favor of
  `gltf-transform` throughout.
- Configurable retention policies (`task_retention_days`,
  `task_errors_retention_days`) and a new `startupCleanup` task that runs on
  boot and every 24 hours to drop expired tasks and clean orphan VFS
  objects.
- On startup, any non-terminal task left over from the previous process is
  marked as errored via `TaskScheduler.reapOrphans`.

### Runtime-editable configuration

Configuration values can now be changed at runtime through the admin UI
instead of requiring a restart.

- New `PATCH /admin/config` API endpoint and an admin UI to edit values.
- Configuration type inference reworked to support color values, used as the
  foundation for light/dark theme colors.
- `SubmitFragment` now handles checkbox inputs so booleans can be edited
  cleanly.
- Pre-init static config access paths kept working for the bits that must be
  resolved before the server boots.

### Email delivery as background tasks

Email sending has been moved off the request path and into the task
scheduler, so failures are observable and retried alongside everything else.

- New `sendEmail` task handler that wraps the SMTP transport and logs each
  attempt persistently.
- User creation, login-link requests and the admin "send test email"
  endpoint now schedule emails as tasks instead of awaiting SMTP inline.
- New bilingual onboarding email templates (FR/EN), and a `send_onboarding`
  option plus `lang` parameter on `POST /users` to send the welcome mail in
  the user's language.
- Test injection helpers (`setTransporter`) and an env-driven fake SMTP
  transport for integration and end-to-end tests.

### History preview

Users can now look at a file the way it existed at any point in a scene's
history without restoring it.

- New `GET /history/:scene/:id/show/:name` endpoint that serves the file
  content recorded before a given history reference, with proper
  `ETag`/`Last-Modified`/`Content-Length`/`Accept-Ranges` headers and
  conditional GET (304) support.
- History UI now exposes per-row preview links pointing at a historical
  Voyager view, with accessible `aria-label`s.
- The scene history view is rendered server-side with a paginated
  Handlebars template instead of being fetched in the browser.
- Write-level permission is enforced; deleted files at the reference point
  return 404, invalid reference IDs return 400.

### User listing with pagination

The users list — both the API and the admin page — is now paginated and
shows more useful information.

- `GET /users` accepts `limit` (1–100) and `offset` query parameters, with
  validation aligned on what `ScenesVfs` does for scenes. Results are
  ordered by username for stable paging.
- `/admin/users` defaults to 25 users per page with a real pager (next /
  previous, total count, current range).
- The admin table now shows an email column with `mailto:` links, has a
  reordered action column, and shows full role names.
- `userCount()` excludes system users (ids 0 and 1) to match the listing.
- A new `match` clause on `UserManager` makes paginated filtering by name
  consistent across pages.

### Search: case- and accent-insensitive

Scene search now ignores both case and diacritics in scene names, titles,
intros, copyright, articles, annotations and tour metadata.

- New migration enables the `unaccent` PostgreSQL extension and rewrites the
  `fr`/`en` text-search configurations to use it.
- The "scene name fallback" `LIKE` branch in `getScenes` was switched to
  `unaccent(LOWER(...))` on both sides.
- Search terms are now refreshed when a scene is renamed (a previous gap
  that left stale terms in the index).

### Templates and UI rework

The whole UI layer has been reorganized for less duplication and a more
coherent visual identity.

- Template directory restructured, with more shared partials and new helpers
  to query access levels from inside templates.
- Home page rebuilt with onboarding blocks and a more relevant scene mix;
  scene pages use the main-grid layout with tabs.
- Icons now come from a single external SVG spritesheet and are styled
  uniformly across the UI.
- Onboarding hints have been added on empty/initial states: upload page,
  empty groups, scene settings, tag listing, user pages, advanced search
  filters; help-block links now point to real documentation.
- Form components reworked into a consistent `form-item` style, picked up
  by all forms (group/user ACL editor, admin create-user form, etc.).
- Default scene image gradient unified across scene types, and the view
  buttons now match each scene type.
- Default sprite set switched to `icons.svg`; HTML scenes now have proper
  thumbnails through a factored thumbnail helper.
- Light/dark theme color palette in place as the base for runtime-editable
  theming.
- Sidebar breakpoints aligned with the main layout; task filter form, admin
  inner navbars, language selector and user/admin tables all got a pass.

### Template engine

- Handlebars helpers split into separate files, each documented, with more
  unit tests around them.
- `{{datetime time}}` now respects its surrounding context in nested
  scopes (it previously dropped the value silently).

### Performance and database

- Added indexes on `files.hash` and `tags.fk_scene_id`. On a 395 k-row /
  20 k-row dataset, hash lookups drop from ~23 ms to ~0.13 ms and the
  per-scene tag aggregation goes from a 5135-block heap scan to a 4-block
  index scan.
- `getScenes` restructured so per-scene subqueries run after `LIMIT`
  instead of for the whole table.
- `current_generations` is now used for current-file lookups.
- `cleanLooseObjects` preloads referenced hashes in one pass instead of
  querying per file.
- Stricter cache-control policy on task and history responses.
- Larger upload chunks for faster transfers.

### DPO-Voyager update (v0.59 → v0.61.0)

The embedded DPO-Voyager has been bumped from v0.59.0 to v0.61.0
(v0.61.1 fix included), and the Node engine requirement has moved to
`>=20.9.0` to match upstream's build needs. The most notable changes from
the Voyager release notes:

**New features**

- Story tagging has been overhauled: a central tag manager with a
  redesigned UI, tags shown as removable chips with a dropdown for picking
  or creating tags. Radio-style tags now enforce a single active tag.
- New Sun light type that derives its direction, intensity and color from
  geographic coordinates and time, with timezone support.
- Light tagging to organize alternate lighting scenarios, and "light
  enabled" is now a property that can be keyframed in tours.
- Add/delete UI for all light types from the Story interface.
- Annotation tags are now visible in WebXR/AR mode.
- Weblate integration to streamline translation contributions.
- Expanded audio format support: `.m4a`, `.flac`, `.ogg`, `.wav`.
- Expanded API: "enable" counterparts to existing toggle functions,
  language/tag management calls, and tour data retrieval helpers.

**Notable fixes**

- Dynamic sizing for extended annotations.
- Zero scale values are normalized so they no longer break matrix
  decomposition on serialization.
- Multi-mesh animation support hardened.
- Arrow keys are captured at the component level so they no longer scroll
  the page.
- Active brackets and annotations are hidden during thumbnail capture.
- WebGL2 availability is now checked with a clear error if unavailable.
- Default Draco loader URLs (`jsdelivr`) updated so they no longer
  redirect.
- Empty model bounds, environment map loading, audio element refresh,
  setup-property caching and several focus / annotation activation
  glitches fixed.

**Maintenance**

- Three.js bumped to r182 — note that PBR materials look brighter than
  before because of upstream shader changes in r181.

### eCorpus-side Voyager integration

- Newly imported models default to meters as their unit, both for drag &
  drop and for the upload pipeline (with an end-to-end test covering it).
- The structured document merge step that runs when saving a scene now
  goes through the task subsystem, which makes merge errors inspectable
  in the tasks UI.

### Testing and CI

- Database tuned for performance in CI; integration tests use a
  soft-reset of the database instead of creating a new one every time, and
  `DROP DATABASE` uses the `force` option to avoid close-handler timeouts.
- e2e tests now run on up to 4 workers in CI, with the setup steps
  serialized so workers don't race.
- Screenshots and videos are captured on test failure; the start-server
  helper now cleans its tmp dir through a trap instead of a blanket `rm`.
- CI now works for slash-named branches and tag-based releases;
  `setup-node` bumped to v6.
- Four previously skipped/incomplete e2e tests were fixed; new e2e
  coverage for runtime config edition, history preview links, scene
  permission patches through the UI, and tampered/orphaned auth-link
  rejection.
- Test infrastructure consolidated: shared `test`/`expect` fixtures across
  e2e specs, locale pinned to `cimode` where appropriate, the
  `createScene` fixture hardened, etc.
- Stopped using cursors for `db.get` operations where it could cause
  flakiness, awaited a handful of promises that produced flaky results,
  and added unit tests + refactoring for task handlers and the scheduler.

### Bugs (catch-all)

The most important fixes that don't fit anywhere above:

- `sendEmail` no longer breaks on SMTP transports that don't populate the
  `accepted` array.
- Admin "create user" form was POSTing the wrong field name.
- Forced dark mode no longer paints a white background onto some inline
  SVG elements.
- Tags list in scene settings no longer overflows its grid container.
- `getHost` utility now handles forwarded ports correctly (with new tests).
- oEmbed iframe code generation is now readable and correct.
- POST `/history` no longer writes a useless new generation when restoring
  to the current HEAD.
- Various small linting and code-quality fixes.
