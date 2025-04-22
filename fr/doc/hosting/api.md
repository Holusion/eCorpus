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

Pour s'authentifier en ligne de commande, utiliser un header `Authorization` avec la valeur `Basic <base64(username:password)>`.

L'encodage du header est géré automatiquement par la plupart des utilitaires. Exemple avec curl :

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com/[...]
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
curl -XGET -u "${USERNAME}:${PASSWORD}" https://${HOSTNAME}/scenes/foo/models/foo.glb
```

Pour récupérer une ou plusieurs scènes :
```bash
curl -XGET https://${HOSTNAME}/scenes?name=${NAME}&format=zip
```
Vous pouvez ajouter autant de paramètres `name="..."` que nécessaire, séparés par des caractères `&`.


### Importation des données 

Pour importer une scène ou une collection de scènes exportées d'une instance eCorpus :

```bash
curl -XPOST https://${HOSTNAME}/scenes --data-binary "@${ZIP_FILE}" -u "${USERNAME}:${PASSWORD}" | jq .
```

Seul les comptes avec des droits d'**administrateur** peuvent effectuer cette requête.

Cette requête retourne une liste des changements effectués qui peut être assez longue. Vous pouvez filtrer les échecs en utilisant `jq .fail` ou si vous n'avez pas `jq` installé, vous pouvez utiliser curl en mode silencieux et inspecter uniquement le status de la réponse : `curl -s --fail -o /dev/null -w "%{http_code}"`.



### API REST et spécification

Les verbes `GET` `PUT` `MOVE` `COPY` `DELETE` `MKCOL` et `PROPFIND` sont supportés, avec un comportement se conformant généralement à la [spécification](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}. Attention tout de même : Il s'agit d'une implémentation partielle de la spécification.


L'API REST est documentée via un schéma [OpenAPI v3.1.0](https://spec.openapis.org/oas/v3.1.0), téléchargeable ici : [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). L'API est présentée sous forme lisible en anglais uniquement sur ce site à cette page : [https://ecorpus.eu/en/doc/hosting/apiDoc.html](/en/doc/hosting/apiDoc).
