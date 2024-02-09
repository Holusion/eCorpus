---
title: Utiliser Voyager Story de manière collaborative
tags: [dev]
---

Comme toute application web, l'éditeur de [Voyager Story](https://smithsonian.github.io/) de la Smithsonian Digitization Office est susceptible d'être utilisé en parallèle par plusieurs personnes. Cela pose problème lorsque deux personnes modifient le même fichier en même temps, car la dernière personne à enregistrer écrasera les modifications de l'autre.

Rien ne protège nativement contre cela dans l'architecture originale, car ce n'est pas quelque chose qui semble se produire dans le pipeline des auteurs. Cependant, à mesure que nous ciblons de plus en plus les environnements d'apprentissage, il est devenu l'une de nos fonctionnalités les plus demandées.

Cet article est le premier d'une série d'articles décrivant le travail effectué pour rendre l'éditeur de Voyager Story collaboratif.

Dans cet article, nous décrirons le problème et l'approche générale que nous avons adoptée pour le résoudre. Le prochain article décrira les aspects techniques importants.

## Définir nos objectifs

La collaboration est difficile; en particulier sur le web. Créer un "environnement multi-utilisateurs" peut signifier un certain nombre de choses selon votre cas d'utilisation. Il est donc important de définir clairement nos objectifs de collaboration avant de nous lancer dans les détails de la mise en œuvre.

Pour notre cas d'utilisation d'un environnement d'apprentissage, nous pouvons définir nos objectifs comme suit :

 - Les utilisateurs doivent pouvoir travailler sur un fichier de scène quand ils le souhaitent, sans avoir à attendre que les autres aient fini.
 - Nous ne nous soucions pas trop de la cohérence des données car notre base de données peut toujours restaurer une version précédente de n'importe quel fichier.
 - Nous nous attendons à ce que la plupart des modifications se produisent sur les "tours", les "annotations" et les "articles". Il n'est pas prévu que d'autres propriétés de la scène changent souvent, encore moins en parallèle.

## Un bref aperçu

Il existe traditionnellement deux façons de gérer la concurrence côté client dans les applications web :

#### Verrouillage

 > C'est ce que fait **WebDAV**.

Ce mécanisme, souvent appelé "Verrouillage pessimiste" (pessimistic locking), peut avoir de nombreuses variations mineures, mais à sa base :

  - Un utilisateur informe le serveur qu'il souhaite modifier une ressource en émettant une requête LOCK.
  - La ressource reste verrouillée jusqu'à ce que l'utilisateur émette une requête UNLOCK ou que le verrou expire.
  - Tout utilisateur essayant de modifier une ressource verrouillée ne pourra pas commettre de modifications tant que le verrou n'est pas libéré.


Cela introduit beaucoup de cas limites et de modes de défaillance, qui sont gérées de différentes manières par les différentes normes et implémentations. Par exemple, les verrous peuvent être obligatoires (comme dans [RFC4918](https://datatracker.ietf.org/doc/html/rfc4918#section-7.2)), ou consultatifs (comme dans [Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Edit_lock)).

La principale limitation d'un mécanisme basé sur le verrouillage est qu'il **ne permet aucune concurrence**. C'est juste un mécanisme pour empêcher les conflits de se produire.

#### Reconciliation

  > C'est ce que fait **Google Docs**.

En réduisant les actions des utilisateur à un jeu de changements atomiques, un algorithme peut être conçu pour réconcilier les changements, indépendamment de l'ordre dans lequel ils se sont produits.

ie. Résoudre ceci :
```
A -> B
 \-> C
```
vers ceci :
```
A -> B -> C'
```

C'est une version simplifiée de l'algorithme de fusion à trois voies[^1] utilisé dans les systèmes de contrôle de version comme Git. Cela peut permettre autant de concurrence que nécessaire, selon la qualité de l'algorithme de fusion pour gérer les conflits ou le temps que vous êtes prêt à passer à les résoudre.

Dans un premier temps, nous avons voulu savoir jusqu'où un mécanisme de fusion purement automatique pourrait nous mener, avant d'explorer d'autres options.

## La Fusion

 > Ou **merge**, pour les anglophones.

La fusion des changements peut être décomposée en deux étapes :

 - calculer un "patch" qui représente les changements soumis par l'utilisateur
 - Appliquer ce patch à la version actuelle du fichier

### Détecter les changements

Pour fusionner les changements, le serveur doit savoir quelle version du fichier l'utilisateur pense qu'il est en train d'enregistrer (un **parent**, dans le langage du contrôle de version). En raison de la nature journalisée d'**eCorpus**, ce n'est pas très difficile à réaliser : nous sommes sûrs d'avoir toutes les versions de fichiers disponibles sur le serveur. Il nous suffit d'en connaitre l'identifiant.

Une façon simple est d'envoyer une sorte de *[nonce](https://en.wikipedia.org/wiki/Cryptographic_nonce)* ou un ID de version avec le fichier, que le client renverra lorsqu'il POSTera une mise à jour.

De cette façon, le serveur sait quelle version le client veut mettre à jour et peut déterminer si une fusion est nécessaire.


C'est une situation de [contrôle de concurrence optimiste](https://en.wikipedia.org/wiki/Optimistic_concurrency_control). Plusieurs mécanismes peuvent être utilisés pour fournir au serveur l'ID de version :

 - renvoyer l'ETag du fichier comme en-tête **If-Match** avec la requête PUT
 - Injecter des données invisibles dans le fichier lui-même avant de l'envoyer au client. Le client envoie alors inconsciemment ces données au serveur lorsqu'il PUT le fichier modifié.

La première option est clairement meilleure pour la découvrabilité et la praticité, mais nécessite plus de code côté client. Notre implémentation utilisera la deuxième option comme preuve de concept et devrait migrer vers la première option à l'avenir.

### Fusion des changements

La fusion est un problème complexe, il y aura toujours des cas hypothétiques où fusionner tous les changements est impossible, surtout avec un format de fichier qui n'a pas été principalement conçu pour la collaboration.

Pour simplifier le problème à une complexité gérable, nous avons décidé de ne gérer que les conflits les plus courants, tout en dégradant vers un simple écrasement lorsque la fusion est impossible. Le principal objectif de cette approche est d'éviter autant que possible la corruption de la scène, même si cela signifie perdre certaines modifications. Cette perte ne serait pas irrécupérable, car la version perdue de la scène serait toujours disponible dans l'historique.

Sans entrer dans trop de détails, nous pouvons décomposer notre problème par types de fichiers :

 - les fichiers basés sur du texte (articles) peuvent être fusionnés à l'aide d'algorithmes de fusion de texte non structuré. Une simple application de *patch flou* peut suffire à gérer la plupart des changements.
 - les fichiers binaires (modèles, images, sons) ne seront généralement pas fusionnés.
 - les fichiers de scène doivent être fusionnés structurellement.

On peut facilement voir que les fichiers de scène seront bien plus complexes à fusionner correctement : ils contiennent la majorité des changements qu'un utilisateur soumet et non seulement ils sont assez complexes, ils doivent rester structurellement cohérents pour être utilisables.

C'est le principal objectif de notre effort pour apporter la collaboration à Voyager. Nous avons implémenté une couche d'abstraction côté serveur pour produire une représentation intermédiaire de la scène à partir du document soumis par l'utilisateur ainsi que de la version actuelle de la scène. Nous calculons et appliquons ensuite un patch à partir de ces représentations. Le résultat est finalement sérialisé dans un fichier de scène `.svx.json`.

Cela garantit que la scène calculée reste toujours cohérente et utilisable.

### Une note sur les modes de défaillance

Il est typique que les requêtes HTTP[^2] échouent avec `412 Precondition Failed` pour les requêtes protégées par `If-Match` lorsque une fusion sûre n'est pas possible. Cependant, dans notre cas, les utilisateurs n'ont aucun moyen de récupérer d'une telle erreur sans perdre toutes leurs modifications.

Nous avons plutôt décidé de dégrader vers un simple écrasement dans ce cas. Ce n'est pas idéal, mais c'est le seul moyen d'éviter la perte de données. Pendant ce temps, la version écrasée de la scène sera toujours disponible dans l'historique.

### Après la fusion

Une fois la fusion terminée, le client doit concilier la nouvelle scène fusionnée avec ce qu'il a chargé. Cela pourrait être facilement réalisé en rechargeant entièrement le document de la scène. Cependant, cela déclencherait une suppression de tous les nœuds chargés et gèlerait la scène pendant plusieurs secondes.

La source de presque tout le temps d'attente peut être décomposée en :

 - télécharger les ressources
 - transférer les textures/géométries au GPU

Comme le cache de navigateur, le coût du téléchargement peut généralement être ignoré. Mais le transfert des textures et des géométries vers le GPU prend toujours beaucoup de temps.

Pour éviter ce délai, nous avons prototypé un cache interne des `Object3D` déjà chargés dans le GPU que nos modèles peuvent réutiliser. De cette façon, lorsqu'un modèle est recréé, il peut réutiliser l'`Object3D` mis en cache au lieu de devoir analyser à nouveau le fichier. Le moteur de rendu détectera que les textures et les géométries n'ont pas changé et sautera le transfert.

## Conclusion

Avec un moyen de détecter les changements concurrents et un moyen de les fusionner, la plupart des cas d'utilisation de la collaboration seraient couverts.

Les données du monde réel vont évidemment faire surface plus de cas limites. Cependant, l'application doit être mise à un point où la collaboration est *suffisamment bonne* pour permettre la collecte de données pour améliorer l'algorithme de fusion et gérer ces cas. La nature journalisée d'eCorpus nous permet d'être quelque peu laxistes sur la cohérence des données, sachant que nous pourrions toujours récupérer n'importe quel fichier enregistré pour remettre manuellement les données perdues.

L'a article suivant décrira plus en détail comment nous avons réussi à traduire les fichiers de scène en un arbre abstrait et les techniques que nous avons utilisées pour les fusionner.

[^1]: Smith, R.: GNU diff3
[^2]: rfc4918 section-12.2