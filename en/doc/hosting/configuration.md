---
title: Configure an instance
rank: 3
---

## Configure an instance

All configuration options are provided by environment variables.

Leaving the default value is generally a good choice.

For boolean variables, use `1` or `true` / `0` or `false`.

Some options (see [Hot-editable options](#hot-editable-options)) can also be changed after startup from the `/ui/admin/` panel. Setting the matching environment variable locks the option so it can no longer be edited from the interface.

### Environment variables

#### Basic variables

##### NODE_ENV

 > `development`

**"development"** or **"production"**.

Drives the default value of other configuration variables (notably [LOG_LEVEL](#log_level)).

Changes the behavior of some modules. See also [express](https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production){:target="_blank"}.

Should generally be forced to `production` in deployments.

##### PORT

 > `8000`

TCP port used by the service. Also accepts a filesystem path to listen on a Unix socket instead (e.g. `/run/ecorpus.sock`).

##### PUBLIC

 > `true`

Default access of newly created scenes.

Does not modify existing scenes. It is still possible to create a publicly accessible scene by changing its permissions even if `PUBLIC=0`.

##### TRUST_PROXY

 > `true`

Changes express's trust-proxy option. See [express](http://expressjs.com/en/5x/api.html#trust.proxy.options.table){:target="_blank"}. Disable if the instance is directly exposed without a reverse proxy.

#### Database

eCorpus uses PostgreSQL. The connection is built from the standard `PG*` variables, unless `DATABASE_URI` is provided directly.

##### DATABASE_URI

Full connection string, e.g. `postgres://user:password@host:5432/dbname`.

If unset, it is built from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE`:

- If neither `PGHOST` nor `PGPASSWORD` is set, connects through a local Unix socket (`/var/run/postgresql/`), suited for development with `trust` authentication.
- Otherwise, connects over TCP to `PGHOST` (default `localhost:5432`), with `PGUSER` (default: the system user), `PGPASSWORD` and `PGDATABASE` as options.

##### FORCE_MIGRATION

 > `false`

Forces reapplying the last migration on startup.

Sometimes useful to repair migration errors, but generates a risk of data loss.

##### CLEAN_DATABASE

 > `true`

Set to `false` to disable periodic database cleanup.

#### Directories

##### ROOT_DIR

> `.`

Main directory. Serves as a base for [FILES_DIR](#files_dir), [DIST_DIR](#dist_dir) and [ASSETS_DIR](#assets_dir).

##### FILES_DIR

 > `$ROOT_DIR/files`

Data storage directory of the instance: objects and temporary storage.

##### DIST_DIR

 > `$ROOT_DIR/dist`

Build artifacts of the user interface.

##### ASSETS_DIR

 > *(none)*

Override directory for static assets. See [Editable files](#editable-files).

##### MIGRATIONS_DIR

 > `./migrations`

##### TEMPLATES_DIR

 > `./templates`

##### SCRIPTS_DIR

 > `./scripts`

#### Logging

##### LOG_FORMAT

 > `pretty`

Set to `json` for structured output ([pino](https://getpino.io/){:target="_blank"} logs), useful in production for ingestion by a log collector. Any other value produces human-readable output.

##### LOG_LEVEL

 > `info` in production, `debug` otherwise

Minimum level emitted: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` to disable logging entirely.

##### BUILD_REF

 > `dev`

Build identifier (e.g. commit SHA), used to cache-bust static assets and to correlate logs with a deployment. Usually set automatically when building the Docker image rather than by hand.

#### Sending emails

##### SMART_HOST

*Hot-editable*

 > `smtp://localhost:25`

[Smart Host](https://en.wikipedia.org/wiki/Smart_host){:target="_blank"} to use for sending emails.

Used by [nodemailer](https://nodemailer.com/){:target="_blank"} to create a mail transport.

Additional configuration options can be added to the url as query parameters.

```
# allow self-signed certificates:
smtp://localhost:465?tls.rejectUnauthorized=false
```
See the full [list](https://nodemailer.com/smtp){:target="_blank"}.

##### CONTACT_EMAIL

*Hot-editable*

 > `noreply@$HOSTNAME`

Address used as the sender (`From`) of emails sent by the instance.

#### Instance identity

##### BRAND

*Hot-editable*

 > *(empty)*

Name of the instance. Replaces **eCorpus** in the interface.

##### HOSTNAME

*Hot-editable*

 > system hostname

Hostname advertised by the instance (used in particular to build the default [CONTACT_EMAIL](#contact_email)).

##### COLOR_PRIMARY / COLOR_SECONDARY

*Hot-editable*

 > `#e6b900` / `#4735df`

Interface theme colors, as a CSS color value (e.g. `#rrggbb`).

#### Scheduled tasks

##### TASK_RETENTION_DAYS

*Hot-editable*

 > `30`

Retention period (in days) for successfully completed tasks. `0` disables cleanup.

##### TASK_ERRORS_RETENTION_DAYS

*Hot-editable*

 > `90`

Retention period (in days) for failed tasks. `0` disables cleanup.

##### TASK_TIMEOUT_SECONDS

*Hot-editable*

 > `3600`

Maximum time (in seconds) before a stuck task is aborted and marked as failed. `0` disables the timeout.

#### Experimental features

##### EXPERIMENTAL

*Hot-editable*

 > `false`

Enables experimental features of the instance, including the default value of [ENABLE_DOCUMENT_MERGE](#enable_document_merge).

##### ENABLE_DOCUMENT_MERGE

*Hot-editable*

 > follows [EXPERIMENTAL](#experimental)

Enables document merging (experimental feature).

### Hot-editable options

Options marked *Hot-editable* above can be edited after startup from `/ui/admin/`, without restarting the service, as long as they are not set through an environment variable (in which case they are locked to that value).

### Editable files

Using the [ASSETS_DIR](#assets_dir) variable, it is possible to modify the files normally included in the `/dist` folder. In particular:

```
dist/
├─ css/
│  ├─ theme.css
├─ images/
│  ├─ logo-full.svg
│  ├─ logo-sm.svg
│  ├─ spinner.svg
├─ favicon.svg
├─ favicon.png
```

#### Modifying the logos 

There is 2 logos, used depending on the size of the screen : 

**Small**: This logo image should be square and look legible at 40px by 40px.

**Full**: This logo image should follow a 2:9 aspect ration (height:width) and look legible at 40px by 180px. If your logo is not long enough to fill that space, add padding to the left-hand side of the image.
