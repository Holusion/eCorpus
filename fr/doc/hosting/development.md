---
title:  Développement
rank: 10
---

# Développement

## Mise en route

Voir le [guide d'installation rapide](/fr/doc/administration/deployment).

Utiliser la commande : `npm run watch` pour activer la recompilation automatique.


## Tests

### Tests unitaires
La partie serveur du code est testée avec [mocha](https://mochajs.org/){:target="_blank"} et [chai](https://www.chaijs.com/){:target="_blank"}. Voir `source/server/**/*.test.js`.

Lancer les tests unitaires avec :

```
npm test
```

Ou pour sélectionner des tests spécifiques :

```
(cd source/server && npm test -- --grep "test name")
```

 > Certaines lignes de `console.log` sont désactivées pour rendre la sortie standard des tests plus lisible. Il est possible de les réactivant en forçant la variable `TEST=0` en ligne de commande.

### Tests "end-to-end"

Les tests bout-en-bout sont dans le dossier `sources/e2e`. Naviguer dans ce dossier et lancer les tests avec les commandes :

```
npm i
npm test
```

## Gestion des sources

### Sous-modules

Surtout après une synchronisation avec le dépôt d'origine, il est nécessaire de mettre à jour les sous-modules. Par exemple :

```
git submodule update --recursive
```

Ou si le clone a été mal fait (sans `--recurse-submodules`) :

```
git submodule update --init --recursive
```

Pour supprimer les éventuelles modifications locales apportées aux sous-modules, utilisez :

```
git submodule foreach --recursive git reset --hard
```
Outils
Ce dépôt est régulièrement synchronisé avec [upstream](https://github.com/Smithsonian/dpo-voyager){:target="_blank"}. Les modifications sont apportées dans une branche `master` et sont fusionnées avec la branche `upstream/master`. Il est important de garder le portage de code le plus simple possible (voir par exemple : [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git){:target="_blank"}).

```
git merge -m "merge branch 'master' on $(git rev-parse --short master)" master
```
