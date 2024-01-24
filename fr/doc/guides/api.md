---
title: Utiliser l'API
---

eCorpus fournit une API en deux parties:

 - webDAV sur `/scenes/**` pour accéder aux fichiers des scènes
 - REST sur `/api/v1/**` pour la gestion administrative

## Authentification

Pour s'authentifier en ligne de commande, utiliser un header `Authorization` avec la valeur `Basic <base64(username:password)>`.

L'encodage du header est géré automatiquement par la plupart des utilitaires. Exemple avec curl:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com/[...]
```

## API webDAV

Organisation des fichiers:

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

Ainsi pour récupérer un modèle:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com//scenes/foo/models/foo.glb
```

Les verbes `GET` `PUT` `MOVE` `COPY` `DELETE` `MKCOL` et `PROPFIND` sont supportés, avec un comportement se conformant généralement à la [spécification](http://www.webdav.org/specs/rfc4918.html).


## API REST

L'API REST est accessible sur `/api/v1/`. Elle utilise les verbes standard HTTP.

Voir la [référence des routes](/fr/doc/references/api) pour plus de détails.
