---
title: Utiliser les Outils eCorpus
description: Apprendre à utiliser les Outils et paramètres de DPO-Voyager
rank: 8
---

## Apprendre à utiliser les Outils et paramètres d'une scène DPO-Voyager

A ne pas confondre avec les paramètres d'édition de scène, **les outils et paramètres constitue un ensemble de fonctionalités** accessible à l'utilisateur aussi bien en mode d'édition qu'en **mode de visionnage**. 

Avec ceux-ci, pour pouvez, entre autre, changer le point de vue de la caméra (passer d'une vue perspective à orthographique), modifier l'éclairage de la scène, découper le modèle selon un axe ou encore le mesurer avec un outil de règle.




### Sommaire

* [Comprendre les Outils et les paramètres de scène](#comprendre-ce-que-sont-les-outils-et-paramètres-dune-scène)
* [Liste des Outils présents](#loutil-vue)
    * [L'Outil Vue](#loutil-vue)
        * [Réaliser une Orthophoto](#réaliser-une-orthophoto-avec-loutil-vue)
    * [L'Outil Texture](#loutil-texture)
    * [L'Outil Environnement](#loutil-environnement)
    * [L'Outil Eclairage](#loutil-eclairage)
    * [L'Outil Mesure](#loutil-mesure)
        * [Modifier les Unités de mesure d'une scène](#modifier-les-unités-de-mesure-dune-scène)
    * [L'Outil Coupe](#loutil-coupe)

### Comprendre ce que sont les Outils et paramètres d'une scène

Ces outils **non destructifs** servent à changer rapidement des paramètres d'affichage de scène, par exemple de point de vue de la caméra (passer d'un point de vue perspective en orthographique), l'environnement, ou encore l'éclairage. 

Ils ont l'avantage d'être facilement accessibles, tout en offrant la possibilité d'être **mis en scène lors d'une visite guidée**. **Attention**, toutes les fonctionnalités ne sont pas animable en visible guidée. Ces spécificités seront retracées pour chaque fonction dans les outils listés ci-après.

De manière générale, la plupart des fonctions retrouvés dans ces paramètres se retrouvent également dans les paramètres de la scène dans le mode édition de DPO-Voyager.

* **Changer les paramètres de scène dans l'édition DPO-Voyager** et sauvegarder ces changements modifieront l'affichage par défaut sur votre scène. 

* **Changer les paramètres d'affichage de scène dans l'icône paramètre** ne changeront pas les valeurs par défaut de l'affichage de votre scène. Les changements seront donc en local et seront remplacés par ses valeurs par défaut dés l'actualisation de la page sur votre navigateur.

<img src="/assets/img/doc/Tools_01.jpg" width ="900" alt="illustration Media Voyager" />

Pour faire **apparaître ces outils**, il suffit de cliquer sur l'icône correspondant, à gauche dans l'Explorer.

### L'outil Vue

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|**Projection**| Perspective| Reproduit le point de vue des yeux humain: les objets éloignés sont plus petits| Non|
| | Orthographique| Pas de notion de profondeur, les objets sont vus à la même échelle| Non|
|**Vue**| Face| Réoriente le point de vue en face de la scène| Non|
| | Dos| Réoriente le point de vue à l'arrière de la scène| Non|
| | Gauche| Réoriente le point de vue à gauche de la scène| Non|
| | Droite| Réoriente le point de vue à droite de la scène| Non|
| | Dessus| Réoriente le point de vue au dessus de la scène| Non|
| | Dessous| Réoriente le point de vue en dessous de la scène| Non|

**A noter** les points de vue sont fixés par rapport à la **scène**. Si votre objet n'apparait pas dans le bon angle en selectionnant une vue spécifique, c'est que l'objet est mal orienté par rapport à la scène.

Pour **réorienter l'objet**, veuillez vous rendre dans l'onglet **Pose** en haut de l'Explorer. Pour en savoir plus, vous pouvez consulter [ce guide](../tutorials/import).

#### Réaliser une Orthophoto avec l'Outil Vue

Il vous ait possible de **réaliser des orthophotos** avec une scène DPO-Voyager via l'utilisation de l'Outil Vue décrit ci-dessus.

<img src="/assets/img/doc/Tools_02.jpg" width ="700" alt="illustration Media Voyager" />

Pour ce faire, activer la barre d'Outil dans le mode Edition de scène. Rendez-vous ensuite dans les paramètre de l'Outil **Vue**

<img src="/assets/img/doc/Tools_03.jpg" width ="700" alt="illustration Media Voyager" />

Par défaut, la projection est en **Perspective**. Cliquer sur **Orthographique** juste à côté du bouton Perspective.

Une fois en projection orthographique, sélectionnez la vue voulue (parmi les 5 disponibles)

<img src="/assets/img/doc/Tools_04.jpg" width ="400" alt="illustration Media Voyager" />

Allez ensuite dans l'onglet **"Capture"** en haut de l'Explorer. Cliquez sur **"Capture"** pour réaliser une capture d'écran de la vue orthographique désirée.

<img src="/assets/img/doc/Tools_05.jpg" width ="400" alt="illustration Media Voyager" />

Une fois la capture d'écran réalisée, une prévisualisation s'affichera en bas de l'onglet. Si l'image obtenue ne vous couvient pas, répéter le processus jusqu'à obtenir la photo désirée.

Une fois satisfait de votre capture, cliquer sur le bouton **"Download"** afin de télécharger l'image obtenue. 

**Attention**: il n'est pas nécessaire de cliquer sur "Save" deurant cette démarche. Cette opération n'est utile seulement si vous souhaitez que la capture d'écran devienne la miniature de votre scène.

### L'outil Texture

<img src="/assets/img/doc/Tools_06.jpg" width ="700" alt="illustration Media Voyager" />

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|**Texture**| Default| Affiche votre objet selon les paramètres d'affichage de son fichier source| Oui|
| | Argile| Affiche votre objet avec un affichage mimant les propriétés visuelles de l'argile| Oui|
| | Rayons X| Affiche votre objet en transparence, mime un visuel "fantomatique"| Oui|
| | Normales| Affiche votre objet en le colorant selon comment la lumière intéragit avec lui ([cf guide avancé](models/model))| Oui|
| | Fil de Fer| Affiche votre objet transparent, seuls le maillage 3D du modèle est visible| Oui|

**Attention** les Matériaux sont uniquement animables via l'Outil Texture. Le paramètre "Shader" d'un objet, qui rempli une fonction similaire à l'Outil Texture, n'est pas animable.

#### Matériau par défaut

<img src="/assets/img/doc/Tools_07.jpg" width ="400" alt="illustration Media Voyager" />

Affiche les modèles 3D de la scène avec les même informations de matériaux des fichiers .glb sources.

C'est le seul matériau de la liste affichant des informations de texture dite "Albedo".

#### Matériau argile

<img src="/assets/img/doc/Tools_08.jpg" width ="400" alt="illustration Media Voyager" />

Affiche les modèles 3D de la scène avec un matériau mimant les propriétés visuelles de l'argile.

Très utilisé pour la sculpture 3D, ce matériau permet de juger de la qualité de la surface du modèle.

La texture Albedo d'un objet peut quelques fois être trompeurs. On dit qu'elle "Fake", qu'elle mime des informations de volume que le modèle n'incorpore pas vraiment.

Son absence permet donc d'apprécier la bonne définition des volumes et de leur intéraction réelle avec les lumières de la scène.

#### Matériau Rayons X

<img src="/assets/img/doc/Tools_09.jpg" width ="400" alt="illustration Media Voyager" />

Affiche les modèles 3D de la scène avec un matériau semi-transparent, mimant un aspect visuel "fantomatique".

Il est surtout utile pour des aspects de mises en scène de Visites Guidées, pour représenter un aspect de scanner, par exemple.

#### Matériau Normale

<img src="/assets/img/doc/Tools_10.jpg" width ="400" alt="illustration Media Voyager" />

Affiche les modèles 3D de la scène avec un matériau affichant les normales sous forme visuelle.

Ce matériau est utile pour vérifier la bonne présence d'une Normal Map dans vos objets. Pour rappel, une Normal Map permet d'ajouter artificiellement des micro-détails de surface sans toucher à la géométrie de l'objet. Si vous le souhaitez, vous pouvez en savoir plus en suivant [ce guide](models/model).

#### Matériau Fil de Fer

<img src="/assets/img/doc/Tools_11.jpg" width ="400" alt="illustration Media Voyager" />

Affiche les modèles 3D de la scène avec un matériau transparent, ne laissant apparaître que les arrêtes et les sommets des maillages 3D.

**Attention**: ce matériau se basant sur le maillage de votre modèle 3D, il se peu qu'il n'est pas l'effet ecompté si le maillage de votre objet est trop dense.

Dans l'exemple du Nu au Fardeau, le maillage de l'objet et si dense que le matériau Fil de Fer lui donne un aspect Solide. Il est nécessaire de zoomer plus que de raison pour voir appraitre les arrêtes et les sommets.

A titre de comparaison, voici comment le matériau Fil de Fer réagit avec un autre modèle, au maillage plus léger:

<img src="/assets/img/doc/Tools_12.jpg" width ="400" alt="illustration Media Voyager" /> <img src="/assets/img/doc/Tools_13.jpg" width ="400" alt="illustration Media Voyager" />

### L'outil Environnement

<img src="/assets/img/doc/Tools_14.jpg" width ="700" alt="illustration Media Voyager" />

Ce outil se concentre principalement sur l'environnement de la scène, c'est-à-dire, **l'espace entourant les modèles importés**. 

Il sert donc à sa bonne mise en valeur, et peut être modifier pour s'approcher de chartes graphiques établies. 

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|**Arrière-plan**| Solide| Colore le fond d'une couleur unie. Seule la couleur 1 est utilisé pour ce changement| Non|
| | Linéaire| Colore le fond avec un dégradé horizontal. La couleur 1 est en bas, la 2 est en haut.| Non|
| | Radial| Colore le fond avec un dégradé radial. La couleur 1 est au centre, la 2 est à l'extérieur| Non|
| | Couleur 1| Permet de modifier la couleur primaire du fond| **Oui** - Option: _Background_|
| | Couleur 2| Permet de modifier la couleur secondaire du fond| **Oui** - Option: _Background_|
|**Grille**| Grille| Affiche une grille en tant que sol de la scène. Le carré à sa droite représente son paramètre couleur| Non|
|**Sol**| Sol| Affiche un dégradé radial en tant que sol de la scène. Le carré à sa droite représente son paramètre couleur| Non|
|**Env Map**| Env Map| Permet de changer l'Environment Map de la scène. Elle décide des reflets métallique adopté par les objets possédant des valeur de Metallic supérieure à 0| Non|

### L'outil Eclairage

<img src="/assets/img/doc/Tools_15.jpg" width ="700" alt="illustration Media Voyager" />

Comme son nom l'indique, cet outil permet de modifier les paramètres d'éclairage présent dans la scène. Par défaut, une scène Voyager comprend 4 lumières, se basant sur les principes d'éclairage de studio photo, décrits ci-après.

**A noter** les lumières suivent les mouvements de la caméra. Par exemple, la lumière secondaire orientée gauche éclairera toujours la gauche de l'Explorer, peu importe si vous visionner l'avant ou l'arrière  de l'objet. 

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|**Eclairage**| Principale| Permet le règlage de l'intensité et la couleur de la lumière principale de la scène| **Oui** - Option: _Lights_|
| | Remplissage 1| Permet le règlage de l'intensité et la couleur de la lumière secondaire orientée droite de la scène| **Oui** - Option: _Lights_|
| | Remplissage 2| Permet le règlage de l'intensité et la couleur de la lumière secondaire orientée gauche de la scène| **Oui** - Option: _Lights_|
| | Contre-jour| Permet le règlage de l'intensité et la couleur de la lumière Rim de la scène| **Oui** - Option: _Lights_|

#### Eclairage principal

La **Lumière principale**, aussi appelée **Key Light**, est la plus importante dans la scène. C'est elle qui émet le plus de lumière. Elle est toujours placée à l'avant de la caméra.

De manière générale, sa couleur est blanche, pour ne pas influer sur la couleur réel de l'objet éclairé. Une lumière principale peut-être colorée pour donner des ambiances précises à la scène (ex: bleue pour recréer une nuit américaine).

#### Eclairage Secondaire

La **Lumière secondaire**, aussi appelée **Fill Light**, est une lumière optionelle mais privilégiée. Elle se place traditionnelement vers l'avant du sujet, orienté à gauche ou à droite.

Leur rôle est de compléter la zone de lumière émise par la lumière principale. Elle sont souvent légérement colorées pour créer des ombres moins dures et plus intéressantes en photo.

Ici, les scènes DPO-Voyager sont composées par défaut de deux lumières secondaires. La Remplissage #1 est orientée à droite de l'écran, là où la Remplissage #2 est orientée à gauche de l'écran.

Il est de coutume d'utiliser des couleurs chaudes pour ces lumières, ou d'alterner une couleur chaude d'un côté et une couleur froide de l'autre.

#### Eclairage contre-jour

La **Lumière contre-jour**, aussi appelée **Rim Light**, est la plus optionnelle de toutes les lumières présentées. Traditionnelement placée derrière le sujet, elles servent à créer un halo de lumière sur les contours de ce-dernier, afin de le mettre en valeur.

Dans la scène, la lumière contre-jour est placée dans le fond, à droite de l'écran. 

Il est de coutume que cette lumière soit colorée pour ne pas contredire la Lumière Principale. Les couleurs froides sont privilégiée, pour contraster avec les couleurs généralement chaudes des Lumière Secondaires.

### L'outil Mesure

<img src="/assets/img/doc/Tools_16.jpg" width ="700" alt="illustration Media Voyager" />

L'outil mesure permet de **mesurer la distance entre deux points selectionnés dans la scène**. Son fonctionnement est décrit ci-après.

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|Mesure| Activation| Active la possibilité de mesurer une distance entre deux points définis par l'utilisateur| Non|

Afin d'utiliser cet outil, veuillez tout d'abord le selectionner dans la liste de paramètre d'Outils.

<img src="/assets/img/doc/Tools_17.jpg" width ="900" alt="illustration Media Voyager" />

Ensuite, cliquez sur le bouton "Off" de manière à le faire passer en "On.

Tant que l'Outil Mesure sera actif, il vous sera possible de cliquer sur n'importe quel partie de la scène, tant que vous vous appuyiez sur un modèle 3D visible.

<img src="/assets/img/doc/Tools_18.jpg" width ="400" alt="illustration Media Voyager" />

Le premier clic placera un premier point sous forme de punaise. 

<img src="/assets/img/doc/Tools_19.jpg" width ="400" alt="illustration Media Voyager" />

Dans la même logique, le deuxième clic placera un seconde point qui entrainera l'apparition d'un tracé entre le premier et le dernier point. 

Pour l'instant, **il ne peut y avoir plus d'une' distance affichée**. Un troisième clic effacera les derniers points précédents et en créera un nouveau.

Les unités de mesures affichées par la distance sont liées au paramètre de **Global Unit** de la scène. 

##### Modifier les unités de mesure d'une scène

Pour **modifier cette unité de mesure**, rendez-vous dans l'onglet **"Pose"** en haut de l'Explorer. Sélectionner ensuite un modèle dans le Navigator à gauche de l'Explorer.

<img src="/assets/img/doc/Tools_26.jpg" width ="400" alt="illustration Media Voyager" />

Un onglet en bas à gauche de l'Explorer s'affichera alors. Cliquez sur la flêche dans le conteneur du paramètre Global Units.

### L'outil Coupe

<img src="/assets/img/doc/Tools_20.jpg" width ="700" alt="illustration Media Voyager" />

Dernier dans la liste, mais pas des moindre, l'Outil Coupe permet de **séctionner un modèle 3D selon un axe donné**. Une partie du modèle est intacte tandis que l'autre disparait. Le trou dans le modèle obtenu par la tranche est rebouché et colorisé en bleu automatiquement.

**Pour rappel**: ces paramètres sont non-destructifs. utiliser l'Outil Coupe n'influera pas sur le maillage de votre fichier 3D, seulement sur son affichage. Vous pouvez donc utilisez l'Outil Coupe sans craindre d'altérer votre modèle source.

|Fonction| Sous-fonction| Description | Animable Visites Guidées |
|:----------|----------|----------|-----------:|
|**Outil Coupe**| Outil Coupe| permet l'activation de l'Outil. Un des trois axes sera toujours selctionné par défaut| **Oui** - Option: _Slicer_|
|**Axe**| X| Découpe vos modèles selon sa largeur| **Oui** - Option: _Slicer_|
| | Y| Découpe vos modèles selon sa hauteur| **Oui** - Option: _Slicer_|
| | Z| Découpe vos modèles selon sa profondeur| **Oui** - Option: _Slicer_|

**A noter**: vous pouvez inverser le sens de la coupe en cliquant de nouveau sur l'axe voulu.

**Important** Il est possible de choisir quel objet est affecté ou non par cet outil. Ce choix se fait dans les paramètre de l'objet catégorie Material: **SlicerEnabled**.

#### L'Axe X

<img src="/assets/img/doc/Tools_22.jpg" width ="700" alt="illustration Media Voyager" />

Si l'on considère que l'objet est placé selon la même orientation que la scène: découpe l'objet selon un axe X, représentant ici la longueur (gauche/droite).

**A noter**: vous pouvez inverser le sens de la coupe en cliquant de nouveau sur l'axe voulu.

#### L'Axe Y

<img src="/assets/img/doc/Tools_23.jpg" width ="700" alt="illustration Media Voyager" />

Si l'on considère que l'objet est placé selon la même orientation que la scène: découpe l'objet selon un axe Y, représentant ici la longueurhauteur (haut/bas).

**A noter**: vous pouvez inverser le sens de la coupe en cliquant de nouveau sur l'axe voulu.

#### L'Axe Z

<img src="/assets/img/doc/Tools_24.jpg" width ="700" alt="illustration Media Voyager" />

Si l'on considère que l'objet est placé selon la même orientation que la scène: découpe l'objet selon un axe Z, représentant ici la profondeur (avant/arrière).

**A noter**: vous pouvez inverser le sens de la coupe en cliquant de nouveau sur l'axe voulu.


* [Revenir en haut de la page](#apprendre-à-utiliser-les-outils-et-paramètres-dune-scène-dpo-voyager)
