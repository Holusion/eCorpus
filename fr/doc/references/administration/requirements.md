---
title: Exigences matérielles
---

## Exigences matérielles

### Besoins

Une petite instance d'eCorpus peut fonctionner sur à peu près n'importe quel appareil.

Toutes les opérations de stockage et de base de données se déroulent sur disque (voir [sqlite](https://www.sqlite.org/about.html)) ; un support de stockage local rapide, fiable et durable est donc **nécessaire**.

#### Exigences matérielles

 > Dépend fortement du trafic attendu et de la taille du corpus.

Au minimum, il faut s'attendre à :

 - Processeur : tout processeur double cœur ou supérieur.
 - RAM : 2 Go ou plus. L'utilisation de la mémoire doit être linéaire en fonction de la taille de l'ensemble des données.
 - Stockage : En fonction du jeu de données.

Il a été vérifié qu'il fonctionnait sur des systèmes aussi petits que 1 Go de RAM et 1 vCPU avec un petit ensemble de données et un faible volume de connexions.

#### Exigences logicielles

 - [Nodejs](https://nodejs.org/) v16 (LTS) ou supérieure.
 - Le système sous-jacent doit supporter [shared memory](https://en.wikipedia.org/wiki/Shared_memory) (pour le [WAL Log](https://sqlite.org/wal.html) de sqlite) - n'importe quel système d'exploitation moderne devrait convenir.

une chaîne d'outils pour compiler les addons nodejs natifs peut être nécessaire si [node-sqlite3](https://github.com/TryGhost/node-sqlite3/releases) ne fournit pas de module préconstruit fonctionnel pour votre plateforme.

Vous pouvez également utiliser [Docker] (https://www.docker.com/).

### Optimisation de la production

Mettre la base de données en mode WAL avec `PRAGMA journal_mode = WAL` peut grandement accélérer les opérations. L'optimisation de la mémoire en utilisant `PRAGMA soft_heap_limit` peut aider.

S'assurer que le système de fichiers est capable de gérer un grand nombre de fichiers dans un seul répertoire peut être important. Utilisez `tune2fs` pour activer **dir_index** pour les systèmes de fichiers **ext[234]**.

L'en-tête `Cache-Control` est très restrictif par défaut pour permettre un contrôle d'accès fin. Si tous les objets sont publics, il peut être remplacé par `Cache-Control : public` dans la plupart des cas.

### Limites

eCorpus sur sqlite est tout à fait capable de gérer quelques milliers d'objets avec un certain niveau de concurrence, pour un site web public de taille moyenne.

Pour tout ce qui est beaucoup plus important, il est recommandé de passer à un autre moteur de base de données ou d'utiliser un système conçu pour l'échelle comme [dpo-pakrat] (https://github.com/Smithsonian/dpo-packrat).
