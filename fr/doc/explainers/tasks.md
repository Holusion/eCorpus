---
title: Traitement des tâches
---

Le sous-système de traitement des tâches prend en charge toutes les opérations de longue durée, comme le traitement des fichiers envoyés par les utilisateurs, la compression des données, etc.


Les tâches sont créées par des requêtes API. Certaines peuvent être synchrones (la requête se termine lorsque la ou les tâches sous-jacentes sont terminées) ou asynchrones (la requête retourne immédiatement avec une référence vers la tâche créée, qui s'exécute en arrière-plan). Sauf indication explicite dans la documentation de l'API, toutes les tâches créées par une requête sont censées se terminer avec succès avant que la requête ne se conclue.

## Modèles de conception

### Identification

Toutes les tâches sont référencées par leur `task_id` (croissant de façon monotone). De plus, les tâches sont liées à un `scene_id` et/ou un `user_id`, selon leur contexte.

Toutes les tâches ont également un `type` défini qui détermine la façon dont elles seront traitées.

### Relations

#### Parent - Enfant

Une tâche peut avoir un `parent`, avec lequel elle partagera le même `scene_id` et le même `user_id`. Les tâches sans parent sont des **tâches racines**. Dans la plupart des vues, seules les tâches racines sont listées.

Il n'existe pas de relation d'ordre explicite entre un parent et un enfant, mais comme les tâches sont censées se terminer le plus rapidement possible, on s'attend généralement à ce qu'un parent se termine juste après avoir créé ses enfants.

#### Ordonnancement

Les relations entre les tâches sont définies sous la forme d'une table de liens `source -(m:n)-> target`. Cette relation est généralement matérialisée par une propriété `after` sur les tâches, listant tous les `task_id` qui doivent être dans l'état `success` pour que cette tâche puisse s'exécuter.

Au moment de l'exécution, les sorties des relations `after` d'une tâche sont disponibles via son paramètre `inputs`.

#### Chaînage des sorties

Une dernière couche de relation est disponible via les valeurs de retour des tâches. Si une tâche retourne un entier, il sera interprété comme un `task_id` et l'ordonnanceur de tâches attendra récursivement sur celui-ci lorsqu'on lui demandera d'attendre la fin d'une tâche.

Cela permet des schémas où une tâche racine crée un nombre arbitraire d'enfants de traitement, puis une dernière tâche qui rassemble les sorties de tous les autres enfants et retourne son `task_id`. Ainsi, quelqu'un qui attend la fin de la tâche racine recevra correctement le résultat final résolu avec un seul appel à `taskScheduler.wait()`.

Lorsqu'une tâche doit se résoudre en un groupe d'enfants, utilisez le modèle [map-reduce](#map-reduce).

### Flux de contrôle

#### Démarrage d'une tâche

Une tâche démarrera lorsque **TOUTES** ces conditions seront réunies simultanément :
- La tâche a le statut `pending`
- Toutes les tâches de sa propriété `after` ont le statut `success`
- Une file de traitement est disponible (le nombre de tâches concurrentes est strictement limité)

#### map-reduce

Un modèle `map/reduce` peut être réalisé à l'aide de `groupOutputsTask` et d'un langage de substitution de chaînes simplifié.

Les valeurs des `inputs` de la tâche sont mappées vers sa sortie en utilisant sa valeur de données et en substituant `$[<task_id>]` par la sortie de la tâche correspondante.




### Débogage des tâches

Activer les drapeaux `NODE_DEBUG` peut être assez verbeux, mais cela peut s'avérer très utile :

- **tasks:logs** : Afficher les journaux des tâches
- **tasks:scheduler** : Flux d'ordonnancement des tâches. Aide principalement à diagnostiquer les retours anticipés et les comportements inattendus de `wait`
- **tasks:processor** : Flux de traitement des tâches, pour diagnostiquer les problèmes de concurrence et les interblocages
