---
title: Préparer un modèle 3D
rank: 2
---

## Les modèles 3D pris en charge par eCorpus.

Une scène eCorpus est initialisée par un modèle 3D au format GLTF Binary (abregé en .glb). Il s'agit d'une format de modèle 3D sufacique optimisé pour WebGL et une utilisation en ligne sur un navigateur internet..

Ce format est libre, il est défini par le Consotirum Khronos. Sa documentation est librement accessible sur la page github du projet.


## Tester votre modèles 3D

Nous préparons la fonctionnalité d'une Scène Stand Alone pour vous permettre de tester vos modèles 3D de manière simple.
\
En attendant que cette fonctionnalité ne soit accessible, vous aurez besoin d'un compte et d'un accès à une base de donnée eCorpus afin de tester vos modèles 3D.

## Préparer un modèle 3D

### A partir d'un logiciel de CAO en STL

Tutoriel à venir: concevoir un modèle 3D sur Fusion360
#### Sur Blender
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportSTLtoGLB_01.jpg" width ="500" />
\
Tout d'abord, veuillez Importer votre fichier STL grâce au bouton d'importer STL présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" />
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="500" />
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.

### A partir d'une numérisation 3D en OBJ

Tutoriel à venir: numériser avec votre smartphone

### A partir d'un nuage de point PLY

### Autres formats de fichier compatibles

FBX

DAE

USD*



## Charger un modèle 3D sur eCorpus.


## A vous de jouer

Intégration d'une scène eCorpus type

## Aller plus loin

Sommaire

## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="3-import">Importer son modèle dans une scène eCorpus</a>.