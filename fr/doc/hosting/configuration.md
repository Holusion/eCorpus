---
title: Configurer une instance
rank: 3
---

## Configurer une instance

Toutes les options de configuration sont fournies par variables d'environnement.

Laisser la valeur par défaut est généralement un bon choix.

Pour les variables booléennes, utiliser `1` ou `true` / `0` ou `false`.

Certaines options (voir [Options modifiables à chaud](#options-modifiables-à-chaud)) peuvent aussi être modifiées après le démarrage depuis le panneau `/ui/admin/`. Définir la variable d'environnement correspondante verrouille l'option : elle n'est alors plus modifiable dans l'interface.

### Variables d'environnement

#### Variables de base

##### NODE_ENV

 > `development`

**"development"** ou **"production"**.

Pilote la valeur par défaut d'autres variables de configuration (notamment [LOG_LEVEL](#log_level)).

Change le comportement de certains modules. Voir aussi [express](https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production){:target="_blank"}.

Devrait généralement être forcé à `production` dans les déploiements.

##### PORT

 > `8000`

Port TCP utilisé par le service. Accepte aussi un chemin de fichier pour écouter sur une socket Unix (ex: `/run/ecorpus.sock`).

##### PUBLIC

 > `true`

Accès par défaut des scènes nouvellement créées.

Ne modifie pas les scènes existantes. Il est toujours possible de créer une scène publiquement accessible en changeant ses permissions même si `PUBLIC=0`.

##### TRUST_PROXY

 > `true`

Pilote l'option trust-proxy dans [express](http://expressjs.com/en/5x/api.html#trust.proxy.options.table){:target="_blank"}. À désactiver si l'instance est directement exposée sans reverse-proxy.

#### Base de données

eCorpus utilise PostgreSQL. La connexion se construit à partir des variables `PG*` standard, sauf si `DATABASE_URI` est fournie directement.

##### DATABASE_URI

Chaîne de connexion complète, ex: `postgres://user:password@host:5432/dbname`.

Si absente, elle est construite à partir de `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` et `PGDATABASE` :

- Si ni `PGHOST` ni `PGPASSWORD` ne sont définis, connexion via une socket Unix locale (`/var/run/postgresql/`), adaptée au développement avec une authentification `trust`.
- Sinon, connexion TCP à `PGHOST` (par défaut `localhost:5432`), avec `PGUSER` (par défaut l'utilisateur système), `PGPASSWORD` et `PGDATABASE` en options.

##### FORCE_MIGRATION

 > `false`

Force la réapplication de la dernière migration au démarrage.

Parfois utile pour réparer des erreurs de migration, mais génère un risque de perte de données.

##### CLEAN_DATABASE

 > `true`

Mettre à `false` pour désactiver le nettoyage périodique de base de données.

#### Répertoires

##### ROOT_DIR

> `.`

Répertoire principal. Sert de base pour [FILES_DIR](#files_dir), [DIST_DIR](#dist_dir) et [ASSETS_DIR](#assets_dir).

##### FILES_DIR

 > `$ROOT_DIR/files`

Répertoire de stockage des données de l'instance : objets et stockage temporaire.

##### DIST_DIR

 > `$ROOT_DIR/dist`

Artefacts de build de l'interface utilisateur.

##### ASSETS_DIR

 > *(aucun)*

Répertoire de surcharge des assets statiques. Voir [Fichiers modifiables](#fichiers-modifiables).

##### MIGRATIONS_DIR

 > `./migrations`

##### TEMPLATES_DIR

 > `./templates`

##### SCRIPTS_DIR

 > `./scripts`

#### Journalisation (logs)

##### LOG_FORMAT

 > `pretty`

Mettre à `json` pour une sortie structurée (logs [pino](https://getpino.io/){:target="_blank"}), utile en production pour l'ingestion par un collecteur de logs. Toute autre valeur produit une sortie lisible par un humain.

##### LOG_LEVEL

 > `info` en production, `debug` sinon

Niveau minimum émis : `trace`, `debug`, `info`, `warn`, `error`, `fatal`, ou `silent` pour tout désactiver.

##### BUILD_REF

 > `dev`

Identifiant de build (ex: SHA de commit), utilisé pour invalider le cache des assets statiques et corréler les logs à un déploiement. Généralement défini automatiquement lors du build de l'image Docker plutôt que renseigné à la main.

#### Envoi d'emails

##### SMART_HOST

*Modifiable à chaud*

 > `smtp://localhost:25`

[Smart Host](https://en.wikipedia.org/wiki/Smart_host){:target="_blank"} à utiliser pour l'envoi d'emails.

Utilisé pour créer le transport par [nodemailer](https://nodemailer.com/){:target="_blank"}.

Les options de configuration peuvent être données sous forme de *query string* :

```
# autorise l'utilisation de certificats self-signed : 
smtp://localhost:465?tls.rejectUnauthorized=false
```
D'autres options utiles peuvent être : `?logger=true&debug=true` pour activer le mode verbeux. Voir la [liste des options](https://nodemailer.com/smtp){:target="_blank"}.

##### CONTACT_EMAIL

*Modifiable à chaud*

 > `noreply@$HOSTNAME`

Adresse utilisée comme expéditeur (`From`) des emails envoyés par l'instance.

#### Identité de l'instance

##### BRAND

*Modifiable à chaud*

 > *(vide)*

Nom de l'instance. Remplace **eCorpus** dans l'interface.

##### HOSTNAME

*Modifiable à chaud*

 > nom d'hôte système

Nom d'hôte annoncé par l'instance (utilisé notamment pour construire [CONTACT_EMAIL](#contact_email) par défaut).

##### COLOR_PRIMARY / COLOR_SECONDARY

*Modifiable à chaud*

 > `#e6b900` / `#4735df`

Couleurs de thème de l'interface, au format CSS (ex: `#rrggbb`).

#### Tâches planifiées

##### TASK_RETENTION_DAYS

*Modifiable à chaud*

 > `30`

Durée de conservation (en jours) des tâches terminées avec succès. `0` désactive le nettoyage.

##### TASK_ERRORS_RETENTION_DAYS

*Modifiable à chaud*

 > `90`

Durée de conservation (en jours) des tâches en erreur. `0` désactive le nettoyage.

##### TASK_TIMEOUT_SECONDS

*Modifiable à chaud*

 > `3600`

Durée maximale (en secondes) avant qu'une tâche bloquée ne soit annulée et marquée en échec. `0` désactive le timeout.

#### Fonctionnalités expérimentales

##### EXPERIMENTAL

*Modifiable à chaud*

 > `false`

Active les fonctionnalités expérimentales de l'instance, dont la valeur par défaut de [ENABLE_DOCUMENT_MERGE](#enable_document_merge).

##### ENABLE_DOCUMENT_MERGE

*Modifiable à chaud*

 > suit [EXPERIMENTAL](#experimental)

Active la fusion de documents (fonctionnalité expérimentale).

### Options modifiables à chaud

Les options marquées *Modifiable à chaud* ci-dessus peuvent être éditées après le démarrage depuis `/ui/admin/`, sans redémarrer le service, tant qu'elles ne sont pas définies par variable d'environnement (auquel cas elles sont verrouillées à cette valeur).

### Fichiers modifiables

En utilisant la variable [ASSETS_DIR](#assets_dir), il est possible de modifier les fichiers normalement inclus dans le dossier `/dist`. En particulier :

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


#### Modifier les logos 

Il y a deux images de logo, utilisées de façon interchangeable selon l'espace disponible.

**Small**: Image carrée, qui doit être lisible  en 40x40px.

**Full**: Logo d'aspect ratio 2:9 qui doit être lisible en 40x180px. Si le logo utilisé est trop court, rajouter du pâdding transparent à gauche de l'image.
