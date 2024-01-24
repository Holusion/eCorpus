---
title: API eCorpus
---

# Principes

Voir le [guide d'utilisation de l'API](/fr/doc/guides/api).

Toutes les routes doivent être préfixées de `/api/v1/`.

Certaines routes requièrent des droits d'administration.

## /login

### GET /login



### POST /login

Authentifie un utilisateur

### GET /login/:username/link

Retourne un lien de connexion pour l'utilisateur concerné au format `text/plain`.

Exemple de contenu
```text
https://irhis.ecorpus.holusion.com/api/v1/login?payload=[...]&redirect=%2F
```


### GET /users

Retourne la liste des utilisateurs au format JSON suivant le schéma suivant:

```json
[
  
  {
    "uid": 280255476455992,
    "isAdministrator": false,
    "username": "jdupont",
    "email": "jean.dupont@example.com"
  }
]
```

### POST /users

Crée un utilisateur

Le corps de la requête doit être au format `application/json`. Exemple avec curl:

```bash
curl -XPOST -H "Content-Type: application/json" -d "{\"username\":\"jdupont\", \"password\":\"some_secret_string\", \"isAdministrator\":false, \"email\":\"jean.dupont@example.com\"}" https://ecorpus.example.com/api/v1/users
```

la propriété `username` doit satisfaire l'expression régulière suivante: `/^[\w]{3,40}$/`.

### DELETE /users/:uid

Supprime un utilisateur en utilisant son `uid`.

Requiers un droit d'administration

### PATCH /users/:uid

Change une ou plusieurs propriétés d'un utilisateur en utilisant son `uid`.

Le corps de la requête doit être au format `application/json`. Même format que pour la création d'utilisateur.

### GET /scenes

Le comportement diffère selon le format attendu (header `Accept`)

#### application/json

Récupère la liste des scènes au format JSON. Plus efficace que `PROPFIND /scenes`.

#### application/zip

Récupère un zip de l'ensemble des scènes de l'instance.


### POST /scenes
 > postScenes

```json
[
  {
    "name": "test",
    "author_id": 280255476455992,
    "author": "jdupont",
    "id": 36943841590670,
    "access": {
      "any": null,
      "default": "none"
    },
    "ctime": "2023-10-04T12:26:10.000Z",
    "mtime": "2023-10-04T12:26:11.000Z"
  }
]
```



### POST /scenes/:scene

Crée une scène. Attends des données en format `multipart/form-data`. le champ `scene` doit contenir un fichier [glb](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification).



### PATCH /scenes/:scene

Permet de renommer une scène en envoyant un champ `name` dans le corps de la requête.

### GET /scenes/:scene/history

Récupère l'historique complet d'une scène

### POST /scenes/:scene/history

Modifie l'historique d'une scène

### GET /scenes/:scene


Le comportement diffère selon le format attendu (header `Accept`)

#### application/json

Données de la scène au format JSON

#### application/zip

Ensemble des sources de la scène dans leur dernière version au format zip

### GET /scenes/:scene/files

Liste les fichiers de la scène

### GET /scenes/:scene/permissions

Liste les permissions de la scène

### PATCH /scenes/:scene/permissions

Modifie les permissions de la scène