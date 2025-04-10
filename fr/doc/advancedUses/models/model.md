---
title: Préparer un modèle 3D
rank: 4
---

## Les modèles 3D pris en charge par eCorpus.

Une scène eCorpus est initialisée par un modèle 3D au format GLTF Binary (abregé en .glb). Il s'agit d'une format de modèle 3D sufacique optimisé pour WebGL et une utilisation en ligne sur un navigateur internet.

Ce format est libre, il est défini par le Consotirum Khronos. Sa documentation est librement accessible sur la [page github du projet](https://github.com/KhronosGroup/glTF).


### Somaire

* [Comprendre les matériaux de son objet 3D](#materiaux)

* [Tester l'import de son modèle 3D sur eCorpus](#tester-un-modèle-3d)

* [Importer son modèle sur Blender](#importer-son-modèle-sur-blender)

* [Les spécifités des formats](#préparer-un-modèle-3d)

    * [STL (.stl)](#a-partir-dun-logiciel-de-cao-en-stl)

    * [Wavefront (.OBJ)](#a-partir-dune-numérisation-3d-en-obj)

    * [Sta

    Comprendre les matériaux de son objet 3D

    Tester l’import de son modèle 3D sur eCorpus

    Importer son modèle sur Blender

    Les spécifités des formats

        STL (.stl)

        Wavefront (.OBJ)

        Standfort PLY (.PLY)
ndfort PLY (.PLY)](#a-partir-dun-format-ply)

    * [FBX (.FBX)](#a-partir-dun-format-fbx)

    * [Collada (.DAE)](#a-partir-dun-format-dae)

    * [Univ. Scene Desc.(.USD*)](#a-partir-dun-format-usd)

* [Exporter son modèle en GLB](#exporter-son-modèle-3d-en-glb)

* [Aller plus loin dans la compréhension des modèles 3D](#en-savoir-plus)

### Materiaux

Les modèles utilisent un système de PBR (*Physically Based Rendering*) permettant des rendus aussi photoréalistes que possible.

<img src="/assets/img/doc/gltf_maps.jpg" width="100%" alt="types de textures supportées sur gltf" />



#### Un modèle intègre les couches d'information suivantes : 

|Nom de l'information | Modifiable sur eCorpus | Description |
| :-------------------|:----------------------:|-------------|
| **Base Color** | Oui | Couleurs brutes de la surface du modèle. La base color est essentielle dans la numérisation 3D|
| **Metallic** | Oui | Défini si le matériau a des propriétés de réflexion métallique ou non. Cette information est dispensable si l'objet ne contient pas de trace métallique.|
| **Roughness** (ou glossiness) | Oui | Définit le niveau de brillance de la surface du modèle (la glossiness est l'inverse de la roughness).|
| **Ambient Occlusion** | Oui | Accentue artificiellement les ombres dans les recoins et interstices du modèle. |
| **Normal Map** | Non | Ajoute artificiellement des micro-détails de surface sans toucher à la géométrie de l'objet. Ajoute du détail sans alourdir la densité de l'objet. |
| **Emissive** | Non | Définit si l'objet est rétro-éclairé ou non. |


*Astuce : Les trois textures de Metallic, Roughness et Ambient Occlusion partagent une seule et même image en utilisant les canaux R, V et B. Ainsi, utiliser une seule d'entre elles ou bien les 3 en même temps n'a pas pas d'influence sur le poids du fichier et ses performances.*

**Documentation complète** : [Tout savoir sur l'export GLTF sur Blender](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)



## Tester un modèle 3D

**Modèle 3D** : Vous pouvez utiliser les modèles 3D en GLTF de démonstration sur [ce lien](https://github.com/KhronosGroup/glTF-Sample-Models).

Vous pouvez utiliser [ce modèle au format .glb](/assets/3d/DamagedHelmet.glb).

[<img src="/assets/img/doc/DamagedHelmet_Preview.jpg" width="35%" alt="Prévisualisation du modèle de Test" />](/assets/3d/DamagedHelmet.glb)

Vous n'avez pas de compte eCorpus ? Pas de soucis ! Le mode Stand Alone vous permet de tester vos modèles 3D sans avoir de compte sur une base eCorpus : 

[Cliquez ici pour accèder à la scène test Standalone](https://ecorpus.fr-scv.fr/ui/standalone)

Pour se faire, glisser simplement votre modèle en GLB dans la scène ci-dessus. L'objet apparaitra dans le scène si l'importation a réussi.

*Attention ! Cette scène ne peut pas être sauvegardé, tout changement réalisé sera perdu.*

* Si vous souhaitez en savoir plus sur l'importation des modèles sur eCorpus, veuillez vous referrer à <a href="import">ce guide</a>.

## Préparer un modèle 3D


#### Prérequis : Blender

Pour éditer, transformer et exporter vos modèles 3D, Blender est le logiciel le plus adapté.

Libre et gratuit, vous pouvez le télécharger pour toute plateforme sur le site officiel : [blender.org](https://www.blender.org/).

### Importer son modèle sur Blender

Pour éditer et exporter vos modèles 3D sur **Blender**, il vous faut d'abord les importer sur le logiciel. Pour cela, ouvrez tout d'abord Blender.

##### Nettoyer la scène de démarrage
Dés l'ouverture, le logiciel crée une scène par défaut contenant une camera, une lumière, ainsi qu'un cube. Ces objets sont superflus, nous vous conseillons de les supprimer via cette manipulation:

* Appuyez sur la touche **A** (pour sélectionner tous les objets présents dans la scène);

* Appuyez sur la touche **Suppr** (pour supprimer les objets selectionnés).

##### Importer son modèle
Pour importer un modèle 3D, veuillez vous rendre dans la barre d'onglets tout en haut de l'application, côté gauche, et cliquer sur: 

* File> Import> Sélectionner le format correspondant au modèle à importer

<img src="/assets/img/doc/ExportSTLtoGLB_01.jpg" width ="500" height="500" alt="illustration models" />


##### Ajouter un add-on
La procèdure est la même, quel que soit le format à importer. Si votre format de modèle 3D ne se trouve pas dans la liste, il se peut qu'un add-on soit disponible pour vous permettre de l'ajouter à la liste:
references
Tapez le nom du format à importer dans la barre de recherche. Il vous suffit ensuite de cocher la case de l'add-on à ajouter.

*Il se peut que Blender ne se mette pas tout de suite à jour après avoir ajouter un add-on. N'hésitez pas à fermer et rouvrir Blender pour que les changements soient pris en compte.*

### A partir d'un logiciel de CAO en STL

#### Le STL (stéréolithographie) 
Un format de fichiers 3D principalement destiné à **l'impression 3D**. Elle ne **comporte pas d'information de couleur ou de texture** comme elle ne sert pas dans ce contexte.

Les STL sont facilement généré par les logiciels de <span style="text-decoration: underline dotted; cursor: help;" title="Conception Assisté par Ordinateur">**CAO**</span> tel que SolidWorks, AutoCAD ou FreeCAD.

* *Tutoriel à venir: concevoir un modèle 3D sur le logiciel Fusion360 et FreeCAD*

#### Caractéristiques détaillées de format .STL

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Non|
|Vertex Color| Non|
|Animations| Non|
|Metadonnées| Non|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Le format .STL est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code ne peut-être lu qu'avec un logiciel compatible">**format proprietaire**</span>. Il est donc déconseillé d'avoir recourt à ce format.


### A partir d'une numérisation 3D en OBJ

#### Le Wavefront (OBJ)
Un format de fichiers 3D **le plus couramment utilisé** lors de partage de modélisation 3D. Largement reconnu par la plupart des logiciels d'édition 3D, il est utilisé pour des usages tels que l'impression 3D, le rendu architectiral et la réalité virtuelle.

Ce format simple permet de stocker de nombreuses informations de données. Il est souvent associé à un **fichier complémentaire** de métadonnées (.mtl).
Cependant, toutes les applications ne lisent pas les OBJ de la même façon. De légères différences avec le fichier original peuvent donc apparaitre lors de l'importation. Heureusement, ces problèmes peuvent être aisement corrigés.

De part cette **contrainte de compatibilité**, il est recommandé de garder les textures du modèles dans un dossier complémentaire pour pouvoir les réimporter sur le modèle si besoin.

* *Tutoriel à venir: numériser avec votre smartphone et des applications de photogrammétrie*

#### Caractéristiques détaillées de format .OBJ

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Oui|
|Vertex Color| Non|
|Animations| Oui|
|Metadonnées| Oui|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Le format .OBJ est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code est lisible et reconnaissable par l'être humain">**format libre**</span>.


### A partir d'un format PLY

#### Le Standfort File Format (PLY)
Egalement appelé **P**o**ly**gon, est un format de fichiers 3D utilisés le plus fréquemment par les **scanners 3D** en tant que nuage de points, ou objet 3D. Il permet de stocker de nombreuses informations, telles que la couleur et la texture d'un objet.

Il est fréquemment utilisé pour l'impression 3D et de la représentation réaliste des objets.

* Les fichiers .PLY contiennent des informations de couleurs d'un objet, néanmoins, celles-ci ne sont pas forcément présentes sous forme de texture. Si la couleur de votre objet 3D est affichée en tant que Vertex Color, il sera nécessaire de réaliser un baking de texture afin de pouvoir les exporter en format .GLB.

* Les fichiers .PLY sont susceptibles de contenir des nuages de points. Or, seuls les maillages 3D peuvent être exporter sous format .GLB, et donc importés dans eCorpus.

#### Caractéristiques détaillées de format .PLY

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Oui|
|Vertex Color| Oui|
|Animations| Non|
|Metadonnées| Oui|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Un tutoriel avancé sur la conversion de nuages de points en maillage 3D devrait voir le jour sous peu.

* Le format .PLY est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code est lisible et reconnaissable par l'être humain">**format libre**</span>.


### A partir d'un format FBX

#### Le FilmBox (FBX)
Un format de fichiers 3D utilisés le plus fréquement pour des éléments graphiques de **jeu vidéo et d'effets spéciaux**. Il permet le stockage d'un grand nombre de données, telles que la texture et l'armature animable (rig) d'un objet.

Il est le plus souvent utilisé avec les applications **AutoDesk**, telles que 3DS Max ou encore Maya.

A l'instar du format .OBJ, les **contraintes de compatibilité** peuvent entrainer de légères différences entre le modèle de départ et le modèle importé. Il est donc recommandé de garder les textures du modèles dans un dossier complémentaire pour pouvoir les réimporter sur le modèle si besoin. 

#### Caractéristiques détaillées de format .FBX

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Oui|
|Vertex Color| Non|
|Animations| Oui|
|Metadonnées| Oui|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Le format .FBX est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code ne peut-être lu qu'avec un logiciel compatible">**format proprietaire**</span>. Il est donc déconseillé d'avoir recourt à ce format.

### A partir d'un format DAE

#### Le Collada (DAE)
Un format de fichiers **aussi bien 2D que 3D**. Il peut contenir un large panel d'informations de textures et d'armature animable (rig), tout comme le FBX. 

De par sa nature dite *libre d'utilisation*, ce format de fichier est conçu pour être **compatible avec le plus de plateformes possibles**.

#### Caractéristiques détaillées de format .DAE

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Oui|
|Vertex Color| Oui|
|Animations| Oui|
|Metadonnées| Oui|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Le format .DAE est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code est lisible et reconnaissable par l'être humain">**format libre**</span>.

### A partir d'un format USD*

#### Le Universal Scene Description (USD*)
Egalement appelé OpenUSD, est un format de fichiers 3D utilisé dans les rendus graphiques d'architectures, d'effets spéciaux et de CAD. Le format général USD est couramment suivi d'une '*' car il existe une **large variété d'encodage différents** du format (.usd, .usda, .usdc, .usdz, etc...).

Ce format peut contenir un large panel d'information et est couramment utilisé pour l'**édition collaborative** de scenes 3D.

#### Caractéristiques détaillées de format .USD*

|Information| Disponible sur ce format|
|:----------|-----------:|
|Textures| Oui|
|Vertex Color| Oui|
|Animations| Non|
|Metadonnées| Oui|

#### A Noter 
* Il vous ait possible d'ajouter des informations de matériau basique via l'édition d'objets de eCorpus. Un tutoriel sur ce sujet sera bientôt disponible.

* Un tutoriel avancé sur l'édition de modèles 3D sur Blender sera également bientôt disponible.

* Le format .USD* est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code est lisible et reconnaissable par l'être humain">**format libre**</span>.

### Exporter son Modèle 3D en .GLB

Le format <span style="text-decoration: underline dotted; cursor: help;" title="Graphics Library Transmission Format">**glTF**</span> (de nomenclature .glb) est un format permettant de stocker des ressources 3D complexes dans un fichier unique avec une portabilité maximale. C'est par conséquent le format le plus adapté pour un visionnage Web et Mobile. 

* Le format .glTF est un <span style="text-decoration: underline dotted; cursor: help;" title="Son code est lisible et reconnaissable par l'être humain">**format libre**</span>.

#### Exporter son modèle 3D en GLB sur Blender

Une fois votre modèle importé et édité sur Blender, vous pouvez l'exporter facilement en suivant cette manipulation:

* Selectionnez le ou les objets à exporter (Shift + clic Gauche pour ajouter des objets à votre sélection);
* Allez dans File> Export> glTF 2.0 (.glb/.glft).

<img src="/assets/img/doc/ExportSTLtoGLB_02.jpg" width ="500" height="500" alt="illustration models"/>

#### Si l'extension GLB n'apparait pas dans la liste

Il est possible que l'extention glTF n'apparaisse pas dans la liste de format disponibles à l'export. Si tel est le cas, il vous suffit [d'activer l'Add-On glTF 2.0](#ajouter-un-add-on) dans la liste des Préférences.

#### Les paramètres d'export conseillés

Une fois le bouton d'export glTF cliqué, un pop-up apparaitra pour vous demander dans quel dossier et sous quel nom votre fichier sera enregistré. Vous trouverez également des paramètres d'export à droite de cette nouvelle fenêtre.

<img src="/assets/img/doc/ExportGLB_00.jpg" width ="300" height="700" alt="illustration models"/>

Voici les paramètres recommandés pour vos exports en GLB. 

Tout d'abord, nous vous conseillons de cocher la case **Selected Object Only** pour être sûr de n'exporter que l'objet selectionné.
\
Ensuite, dans "Data" et "Material" selectionnez le format "WebP" en compression 90 pour les textures.
\
Puis, cochez la case "Compression" pour alléger encore plus votre modèle.


## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="import">Importer son modèle dans une scène eCorpus</a>.


* [Revenir en haut de la page](#les-modèles-3d-pris-en-charge-par-ecorpus)