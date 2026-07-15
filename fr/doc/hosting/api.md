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

> **Note :** l'authentification HTTP *Basic* avec un nom d'utilisateur et un mot de passe n'est **plus prise en
> charge** pour les requêtes API. La façon recommandée d'authentifier un script ou un client en ligne de commande
> est désormais un **jeton d'accès personnel** (personal access token), envoyé dans le header `Authorization` en
> tant que jeton Bearer. Voir le [guide d'authentification](/en/doc/hosting/apiDoc#auth) dans la référence de l'API
> pour le détail complet (sessions, jetons, portées et OAuth2).

Créez un jeton depuis l'interface web (ou avec `POST /auth/tokens` depuis une session connectée), puis utilisez-le
comme jeton Bearer :

```bash
curl -XGET -H "Authorization: Bearer ecorpus_xxxxxxxx" https://ecorpus.holusion.com/[...]
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


L'API REST est documentée via un schéma [OpenAPI v3.1.0](https://spec.openapis.org/oas/v3.1.0), téléchargeable ici : [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). L'API est présentée sous forme lisible en anglais uniquement sur ce site à cette page : [https://ecorpus.eu/en/doc/hosting/apiDoc.html](/en/doc/hosting/apiDoc).
