---
title: Exigences matérielles
rank: 2
---

## Exigences matérielles

### Besoins

Une petite instance d'eCorpus peut fonctionner sur à peu près n'importe quel appareil.

Les fichiers objets sont stockés sur disque et les métadonnées dans une base de données [PostgreSQL](https://www.postgresql.org/){:target="_blank"} ; un support de stockage local rapide, fiable et durable est donc **nécessaire**.

#### Exigences matérielles

 > Dépend fortement du trafic attendu et de la taille du corpus.

Au minimum, il faut s'attendre à :

 - Processeur : tout processeur double cœur ou supérieur.
 - RAM : 2 Go ou plus. L'utilisation de la mémoire doit être linéaire en fonction de la taille de l'ensemble des données.
 - Stockage : En fonction du jeu de données.

Il a été vérifié qu'il fonctionnait sur des systèmes aussi petits que 1 Go de RAM et 1 vCPU avec un petit ensemble de données et un faible volume de connexions.

#### Exigences logicielles

 - [Nodejs](https://nodejs.org/){:target="_blank"} v18 (LTS) ou supérieure (v20+ pour compiler depuis les sources).
 - Un serveur [PostgreSQL](https://www.postgresql.org/){:target="_blank"} (local ou distant). Le `docker-compose.yml` fourni utilise PostgreSQL 17.

Vous pouvez également utiliser [Docker](https://www.docker.com/){:target="_blank"}, qui fournit les deux via un simple `docker compose up`.

### Optimisation de la production

Ajuster le serveur PostgreSQL à votre charge (`shared_buffers`, `work_mem`, limites de connexions, etc.) - les réglages par défaut de la plupart des distributions sont conservateurs au-delà d'un usage léger.

S'assurer que le système de fichiers est capable de gérer un grand nombre de fichiers dans un seul répertoire peut être important. Utilisez `tune2fs` pour activer **dir_index** pour les systèmes de fichiers **ext[234]**.

L'en-tête `Cache-Control` est très restrictif par défaut pour permettre un contrôle d'accès fin. Si tous les objets sont publics, il peut être remplacé par `Cache-Control : public` dans la plupart des cas.

### Limites

eCorpus sur PostgreSQL est tout à fait capable de gérer quelques milliers d'objets avec un certain niveau de concurrence, pour un site web public de taille moyenne.

Pour tout ce qui est beaucoup plus important, il est recommandé de passer à un autre moteur de base de données ou d'utiliser un système conçu pour l'échelle comme [dpo-pakrat](https://github.com/Smithsonian/dpo-packrat){:target="_blank"}.
