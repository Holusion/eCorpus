---
title: Configure an instance
---

# Settings and parameters

All configuration options are provided by environment variables.

Leaving the default value is generally a good choice.

For boolean variables, use `1` or `true` / `0` or `false`.

## Basic variables

### NODE_ENV

 > `development`

**"development"** or **"production"**.

Drives the default value of other configuration variables.

Changes the behavior of some modules. See also [express](https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production).

Should generally be forced to `production` in deployments.

### HOSTNAME

### PUBLIC

 > `true`

Default access of newly created scenes.

Does not modify existing scenes. It is still possible to create a publicly accessible scene by changing its permissions even if `PUBLIC=0`.

### BRAND

 > `eCorpus`

Name of the instance. Replaces **eCorpus** in the interface.

### PORT

 > `3000`

Port used by the service. Change in case of conflict.

### SMART_HOST

 > `smtp://localhost`

[Smart Host](https://en.wikipedia.org/wiki/Smart_host) à utiliser pour l'envoi d'emails.

Used by [modemailer](https://nodemailer.com/) to create a mail transport.

Additional configuration options can be added to the url as query parameters.

```
# allow self-signed certificates:
smtp://localhost:465?tls.rejectUnauthorized=false
```
See the full [list](https://nodemailer.com/smtp/).


### TRUST_PROXY

 > `true`

Changes express's trust-proxy option. See [express](http://expressjs.com/en/5x/api.html#trust.proxy.options.table).


## administration variables

### FORCE_MIGRATION

 > `false`

Force reapply of the last *sqlite* migration (see [doc](https://www.npmjs.com/package/sqlite#migrations)).

Sometimes useful to repair migration errors, but generates a risk of data loss.

### CLEAN_DATABASE

 > `true`

Set to `false` to disable periodic database cleanup.

### ROOT_DIR

> `.`

Main directory. Serves as a base for [FILES_DIR](#files_dir) [DIST_DIR](#dist_dir) and [ASSETS_DIR](#assets_dir).

### MIGRATIONS_DIR

 > `./migrations`

### TEMPLATES_DIR

  > `./templates`

### FILES_DIR

 > `$ROOT_DIR/files`

Data storage directory of the instance: Database, objects and temporary storage.

### DIST_DIR

 > `$ROOT_DIR/dist`

build artifacts of the user interface.

### ASSETS_DIR

 > `$ROOT_DIR/assets`

Static assets

## Variables de développement

### HOT_RELOAD

 > `$NODE_ENV == "development"`

Activates webpack's [HMR](https://webpack.js.org/concepts/hot-module-replacement/).

### VERBOSE

 > `false`

Verbose mode


