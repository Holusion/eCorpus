---
title: Préparer un modèle 3D
rank: 2
---

## Les modèles 3D pris en charge par eCorpus.

Une scène eCorpus est initialisée par un modèle 3D au format GLTF Binary (abregé en .glb). Il s'agit d'une format de modèle 3D sufacique optimisé pour WebGL et une utilisation en ligne sur un navigateur internet..

Ce format est libre, il est défini par le Consotirum Khronos. Sa documentation est librement accessible sur la page github du projet.


## Tester votre modèles 3D

Si vous n'avez pas encore de base de donnée eCorpus ou de compte utilisateur, vous pouvez tout de même tester l'importation de vos modèles via cette scène Stand Alone:
\
[Cliquez ici pour accèder à la scène test Standalone](https://ecorpus.fr-scv.fr/ui/standalone)
\
Pour se faire, glisser simplement votre modèle en GLB dans la scène ci-dessus. L'object apparaitra dans le scène si l'importation a réussi.

Cette scène ne peut pas être sauvegardé, tout changement réalisé sera perdu. Aucun des modèles envoyés sur cette scène ne sera récupérer.

## Préparer un modèle 3D

### A partir d'un logiciel de CAO en STL

Tutoriel à venir: concevoir un modèle 3D sur Fusion360
#### Sur Blender
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportSTLtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier STL grâce au bouton d'importer STL présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500" />
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.

### A partir d'une numérisation 3D en OBJ

Tutoriel à venir: numériser avec votre smartphone

#### Sur Blender
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportOBJtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier OBJ grâce au bouton d'importer OBJ présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500"/>
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.


### A partir d'un nuage de point PLY

#### Sur Blender
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportPLYtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier PLY grâce au bouton d'importer PLY présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500"/>
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.


### Autres formats de fichier compatibles

#### FBX
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportFBXtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier FBX grâce au bouton d'importer FBX présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500"/>
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.


#### DAE
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportDAEtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier DAE grâce au bouton d'importer DAE présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500"/>
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.


#### USD*
Blender est un logiciel d'édition 3D gratuit que vous pouvez utiliser pour importer vos modèles afin de les exporter en GLB.
<img src="/assets/img/doc/ExportUSDtoGLB_01.jpg" width ="500" height="500" />
\
Tout d'abord, veuillez Importer votre fichier USD* grâce au bouton d'importer USD* présent dans Blender.
<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500"/>
\
Une fois votre modèle importé, vous pouvez l'exporter via le bouton d'Export en GLB présent dans Blender.
<img src="/assets/img/doc/ExportGLB_00.jpg" width ="400" height="1000"/>
\
Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case "Selected Object Only" pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Ensuite, cochez la case "Compression" pour alléger encore plus votre modèle.




## Charger un modèle 3D sur eCorpus.


## A vous de jouer

Intégration d'une scène eCorpus type

## Aller plus loin

Sommaire

## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="3-import">Importer son modèle dans une scène eCorpus</a>.