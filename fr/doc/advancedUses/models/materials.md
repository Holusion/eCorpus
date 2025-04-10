---
title: Guide sur les matériaux 3D
rank: 8
---

## Guide avancé sur les Matériaux 3D

Un objet 3D est constitué d'informations numériques destiné à recréer une surace en relief. Cette surface se traduit d'un maillage composé de polygones, notamment de triangles et de <span style="text-decoration: underline dotted; cursor: help;" title="Un quad est une structure polygonale composée de 4 côtés, soit deux triangles">**quads**</span>.

<img src="/assets/img/doc/Blender_Mesh_01.jpg" width ="35%" alt="schéma de la composition d'un polygone 3D"/>

Un maillage est donc constitué de faces, <span style="text-decoration: underline dotted; cursor: help;" title="Un edge correspond à l'arrête d'une figure">**d'edges**</span> et <span style="text-decoration: underline dotted; cursor: help;" title="Un vertex correspond au sommet d'une figure">**de vertices**</span>, et peut être plus ou moins complexe en fonction du nombre de polygones qui le constitue.

*Par soucis technique, seuls les quads et triangles sont utilisés lors de la création d'un maillage 3D. Tout polygone dans le nombre de vertex est supérieur à 4, aussi nommé N-Gon, est à proscrire.*


### Qu'est-ce qu'une topologie de maillage 3D ?

La **topologie** d'une surface 3D correspond à **l'organisation des edges et des vertices** dans un maillage. Une mauvaise topologie peut entrainer des erreurs ainsi que divers problèmes lors de l'édition de votre modèle 3D (notamment si le modèle contient des <span style="text-decoration: underline dotted; cursor: help;" title="Un polygone composé de plus de 4 sommets">**N-Gons**</span> ou des points <span style="text-decoration: underline dotted; cursor: help;" title="Typiquement, un vertex ou un edge qui ne semble relié a aucun point de la structure">**Loose**</span>).

A contrario, une bonne topologie permet un travail plus rapide et propre concernant l'édition et la <span style="text-decoration: underline dotted; cursor: help;" title="Une déformation s'opère quand l'objet est animé">**déformation**</span> d'un maillage 3D.

#### Ce qui constitue une bonne topologie
Une topologie considérée comme bonne est majoritairement composée de quads (facilite largement le travail de modélisation dit "à la main", contrairement aux triangles) et contient des **Loops**, aussi appellés Boucles.

Un loop est un set de faces et d'edges qui, une fois sélectionné, forme une boucle continue. Ces loops permettent une sélection rapide d'un segment du modèle 3D, et s'avère très utile pour les modèles contenant beaucoup de polygones. 

Un modèle contenant de bons loops aura de meilleures déformations une fois animé, et sera plus simple à traiter pour l'édition de certains paramètres.

#### Comment opérer avec une topologie d'objets scannés
Typiquement, **les maillages générés par nummérisation d'objets** via nuages de points sont considérés comme de **mauvaises topologies**.

En effet, la topologie est générée suivant des algorythmes construits en fonction des informations reconnus dans le nuage de points. Elle peut également se réveler comme <span style="text-decoration: underline dotted; cursor: help;" title="Un objet Non-Manifold ne pourrait pas exister dans la réalité, car il contient des informations mathématiques contradictoires avec les lois de la physique">**Non-Manifold**</span>.

* Heureusement, il est tout de même tout à fait possible de travailler avec ces objets. Un guide d'édition Blender pour sera bientôt disponible pour vous apprendre à éditer facilement votre modèle 3D selon les contraintes apportées par ce type d'objet.

* Pour en savoir plus sur la composition d'une structure 3D, nous vous invitons à découvrir la [documentation Blender](https://docs.blender.org/manual/en/latest/modeling/meshes/structure.html), très complète à ce sujet.