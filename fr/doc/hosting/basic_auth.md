---
title: Authentification (eCorpus v0.2.x)
visible: false
---

# S'authentifier sur eCorpus v0.2.x

> **Vous lisez le guide de l'ancienne version.** L'authentification HTTP *Basic* a été **supprimée dans
> eCorpus v0.3.0**, remplacée par les jetons d'accès personnels et OAuth2. Cette page ne concerne que les
> instances qui utilisent encore la branche stable **v0.2.x**. Pour v0.3.0 et suivantes, lisez le
> [guide d'authentification actuel](/fr/doc/hosting/api#authentification).

## Authentification HTTP Basic

Dans eCorpus v0.2.x, chaque route de l'API accepte des identifiants **HTTP Basic** — votre nom
d'utilisateur et votre mot de passe, envoyés avec chaque requête :

```bash
curl -u "<username>:<password>" https://ecorpus.holusion.com/scenes
```

La plupart des clients HTTP le supportent nativement (les URL `https://user:password@host/…`
fonctionnent aussi).

Gardez en tête ce que cela implique :

- votre **mot de passe réel** voyage avec chaque requête — ne l'utilisez que sur HTTPS ;
- l'identifiant d'un script ne peut être ni restreint ni révoqué, sauf à changer le mot de passe.

Ces limites sont la raison pour laquelle l'authentification Basic a été remplacée en v0.3.0 par des
jetons à portée limitée et révocables.

## Sessions de type navigateur

Le fonctionnement par cookie de session est le même que dans les versions ultérieures :

```bash
# Connexion, en enregistrant le cookie de session
curl -c cookies.txt -XPOST https://ecorpus.holusion.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<username>","password":"<password>"}'

# Réutilisation du cookie sur les requêtes suivantes
curl -b cookies.txt -XGET https://ecorpus.holusion.com/[...]
```

## Ce qui n'existe pas en v0.2.x

Les jetons d'accès personnels (`/auth/tokens`), les portées de jetons et le serveur d'autorisation OAuth2
(`/auth/oauth/*`) ont tous été introduits en v0.3.0. Sur une instance v0.2.x, les scripts et services
s'authentifient avec des identifiants Basic ou un cookie de session — il n'y a pas d'autre option.

Les niveaux d'accès par scène (`none < read < write < admin`, y compris `default_access` et
`public_access`) se comportent déjà comme décrit dans le
[guide actuel](/fr/doc/hosting/api#niveaux-daccès-par-scène).

La [référence de l'API](/en/doc/hosting/apiDoc) de ce site documente l'API **actuelle** ; la v0.2.x ne
possède pas les espaces `/auth/tokens`, `/auth/oauth/*`, `/auth/sessions`, `/groups`, `/tasks` et
`/services` qui y sont décrits.
