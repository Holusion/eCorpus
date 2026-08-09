---
title: Utiliser l'API
rank: 4
---

## Utiliser l'API

eCorpus fournit une API complète qui couvre les besoins de DPO Voyager en y ajoutant des interfaces de gestion des utilisateurs, contrôle des droits d'accès, organisation des scènes en collections, etc...

<div style="display:flex;justify-content:center">
    <a class="button" href="/en/doc/hosting/apiDoc">Documentation de l'API</a>
</div>

### Authentification

eCorpus combine deux notions d'autorité distinctes sur chaque requête :

- un **niveau utilisateur** global à l'instance, et
- un **niveau d'accès** propre à chaque scène.

> **Note :** l'authentification HTTP *Basic* avec un nom d'utilisateur et un mot de passe a été **supprimée dans
> eCorpus v0.3.0**. `Authorization: Basic …` ne sert plus qu'à authentifier un *client* OAuth enregistré sur
> `POST /auth/oauth/token`. Si votre instance utilise encore la **v0.2.x**, consultez le
> [guide d'authentification de l'ancienne version](/fr/doc/hosting/basic_auth).

#### Niveaux utilisateur

Chaque compte a exactement un niveau. Ils sont ordonnés — un niveau supérieur inclut les capacités des niveaux
inférieurs :

| Niveau | Signification |
| --- | --- |
| `none` | Les requêtes anonymes/non authentifiées sont résolues vers un utilisateur synthétique de niveau `none`. |
| `use` | Utilisateur authentifié. Peut consulter les scènes auxquelles il a accès, mais ne peut pas créer de scènes. |
| `create` | Niveau par défaut d'un compte nouvellement créé. Peut créer des scènes. |
| `manage` | Peut en plus gérer les groupes. |
| `admin` | Administrateur de l'instance. Dispose implicitement d'un accès `admin` sur **toutes** les scènes et peut atteindre les routes `/admin`. |

#### Niveaux d'accès par scène

Indépendamment de son niveau, un utilisateur se voit accorder un niveau d'accès sur chaque scène, ordonné
`none < read < write < admin`. L'accès **effectif** sur une scène est le *maximum* de :

- l'attribution explicite par utilisateur (voir [`PATCH /auth/access/{scene}`](/en/doc/hosting/apiDoc#patchaccess)),
- toute attribution héritée d'un groupe dont l'utilisateur est membre,
- le `default_access` de la scène (s'applique à tout utilisateur connecté ; plafonné à `write`),
- le `public_access` de la scène (s'applique à tout le monde, visiteurs anonymes compris ; plafonné à `read`),
- la dérogation administrateur (les utilisateurs `admin` obtiennent toujours `admin`).

Un visiteur anonyme n'obtient jamais plus que le `public_access` d'une scène.

#### Authentifier une requête

Une requête est identifiée, par ordre de précédence :

1. **Jeton Bearer** — envoyez `Authorization: Bearer ec_…`. Utilisé par les scripts, services et clients en
   ligne de commande. Un jeton présenté mais invalide/révoqué provoque un `401` immédiat (jamais de repli
   silencieux vers l'anonyme).
2. **Cookie de session** — le mode de connexion du navigateur. Le cookie `session` ne transporte qu'un identifiant
   de session opaque ; l'identité (et le niveau *actuel* du compte) est relue côté serveur à chaque requête :
   déconnexions, changements de mot de passe et changements de niveau prennent effet immédiatement. Les sessions
   durent 31 jours et se renouvellent automatiquement (fenêtre glissante).

Créez un jeton depuis l'interface web (ou avec `POST /auth/tokens` depuis une session connectée), puis utilisez-le comme jeton porteur :

```bash
curl -XGET -H "Authorization: Bearer ec_xxxxxxxx" https://ecorpus.holusion.com/[...]
```

Vous pouvez aussi ouvrir une session de type navigateur et réutiliser son cookie :

```bash
# Connexion, en enregistrant le cookie de session
curl -c cookies.txt -XPOST https://ecorpus.holusion.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<username>","password":"<password>"}'

# Réutilisation du cookie sur les requêtes suivantes
curl -b cookies.txt -XGET https://ecorpus.holusion.com/[...]
```

Dans ce cas un jeton d'authentification "session" sera stocké sur votre disque. Ce jeton donne un accès sans restriction à votre compte.

#### Jetons d'accès personnels

Un utilisateur connecté crée un jeton avec `POST /auth/tokens`, **depuis une session interactive uniquement** — un
jeton ne peut jamais créer un autre jeton, même avec la portée `all`. Vous choisissez un nom, un ensemble de
*portées* (scopes) et une expiration optionnelle ; le secret `ec_…` n'est renvoyé qu'**une seule fois** et
n'est jamais stocké côté serveur. Un jeton ne peut jamais faire plus que ce que le niveau actuel de son
propriétaire permet, et ses portées le restreignent davantage :

| Portée | Autorise |
| --- | --- |
| `all` | Autorité complète. La seule portée qui passe les contrôles de niveau et les routes de gestion de compte. |
| `scenes:read` / `scenes:write` / `scenes:admin` | Plafonne le *niveau* obtenable sur les scènes (la visibilité est inchangée). |
| `scenes:create` | Création de scènes et import d'archives. |
| `tasks:read` / `tasks:write` | L'API `/tasks`. |

Listez et révoquez vos jetons avec `GET`/`DELETE /auth/tokens`. Quiconque détient un jeton peut le révoquer via
`POST /auth/oauth/revoke`.

#### OAuth2 (code d'autorisation + PKCE)

Pour les applications tierces. Un administrateur enregistre un **client** (`POST /auth/oauth/clients`) avec une ou
plusieurs URI de redirection ; les clients *confidentiels* reçoivent un secret, les clients *publics* (CLI, SPA)
reposent uniquement sur PKCE (Proof Key for Code Exchange). Le flux est un octroi par code d'autorisation standard avec **PKCE (S256)
obligatoire** :

1. Envoyez l'utilisateur sur `GET /auth/oauth/authorize` avec `client_id`, une `redirect_uri` exacte,
   `response_type=code`, un `scope` explicite et un `code_challenge` (+ `code_challenge_method=S256`).
2. L'utilisateur se connecte (une session est requise) et approuve sur la page de consentement
   (`POST /auth/oauth/authorize`). L'approbation est persistée en tant que **grant**, si bien que les demandes
   ultérieures couvertes par un grant existant sont accordées silencieusement — pratique pour les renouvellements.
   `prompt=none` sonde sans interface, `prompt=consent` force l'affichage de la page.
3. L'application échange le `code` à usage unique sur `POST /auth/oauth/token` avec son `code_verifier`, et reçoit
   un jeton d'accès Bearer valable 30 jours.

Les utilisateurs consultent les applications qu'ils ont approuvées avec `GET /auth/oauth/grants` et en révoquent
une avec `DELETE /auth/oauth/grants/{clientId}` — ce qui révoque aussi tous les jetons que ce client détient pour
eux. Les métadonnées du serveur sont découvrables sur `/.well-known/oauth-authorization-server`.

#### Sessions et CSRF

Les utilisateurs listent leurs sessions actives (`GET /auth/sessions`) et peuvent en révoquer par identifiant ; un
changement de mot de passe évince toutes les sessions du compte. Les méthodes non sûres des requêtes
**authentifiées par cookie** sont protégées contre le CSRF par des vérifications `Sec-Fetch-Site`/`Origin` ; les
requêtes par jeton Bearer et les requêtes anonymes en sont exemptées (un header ne voyage pas de lui-même entre
sites).

Le détail des routes `/auth` est documenté (en anglais) dans la [section auth de la référence de l'API](/en/doc/hosting/apiDoc#auth).
Pour la logique de conception derrière ce modèle (vocabulaire des scopes, middleware de garde, contrat de codes
de statut), voir le [document de conception Identity & Access Control](/en/doc/hosting/development/auth_system)
(en anglais).

### Organisation des scenes

Organisation des fichiers :

```
├── foo/
│   ├── scene.svx.json
│   ├── scene-image-thumb.jpg
│   ├── models/
│   │   └── foo.glb
│   └── articles/
│       └── foo-FR.html
└── bar/
    ├── scene.svx.json
    ├── scene-image-thumb.jpg
    ├── models/
    │   └── bar.glb
    └── articles/
        └── bar-FR.html
```

### Exportation des données

Ainsi pour récupérer un modèle :

```bash
curl -XGET -H "Authorization: Bearer ${TOKEN}" https://${HOSTNAME}/scenes/foo/models/foo.glb
```

Pour récupérer une ou plusieurs scènes :
```bash
curl -XGET https://${HOSTNAME}/scenes?name=${NAME}&format=zip
```
Vous pouvez ajouter autant de paramètres `name="..."` que nécessaire, séparés par des caractères `&`.


### Importation des données 

Pour importer une scène ou une collection de scènes exportées d'une instance eCorpus :

```bash
curl -XPOST https://${HOSTNAME}/scenes --data-binary "@${ZIP_FILE}" -H "Authorization: Bearer ${TOKEN}" | jq .
```

Le jeton doit porter la portée `scenes:create` (ou être de portée `all`), et l'import nécessite des droits d'**administrateur** globaux.

Cette requête retourne une liste des changements effectués qui peut être assez longue. Vous pouvez filtrer les échecs en utilisant `jq .fail` ou si vous n'avez pas `jq` installé, vous pouvez utiliser curl en mode silencieux et inspecter uniquement le status de la réponse : `curl -s --fail -o /dev/null -w "%{http_code}"`.



### API REST et spécification

Les verbes `GET` `PUT` `MOVE` `DELETE` `MKCOL` et `PROPFIND` sont supportés, avec un comportement se conformant généralement à la [spécification](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}. Attention tout de même : Il s'agit d'une implémentation partielle de la spécification (`COPY` et `LOCK`/`UNLOCK` ne sont pas implémentés).


L'API REST est documentée via un schéma [OpenAPI v3.2.0](https://spec.openapis.org/oas/v3.2.0), téléchargeable ici : [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). L'API est présentée sous forme lisible en anglais uniquement sur ce site à cette page : [https://ecorpus.eu/en/doc/hosting/apiDoc.html](/en/doc/hosting/apiDoc).
