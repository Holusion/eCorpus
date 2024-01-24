---
title:  Développement
---

## Mise en route

Voir le [guide d'installation rapide](/fr/doc/tutorials/deployment).

Utiliser la commande : `npm run watch` pour activer la recompilation automatique.

## Sous-modules

Surtout après une synchronisation avec le dépôt d'origine, il est nécessaire de mettre à jour les sous-modules. Par exemple :

```
git submodule update --recursive
```

Ou si le clone a été mal fait (sans `--recurse-submodules`):

```
git submodule update --init --recursive
```

Pour supprimer les éventuelles modifications locales apportées aux sous-modules, utilisez :

```
git submodule foreach --recursive git reset --hard
```

Pour vérifier une fonctionnalité qui n'a pas encore été intégrée dans un sous-module, il est nécessaire d'utiliser la copie de Holusion (sur `https://github.com/Holusion/ff-*`). De préférence, créez une branche de fonctionnalité, contribuez-la en amont et utilisez-la **très temporairement** si c'est strictement nécessaire.

Modifiez le fichier `.gitmodules` pour changer l'URL source, puis exécutez :

    git submodule sync --recursive

Ensuite, dans le dossier du module de changement (c'est-à-dire `libs/ff-x`)
        
        cd libs/ff-xx
        git fetch
        git checkout origin/<feature-branch>

Enfin, dans le dossier racine :
    
        git add libs/ff-x

Validez les modifications de l'URL et de HEAD du sous-module.

## Tests

La partie serveur du code est testée avec [mocha](https://mochajs.org/) et [chai](https://www.chaijs.com/). Voir `source/server/**/*.test.js`.

Lancer les tests unitaires avec :

```
npm test
```

Ou pour sélectionner des tests spécifiques :

```
(cd source/server && npm test -- --grep "test name")
```

 > Certaines lignes de `console.log` sont désactivées pour rendre la sortie standard des tests plus lisible. Il est possible de les réactivant en forçant la variable `TEST=0` en ligne de commande.

## Synchronisation avec le dépôt d'origine

Ce dépôt est synchronisé avec [upstream](https://github.com/Smithsonian/dpo-voyager). Les modifications sont apportées dans une branche `master` et sont fusionnées avec la branche `upstream/master`. Il est important de garder le portage de code le plus simple possible[^1].

```
git merge -m "merge branch 'master' on $(git rev-parse --short master)" master
```



[^1]: Voir par exemple : [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git)