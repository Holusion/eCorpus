---
title: Configurer une instance
rank: 3
---

## Configurer une instance

Toutes les options de configuration sont fournies par variables d'environnement.

Laisser la valeur par défaut est généralement un bon choix.

Pour les variables booléennes, utiliser `1` ou `true` / `0` ou `false`.

### Variables d'environnement

#### Variables de base

##### NODE_ENV

 > `development`

**"development"** ou **"production"**.

Pilote la valeur par défaut d'autres variables de configuration.

Change le comportement de certains modules. Voir aussi [express](https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production){:target="_blank"}.

Devrait généralement être forcé à `production` dans les déploiements.

#### HOSTNAME

##### PUBLIC

 > `true`

Accès par défaut des scènes nouvellement créées.

Ne modifie pas les scènes existantes. Il est toujours possible de créer une scène publiquement accessible en changeant ses permissions même si `PUBLIC=0`.

##### BRAND

 > `eCorpus`

Nom de l'instance. Remplace **eCorpus** dans l'interface.


##### PORT

 > `3000`

Port utilisé par le service. Changer en cas de conflit.


##### SMART_HOST

 > `smtp://localhost`

[Smart Host](https://en.wikipedia.org/wiki/Smart_host){:target="_blank"} à utiliser pour l'envoi d'emails.

Utilisé pour créer le transport par [nodemailer](https://nodemailer.com/){:target="_blank"}.

Les options de configuration peuvent être données sous forme de *query string* :

```
# autorise l'utilisation de certificats self-signed : 
smtp://localhost:465?tls.rejectUnauthorized=false
```
D'autres options utiles peuvent être : `?logger=true&debug=true` pour activer le mode verbeux. Voir la [liste des options](https://nodemailer.com/smtp/){:target="_blank"}.


##### TRUST_PROXY

 > `true`

Pilote l'option trust-proxy dans [express](http://expressjs.com/en/5x/api.html#trust.proxy.options.table){:target="_blank"}.


#### Variables d'administration

##### FORCE_MIGRATION

 > `false`

Force l'application de la dernière migration *sqlite* (voir [doc](https://www.npmjs.com/package/sqlite#migrations){:target="_blank"}).

Parfois utile pour réparer des erreurs de migration, mais génère un risque de perte de données.

##### CLEAN_DATABASE

 > `true`

Mettre à `false` pour désactiver le nettoyage périodique de base de données.

##### ROOT_DIR

> `.`

Répertoire principal. Sert de base pour [FILES_DIR](#files_dir) [DIST_DIR](#dist_dir) et [ASSETS_DIR](#assets_dir).

##### MIGRATIONS_DIR

 > `./migrations`

##### TEMPLATES_DIR

  > `./templates`

##### FILES_DIR

 > `$ROOT_DIR/files`

Répertoire de stockage des données de l'instance : base de donnée, objets et stockage temporaire.

##### DIST_DIR

 > `$ROOT_DIR/dist`

artefacts de build de l'interface utilisateur.

##### ASSETS_DIR

 > `$ROOT_DIR/assets`

Assets statiques

#### Variables de développement

##### HOT_RELOAD

 > `$NODE_ENV == "development"`

Active le [HMR](https://webpack.js.org/concepts/hot-module-replacement/){:target="_blank"} de webpack.

##### VERBOSE

 > `false`

Mode verbeux

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
