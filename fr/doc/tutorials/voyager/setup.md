---
title: Configuration de la scène
description: Apprendre à configurer une scène dans dpo-voyager
---


## Configuration de la scène

Ce tutoriel passe en revue les principales options de configuration d'une scène dans DPO-Voyager.

Tout se passera sous l'onglet {% include sv_button.html name="parameters" style="width:150px" icon="eye" %}, avec le <img style="max-height:1.5rem" src="/assets/img/doc/scene_node.jpg" title="scene node" alt="scene node in voyager's hierarchy">nœud sélectionné.

### Navigation

#### Rotation des lumières

Par défaut, les lumières suivent la rotation de la caméra, donnant l'impression d'un objet central qui tourne sur lui-même. Désactiver `LightFollowCam` sous **Orbit Navigation** > **Navigation** rend les lumières fixes.

#### Zoom Lock

Limitez la distance à laquelle la caméra peut zoomer à l'aide des options **OrbitNavigation** > **Limits**.

Le réglage de `OrbitNavigation.Limits.Min.Offset.Z` empêchera la caméra de zoomer trop près.
Le réglage de `OrbitNavigation.Limits.Max.Offset.Z` empêchera la caméra de zoomer trop loin.

Changer `OrbitNavigation.Limits.<Min/Max>.Orbit.X` peut aussi aider pour les objets qui ont une mauvaise texture sous la caméra.r.

#### Contexte

Certaines intégrations seront plus esthétiques avec un arrière-plan assorti.

Définissez l'option **Arrière-plan** pour le modifier.


#### L'interface

La plupart des éléments d'interface peuvent être supprimés. Consultez **Reader** > **Enabled** ou **Viewer** > **Annotations** > **Visible** par exemple.