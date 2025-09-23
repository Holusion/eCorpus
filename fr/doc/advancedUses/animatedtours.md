---
title: Comment réaliser des animations via les Visites Guidées
description: Apprendre à animer des scènettes sur une scène eCorpus via la fonctionnalité de Visite Guidée
rank: 9
---

## Apprendre à animer des mises en scène grâce aux Visites Guidées

Les visites guidées constituent un outil important de DPO-Voyager de par son utilité et sa grande adaptabilité. Si ce n'est pas encore fait, nous vous invitons à apprendre les bases de la création d'une visite guidée via [ce guide](../tutorials/tours.md).

Par essence, les visites guidées servent à donner une trame narrative à une scène eCorpus. Les étapes servent le plus souvent à mettre en évidence différents points de vue d'un même modèle, inciter la lecture d'articles ou d'annotation... Toutefois, il est également possible d'aller plus loin, en y animant des parties d'un objet afin de montrer son fonctionnement, par exemple.

<iframe name="eCorpus Voyager" src="https://ecorpus.holusion.com/ui/scenes/Lock_Stator/view?lang=FR" width="800" height="450" allow="xr; xr-spatial-tracking; fullscreen"></iframe>

WIP[Insérer une vidéo de présentation ici]


### Sommaire

* [TBD](#)


### Lister les possibilités offertes par les Visites Guidées via Exemples

<!-- Prévoir à fix la scène du mur de brique pour la montrer en exemple ? 

Prévoir à faire une visite guidée animée avec le VanMarum exemple ?  -->

Les visites guidées offrent de multiples possibiliés de médiation dans une scène DPO-Voyager. Offrir la possibilité d'une visite guidée à son utilisateur est un véritable atout pour ce-dernier, qui aura la possibilité de pleinement profiter de l'enrichissement sémantique apporté.

Une bonne visite guidée dite "basique" a donc pour objectif de montrer de manière intéressante et pensée son contenu, de manière à le lié à certains points de vue de son modèle. Par exemple: prévoir une étape montrant un zoom sur la tête d'un personnage et y lié un article lié à cet élément.

Une visite guidée dite "animée" se concentre ici sur la mise en scène et la scénographie évolutive des sujets, afin de les mettre en mouvement. Elles peuvent très bien être exempte de toute annotation ou article, bien que ces-derniers soient fortement recommandé pour apprécier pleinement le mouvement démontré via cette fonctionnalité.

#### Exemples de mises en scène

Ses animations peuvent être utilisées à but de démonstration de mouvement, ou de fragmentation pour montrer la structure interne d'un mécanisme. Voici une liste non-exhaustive des différentes présentations permises par les visites guidées:

##### Montrer comment est assemblée la structure interne d'un objet

[Exemple d'un pied de croix](https://ecorpus.holusion.com/ui/scenes/Pied_croix_dome/view)

##### Montrer une hypothèse de reconstitution de fragments

[Exemple d'une statue-colonne reconstituée](https://ecorpus.holusion.com/ui/scenes/NoceDeCana_Puzzle/view)

##### Montrer le fonctionnement interne d'un mécanisme

[Exemple de fonctionnement d'une serrure](https://ecorpus.holusion.com/ui/scenes/Lock_Stator/view)

<!-- Ajouter un exemple de comparaison de modèles 3D via dérivative, type chapiteau d'Arthous ?-->

### Parler de la fonctionnalité Derivative et MultiModels

#### Un peu plus d'explications sur les translations

Cet effet d'animation est possible grâce aux translations des paramètres (position, rotation, etc...) d'un objets d'une étape à l'autres, aidée d'une transition assistée.

Pour faire simple, décomposons la logique  dérrière la création des étapes et les transitions apportée par l'outil:

* Une étape A conserve des informations de positions des objets et du point de vue dans l'espace.
    * Exemple: je montre la face avant de mon objet

* Une étape B conserve également des informations de positions des objets et du point de vue dans l'espace, indépendament du point A.
    * Exemple: je montre la face arrière de mon objet

Les translations de l'étape A et B sont différentes entre elles.

_On peut comparer la scène 3D à un studio photo. L'étape A est une photo prise avec la caméra placée devant l'objet, l'étape B est une photo prise avec la caméra placée devant l'objet: c'est donc la position de la caméra qui a bougé entre ses deux images._

Si les visites guidées ne ressemble pas à un diaporama photo, c'est grâce à l'existence des Transitions, qui viennent ajouter des interpolations automatiques entre ces translations pour créer un mouvement fluide. 

Reprenons l'exemple du studio photo pour y voir plus clair:

* L'étape A montre le devant de l'objet tandis que l'étape B montre l'arrière de l'objet.

* Entre ces deux étapes, on peut s'imaginer un acteur se déplaceant. D'abord devant l'objet pour y montrer l'étape A, puis à l'arrière de l'objet pour y montrer l'étape B.
    * La transition joue ici le rôle de l'acteur se déplaceant d'un point A a B.

Si l'exemple est fait sur le déplacement de la caméra, ce n'est pas le seul paramètre pris en compte dans les étapes. 

_On peut alors imaginer les visites guidées comme un théatre de marionnette, où les étapes décide de la position des pantins tandis que les transitions seraient des acteurs invisbles articulant les marionettes pour les animer entre deux positions._

#### Décomposer son modèle en plusieurs parties

Vous l'aurez donc compris, chaque modèle peut se déplacer dans la scène selon vos besoins, tandis que les transitions s'occuperont d'animer ces déplacements. 

De ce fait, les translations se font selon chaque modèle indépendament, en fonction du point de pivot leur ayant été attribué lors de leur export. (cf point suivant). Si chaque objet est limité a un mouvement global, il est parfois nécessaire de le décomposer en plusieurs parties pour obtenir le mouvement voulue.

Pour reprendre l'exemple de la Serrure: chaque objet effectuant un mouvement indépendamment des autres à été séparer en glb différents. Les quatre ressors visible, par exmple, constituent quatre GLB différents, car chaque ressors effectue un mouvement différent a un moment donné.

Par soucis d'organisation, il n'est pas nécessaire de décomposer toutes les petites parties d'un mécanisme. Ici, le barillet, le panneton et le fond du stator (réprésentés en violet) sont bien trois parties différentes, qui ont pourtant été exportées dans le même glb: les trois parties ont la même translation au même moment (rotation au moment du tournage de clef). Il est donc plus facile de faire une seule translation et de n'avoir qu'un glb à gérer que trois glb différents sur lequel on applique trois fois la même translation.


 ##### Cas particulier pour les Dérivatives <!-- Changer sa place >> peut-être dans l'apprentissage des paramètre de visite guidée ? // Voir même carrément le transférer sur un autre guide-->

Cas particulier: DPO-Voyager gère ce que l'on appelle des Dérivative. Ce sont des états d'objet qui servent à définir sa qualité. Un seul objet dans la scène peut donc avoir plusieurs glb de différentes qualités.

Ces qualités sont:

* **Highest**: Meilleure qualité d'affichage. Souvent pour les modèles de qualité "brutes" (lors des scans 3D par exemple)
* **High**: Qualité considéré comme HD (High Definition)
* **Medium**: Qualité médiante. La géométrie reste de bonne qualité, les textures sont de moindres qualités.
* **Low**: Qualité basse. Le modèle reste beau de loin, mais montre des lacunes au zoom.
* **Ultra Low**: Qualité la plus basse. Est utilisé lorsque l'objet est visible de loin: il garde une bonne silouhette et permet de bonnes performances.
* **AR**: Pour Augmented Reality. Est utilisé pour appliquer la fonctionnalité Réalité Augmentée à la scène. Vous pouvez en savoir plus sur [ce guide](../advancedUses/augmented_reality.md).

Les utilisations de dérivatives sont très courantes dans le jeu vidéo ou dans l'affichage Web, car ils permettent se modifier le LoD (Level of Detail) en fonction des capacités du matériel utilisateur, par exemple.

Pour faire simple: chaque modèle implémenté en tant que Dérivative seront chargés dés le lancement de la scène eCorpus: il faut donc faire attention à ne pas trop éxagérer la taille de ses modèles, même en Highest. 
La qualité du modèle affiché sera décidé en fonction des capacités du support utilisé pour que le visionage 3D reste fluide en toute circonstance.

Si les dérivatives peuvent-être utiles, elles ne sont pas toujours utilisées. Cependant, elles peuvent tout de même servir pour faire des comparaisons dans les visites guidées. 

C'est par exemple le cas avec [cette scène](https://ecorpus.fr-scv.fr/ui/scenes/Arthous_49/). Elle ne présente qu'un seul modèle, contenant deux glb différent: un glb représentant la numérisation en lumière structurée dans la dérivative High (qui doit être le plus précis possible pour la recherche), et un glb représentant la nummérisation par photogrammétrie dans la dérivative Normal (qui peut être allégé pour tout de même être visible avec des performances moindres). 

Les deux versions cont comparées lors de la visite guidée.

#### Expliquer l'importance d'un bon point de pivot lors d'une animation de mécanisme

Comme vu précédemment, il est important de savoir où placer son point de pivot pour permettre une bonne translation.
Un point de pivot, comme son nom l'indique décide du centre de l'axe sur lequel vous objet pivotera / effectuera sa rotation. 

<!-- Insérer un petit schéma explication sur les rotation ?-->

_Par exemple, un levier aura son point de pivot à sa base, tandis qu'une porte aura son point de pivot sur son côté._

Les points de pivots peuvent être changer  sur le fichier glb directement via une application de modélisation, telle que Blender. Toutefois, ils sont recalculer automatiquement en fonction de leur emplacement dans la scène DPO-Voyager.

##### Comment repositionner correctement le point de pivot de son objet

Le point de pivot d'un objet importé dans eCorpus se fait automatiquement selon son placement d'origine dans la scène DPO-Voyager: son point de pivot sera toujours placé au centre strict de la scène.

Par conséquent, centrer un objet au centre de la scène dans sa configuration initiale définiera automatiquement son point de pivot au centre de l'objet.

<!-- Insérer des images d'illustration montrant différents placements de Pose d'un objet et l'emplacement conséquentiel de son point de pivot-->

**A noter** ce changement de configuration se fait uniquement dans l'onglet **"Pose"** du mode Edit de DPO-Voyager. Vous pouvez en savoir plus sur cet outil dans [ce guide](..//tutorials/import.md). 

**Astuce** Si vous souhaitez repositionner le point de pivot sur votre objet sans pour autant changement son emplacement dans la scène, vous pouvez "compenser" les modifications apportés par les changements de **Pose** en éditant les **Paramètres** de Position de votre objet.

_Exemple: Si vous déplacez votre objet de 0,5 sur un axe dans l'onglet Pose, ajout la valeur inverse, ici -0,5 dans le bon axe de l'onglet Paramètre de l'objet._

* Si vous souhaitez améliorer **la rotation** de votre objet, veuillez à changer son positionement par rapport au centre de la scène.

* Si vous souhaitez améliorer **le déplacement** de votre objet, veuillez à changer sa rotation par rapport aux points de vues de la scène. (avoir un objet orienté sur un axe unique permet une translation plus simple qu'avec un objet orienté entre deux axes)

**Conseils** Il est important de vérifier les points de pivots de ses objets avant toute création de visite guidée. En effet, les valeurs de translations des étapes resteront les même tels qui sauvegardés. Un changement dans le point de pivot risque donc de rendre ses translations faussées.

##### Rappeler qu'il faut faire attention à bien sortir de la visite guidée avant d'enregistrer la scène

Il est important de rappeller que sauvegarder la scène en pleine visite guidée sauvegardera également les translations actuelles dans l'affichage par défaut de la scène.
C'est-à-dire: si vous sauvegarder la scène en plein visite guidée pendant que l'objet a une position et un mouvement particulier, il gardera cette position lors de l'actualisation de la scène, même lorsque la visite guidée n'est pas active.

Si cela vous arrive et que vous souhaitez revenir à l'état de base de l'objet, il vous faudra remodifié les valeurs de translations de l'objet à la main et resauvegarder la scène, ou bien restaurer une ancienne version dans l'Historique eCorpus.

**Conseil**: il semble important de garder une étape dans votre visite guidée où l'objet reste en position neutre, par défaut. Ainsi, si un problème comme décrit précèdement arrive, il vous suffit de vous rendre à cette étape où la position de l'objet est neutre puis sauvegarder de nouveau la scène. 

Il est donc important de penser à sortir de votre visite guidée (en terminant toutes les étapes, et en cliquant de nouveau sur l'icône **"visite guidée"**) avant de sauvegarder votre scène.

<!-- IMPORTANT On a pas encore parlé des tags d'annotation ni de modèle, donc retravailler et déplacer ces parties pour qu'elles deviennent un point concernant l'animation de modèle et d'annotation par tag-->

##### Petite note pour rappeler que les annotations se font par modèles 3D et qu'il faut des fois les refaire ??? (tester la création d'objet nuls pour avoir des annotation "flottantes" et voir si ça change quelque chose)

Un point important à considérer dans ces animations sont les annotations. Si vous avez déjà lu le [guide sur les annotations](../tutorials/annotation.md) vous n'êtes pas sans savoir que chaque annotation est liée a un modèle 3D. Par conséquent, elles suivent les translations de ces modèles.

Si, pour une raison quelconque, vous souhaiter faire changer l'apparence de votre objet, tout en gardant son annotation liée, ou bien garder une annotation fixe dans l'espace qui ne bouge pas, nous pouvons vous proposer ces quelques astuces:

* **Un seul objet, deux dérivatives différentes**: une annotation ne peut pas être liée à plus d'un objet. Cependant, un objet peut contenir plusieurs modèle 3D glb grâce à son système de dérivative. Il est donc techniquement possible d'avoir jusqu'à 4 formes de modèles 3D différents via ce système. <!-- Faire mention du point qui parlera des paramètres de visite guidée pour savoir comment activer cette fonction-->

* **Deux objets différents, deux annotations similaires**: sans avoir à toucher aux paramètre d'un objet, la solution la plus directe est de créer une annotation supplémentaire, cette fois sur le second objet voulu. Attention: cette méthode n'est pas récommander car elle implique de réaliser tout changement sur une annotation plusieurs fois.

* **Une annotation fixé sur un objet invisible**: cette méthode s'inspire des Controller Null (ou Empty) que l'on retrouve dans l'infographie. Elle consiste à créer un objet dit "récipient" qui accueillera l'annotation, et pourra être placer dans la scène à votre convenance. Ensuite, désactiver le visuel de l'objet dans ses **Paramètres** en plançant l'indicateur **Visible** en **Off**.
Les annotations, tant qu'elles sont actives dans la scène, resteront visibles, même si l'objet ne l'est pas.

#### Expliquer la fonctionalité de Tags pour modèle 3D afin d'aller plus vite (cf ex: goupilles et ressors)

Paramètrer et animer les objets à la main peut prendre un temps conséquent. Surtout lorseque votre mécanisme contient de nombreuses petites pièces. Heureusement, le système de Tag dans les **Paramètres** de l'objet peut vous épargner beaucoup de clics lors de vos créations d'étapes de Visite Guidée.

Si on prend l'exemple de la serrure: le mécanisme contient une répétition de petits objets similaires. Ici, quatre goupilles, et le même nombre de contre-goupilles et ressors. Si l'on veut que ces douze objets soient invisibles à l'étape 1 pour apparaitre à l'étape 2, il faudrait en toute logique faire autant de clics que d'objets pour chacun de ces changements d'états. 

Heureusement, il est possible de passer outre cette contrainte en utilisant les Tags présents dans les **Paramètres** d'objet. Leurs fonctionnement est tout à fait similaires aux tags d'annotations

## Les paramètres centraux à modifier

Les translations basées sur la rotation et la position des objets constitue une bonne base pour la mise en scène d'une Visite Guidée. Pour aller plus loin, il est également possible de changer d'autres paramètres, comme la visibilité d'un objet entre deux étapes, par exemple.

Ces apparitions et autre changements de paramètres ne sont pas forcément animable par défaut. Il est important d'activer leurs changements d'états via d'autres paramètres listés ci-après.

### Expliquer les Tags

Les Tags sont un système de classification pratique qui permet le tri dans l'apparition et la disparition de certaines informations visibles. 
**Attention**: les Tags de scènes DPO-Voyager sont à ne pas confondre avec les Tags de Collection eCorpus.

Les Tags de scène sont étroitement liés aux Annotations, car c'est dans cet onglet qu'il sont visibles. Si vous souhaitez en savoir plus sur les Annotations, veuillez vous réferrer à [ce guide](../tutorials/annotation.md).

**Toutefois** les annotations ne sont pas les seules outils à pouvoir bénéficier d'un tri par Tag: les objets le peuvent également. Le système et le lieu de stockage de ces données restent cependant les mêmes, bien que les paramètres soient à deux endroits différents.

Les Tags d'objets sont particulierements pratiques pour gérer l'apparition et la disparition de multiples modèles 3D. Ils deviennent indispensable lorseque vous souhaitez montrer des groupements complexes, tels que des charpentes ou des mécanismes de machines. 

#### Les Tags d'Annotations

Si vous avez suivi le guide des Annotations, vous devez savoir qu'elles peuvent être activée ou désactivée dans la scène via l'icône **Annotations** présent à gauche de l'Explorer. 

Cet état est animable dans les visites guidées, ce qui peut-être fort pratique pour ne pas surcharger la scène d'information. Cependant, il a pour défaut de désactiver toutes les annotations, sans aucune distinction. 

Grâce au système de Tags, il devient possible de classifier les annotations, pour les faire apparaitre ou disparaitre indépendemment des autres tags.

Par défaut, les annotations n'ont pas de Tags quand elles sont crées. Le conteneur prévu pour recevoir cette information est vide.

<!-- Image d'illustration montrant le paramètre Tag dans une image-->

Pour ajouter des Tag, pas besoin d'étape de création particulière. Sélectionner l'annotation voulue et écrivez le nom du Tag de votre choix dans le conteneur prévu à cet effet.

Vous remarquerez l'apparition de ce Tag dans un petit volet en bas de l'Explorer.

<!-- Image d'illustration montrant le petit volet de Tags en bas de l'Explorer-->

**Attention** le nom d'un Tag constitue une catégorie d'annotation à afficher visible par tous les spectateurs de la scène. Veuillez donc à faire en sorte que ce nom reflète au mieux la catégorie.

Pour afficher un Tag, repérer son nom dans le volet de Tag et cliquer dessus. Le nom s'encadrera en bleu pour montrer son activation et les annotations liées s'afficheront. Le processus est le même pour arrêter l'affichage de ces annotations.

Pour ajouter d'autres annotations à ce Tag, écrivez le même nom dans le paramètre Tag des annotations souhaitées. Faites bien attention à éviter les fautes de frappe: si un nom de Tag n'est pas sictrement identique à un Tag déjà existant, un nouveau Tag sera créé.

Pour supprimer un Tag, remplacer ou supprimer son nom dans toutes les annotations liées.

Les annotations n'ayant pas de Tag reste toujours visibles tant que les Annotations globales restent activées.

#### Les Tags de Modèles 3D

De la même manière que les Annotations, les modèles 3D peuvent être regroupés sous différents Tags.

En sélectionnant l'objet souhaité, vous pouvez avoir accès à sa valeur de Tag via l'onglet **"Paramètres"** en haut de l'Explorer.

Le procédé est le même: en écrivant le nom de Tag de votre choix dans le conteneur prévu à cet effet, une catégorie de Tag sera créée et affichée dans le volet prévu à cet effet dans l'onglet **Annotation**.

_Ce faisant, les Tags de Modèles 3D et d'annotations sont tous les deux traités de la même manière. Il est donc possible d'allier Annotations et Modèles 3D sous le même Tag_

Pour ajouter d'autres annotations à ce Tag, écrivez le même nom dans le paramètre Tag des annotations souhaitées. Faites bien attention à éviter les fautes de frappe: si un nom de Tag n'est pas sictrement identique à un Tag déjà existant, un nouveau Tag sera créé.

Pour supprimer un Tag, remplacer ou supprimer son nom dans toutes les annotations liées.

### Aborder les paramètres de visites guidées

Dans un soucis de simplifier la création d'étape des Visites Guidées, toutes les fonctionnalités pouvant être prises en compte dans l'animation de ces-dernières ne sont pas activées par défaut. Par exemple, si vous souhaitez changer la couleur de votre modèle d'une étape à une autre, il vous faudra activer la fonction correspondante dans les **paramètres de visites guidées** au préalable.

<!-- Image représentant la liste d'onglets avec l'icône Visites selectionné-->

Ces **Paramètres** sont disponibles dans l'onglet **"Visites"** en haut de l'Explorer. En bas à gauche, dans la liste des visites guidées créées est disponible une série d'icônes. 

<!-- Image représentant l'icône des paramètres de visites guidées en surbrillance-->

L'icône des paramètres des visites guidéees est représenté par trois barres horizontales, tout à droite de la ligne.

<!-- Image représentant le volet des paramètres de visites guidées-->

Vous remarquerez que trois icônes sont dores et déjà actifs dans cette liste: Reader, Viewer et Navigation. **Il est déconseillé de les désactiver** pour ne pas créer d'erreur dans l'application.

Ils correspondent aux données à prendre en compte lors de la création d'étape de visites guidées. Par exemple, le paramètre "Models" permet aux étapes de stocker les données des paramètres des modèles 3D, tels que leur visibilité ou les propriétés de leur matériaux.

**Attention**: tous les paramètres d'une fonctionnalité ne sont pas animable. Si vous avez des questions sur comment animer votre objet, ou si vous souhaitez implémenter un paramètre animable, n'hésitez pas à nous contacter via hello@ecorpus.eu


#### Animer les paramètres d'un objet



|Catégorie| Nom| Description | Paramètre visite guidée associé |
|:----------|----------|----------|-----------:|
|**Transform**| Transform| Permet de modifier les translations du modèle (position, rotation et échelle)| Animable par défaut |
|**Model**| Quality| Permet de changer la Dérivative de son modèle. Change le modèle en fonction de sa qualité choisi lors de son import| Models |
|**Object** | Visible| Permet de faire apparaitre ou disparaitre son objet| Models |
|**Material**| Override| Décide si les changement définis dans ce paramètres sont visibles ou non| Models|
| | Slicer Enabled| Décide si l'objet est affecté par l'Outil Coupe| Models |
| | Base Color| Ajoute par multiplication une teinte à définir à la texture de votre modèle| Models |
| | Opacity| Définit la transparence de votre modèle (seulement visible avec un Shader Default) | Models |
| | Roughness| Définit la brillance de votre modèle (une valeure basse définit un objet brillant)| Models |
| | Metalness| Définit si l'object réflète son environnement (une valeur à 100 équivaut à un objet métallique) | Models |
| | Occlusion| Définit l'intensité de l'Ambiant Occlusion (Accentue artificiellement les ombres dans les recoins et interstices du modèle.) | Models |


##### Faire un lien avec le tuto Outils et montrer les paramètres de visite guidée

De la même manière que les paramètres d'Objet, les paramètres des Outils (Mesure, Coupe, etc...) sont également animable via ces paramètres. Pour en savoir plus, veuillez vous référer à [ce guide](tools.md).


### Exercice pratique: apprendre pas à pas à réaliser la scène de la serrure

A titre d'exemple pratique, voici un exercice que nous expliquerons pas à pas afin que vous puissiez le reproduire par vous-même et tester les possibilités offertes par ce principe d'Animation via les Visites Guidées.

**Si vous ne possèdez pas encore de base ou de compte eCorpus, vous pouvez tout de même participer à cet exercice via une scène [StandAlone](https://ecorpus.fr-scv.fr/ui/standalone)**

<iframe name="eCorpus Voyager" src="https://ecorpus.fr-scv.fr/ui/standalone?lang=FR" width="800" height="450" allow="xr; xr-spatial-tracking; fullscreen"></iframe>

Voici ce que donne la scène une fois cet exercice terminé:

<!-- Pas oublier d'ajouter une Iframe de la scène une fois finie ! -->

#### Etape 1: Définir la fragmentation de son modèle 3D

Avant toute chose, il est essentiel de bien définir la façon dont sera fragmenté le sujet de la démonstration.

* Mon objectif: montrer le fonctionnement d'une serrure via l'intéraction de la clef avec le mécanisme interne.

* Quels sont les différentes étapes à montrer ?

    * Vue générale des éléments;
    * La clef est introduit dans le stator, les mécanismes (goupille, contre goupilles et ressors) réagissent selon la denture de la clef;
    * La clef tourne, le panneton et les goupilles la suivent.

* A partir de ce plan, regrouper les objets par translation similaires

    * Objet qui ne bouge pas: stator
    * Objet qui tourne et qui se déplace dans l'espace: clef, goupilles
        * Ont-ils le même déplacement ? Non -> Les goupilles et la clef seront exportés indépendement
    * Objet qui tourne: panneton, barillet
    * Objets qui se déforment: ressors
        * Les objets ont-ils la même déformation ? Non -> Chaque ressors sera exporté indépendement 
    * Objets qui bougent: contre-goupilles
        * les objets ont-ils le même déplacements ? Non -> Chaque contre-goupille sera exporté indépendament 

Ce genre de raisonement n'est pas simple et demande de l'expérience, ne vous inquiètez pas si cette partie vous semble encore un peu flou.

Voici un lien de téléchargement contenant les principaux modèles 3D utilisés lors de cet exercice: <!--Ajouter un lien de DL pour modèles 3D -->

#### Etape 2: Importer ses modèles 3D dans la scène

Nous créons tout d'abord la scène en important l'objet Lock_Key.glb. Prenez soin de bien nommer la scène avant sa création. Pourquoi ne pas la nommer "Exercice Serrure", par exemple ? 

_Attention, le nom choisi sera visible dans le lien de la scène. Il est donc important d'éviter les caractères spéciaux tels que les espaces " ". Il est commun de les remplacer par des tirets "_"

Si vous utilisez la scène StandAlone, vous n'aurez pas besoin de passer par cette étape de création de scène.

Une fois votre scène créée, passez-là en mode édition, et glissez déponsez le reste des modèles.

<img src="/assets/img/doc/AnimatedTours_Exo_01.jpg" width ="400" alt="illustration Media Voyager" />

Pour chaque modèle, pensez à choisir une qualité de Dérivative (privilégié High).

<img src="/assets/img/doc/AnimatedTours_Exo_02.jpg" width ="400" alt="illustration Media Voyager" />

* Si vous souhaitez remplacer un objet dans votre scène, selectionnez le nom de l'objet à remplacer dans ce menu.

* Si vous souhaitez ajouter un nouvel objet dans la scène, cliquer sur le cadre intitulé "Ajouter un modèle" et nommez-le de façon à le reconnaitre facilement.

Vous pouvez ensuite cliquer sur "Importer un modèle" pour finir l'importation de votre modèle.

_En haut de ce menu se trouve le nom du fichier que vous essayez d'importer. Suivant cette image d'exemple, nous essayons d'importer le fichier Lock_Ressort1.glb. La qualité choisie est en High, le paramètre "ajouter un modèle" est sélectionné et nommé "Ressort" en conséquence._

**Vous ne voyez pas vos modèles apparaitre sur la scène ?** C'est normal, nous verrons au point suivant comment règler ce problème.

#### Etape 3: Vérifier les Unités 

Entre l'export et l'import de modèle 3D, il arrive très fréquement que les unités de mesure des différentes applications 3D soient mal reconnues. Si vous ne voyez pas vos modèles: c'est parce qu'il ne sont pas dans les même unités de mesures que le premier modèle importé.

Pour vérifier les unités de mesures de votre modèle, nous allons nous rendre dans les paramètres de nos objets.

<img src="/assets/img/doc/AnimatedTours_Exo_04.jpg" width ="700" alt="illustration Media Voyager" />

Selectionnons ensuite la clef, soit en cliquant sur son modèle 3D dans l'Explorer, soit en cliquant sur son nom dans le Navigateur.

<img src="/assets/img/doc/AnimatedTours_Exo_03.jpg" width ="400" alt="illustration Media Voyager" />

Dans les paramètres de l'objet se trouve l'option "Local Units". Il s'agit de l'unité de mesure courante de l'objet selectionné. 

Notez bien que la clef a des unités de mesure spécifiée en mètre (m).

<img src="/assets/img/doc/AnimatedTours_Exo_05.jpg" width ="400" alt="illustration Media Voyager" />

En vérifiant le reste des objets, on peut remarquer que leurs unités de mesure sont définies en centimètres (cm).

Les objets sont donc bien visibles: ils sont juste tellement petits qu'ils paraissent inaperçus.

Il ne semble pas logique qu'une clef soit mesuré en mètre de par sa petite taille. Nous changerons donc ses LocalUnits en centimètres.

Désormais, tous les objets de la scènes sont trop petits. Les scènes DPO-Voyager ont une unité de mesure en mètre (m), il parait donc logique que des objets en unité de mesure cenitmètres (cm) y apparaissent petits.

Si les LocalUnits définissent l'unité de mesure d'un objet, les GlobalUnits définissent l'unité de mesure de la scène.

<img src="/assets/img/doc/AnimatedTours_Exo_06.jpg" width ="700" alt="illustration Media Voyager" />

Ce paramètre se trouve dans l'onglet Pose en haut de l'Explorer.

<img src="/assets/img/doc/AnimatedTours_Exo_07.jpg" width ="700" alt="illustration Media Voyager" />

Dans **Global Units** changer les unités en mètres (m) pour des centimètres (cm). Si ce n'est pas déjà fait, vous pouvez aussi en profiter pour changer les unités de l'objet en cm dans ItemUnits (paramètre juste en dessous de GlobalUnits).

#### Etape 4: Vérifier les paramètres d'Objets et Changer leurs matériaux

Dans cette étape, nous allons vérifier, objet par objet, leurs paramètres, leurs bons axes de rotations, ainsi que modifier leur matériau pour leur attribuer une couleur.

<img src="/assets/img/doc/AnimatedTours_Exo_04.jpg" width ="700" alt="illustration Media Voyager" />

Dans l'onglet **Paramètres**, sélectionner chaque objet pour vous assurer qu'ils fonctionnent comme vous le souhaitez. Voici les étapes de vérifications pour vous aider:

##### Stator

Premièrement, nous vérifions le stator. Cette partie cache les pièces les plus fines, comme les Goupilles, il est donc plus pratique de s'en occuper en premier.

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), le stator ne bouge pas, aucune vérification n'est donc nécessaire à ce niveau-là

<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en bleu.

    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. Le stator est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

* **Object** Pour l'instant, nous allons désactiver le paramètre **Visible** afin de pouvoir voir les autres objets dans la scène.

##### Key

Nous vérifions ensuite la clef:

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), la clef bouge de haut en bas, de gauche à droite, et effectue une rotation sur le côté que nous pouvons qualifier de "roulement". **Afin de vérifier les translations, faites un clic prolongé sur le conteneur d'une valeur et effectuez un glissement de gauche à droite.** La valeur va alors monter ou baisser. Si les changements de valeurs sont trop abruptes, restez appuyer sur la touche "Ctrl" de votre clavier durant le processus.

    * Le mouvement le plus important est celui où la clef rentre et sort du Stator. Après vérification, ce mouvement se fait sans problème sur l'axe Z.

    * La rotation la plus importante est celle où la clef effectue un roulement pour actionner le barillet. Après vérification, ce mouvement se fait sans problème sur l'axe Z.  

<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet.

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en gris.
    
    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. La clef est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

##### Barillet

Nous vérifions ensuite le Barillet et la Panneton (tous deux dans le même objet):

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), le barillet ne bouge pas, et effectue une rotation sur le côté que nous pouvons qualifier de "roulement". **Afin de vérifier les translations, faites un clic prolongé sur le conteneur d'une valeur et effectuez un glissement de gauche à droite.** La valeur va alors monter ou baisser. Si les changements de valeurs sont trop abruptes, restez appuyer sur la touche "Ctrl" de votre clavier durant le processus.

    * La rotation la plus importante est celle où le barillet effectue un roulement par un actionnement de la clef. Après vérification, ce mouvement se fait sans problème sur l'axe Z.  

<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet.

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en fuschia.
    
    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. Le barillet est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

##### Goupilles

Nous vérifions ensuite une à une les Goupilles:

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), les goupilles bougent de haut en bas, et effectuent une rotation sur le côté que nous pouvons qualifier de "roulement". **Afin de vérifier les translations, faites un clic prolongé sur le conteneur d'une valeur et effectuez un glissement de gauche à droite.** La valeur va alors monter ou baisser. Si les changements de valeurs sont trop abruptes, restez appuyer sur la touche "Ctrl" de votre clavier durant le processus.

    * Le mouvement le plus important est celui où la goupille monte et descend en fonction de si la clef est introduite dans le stator ou non. Après vérification, ce mouvement se fait sans problème sur l'axe Y.  

    * La rotation la plus importante est celle où la goupille effectue un roulement par un actionnement de la clef et du barillet. Après vérification, ce mouvement se fait sans problème sur l'axe Z.  

<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet.

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en jaune. Pour les autres goupilles, copié collé le code sous forme #xxxxxx pour uniformiser la couleur de chacune. 
    
    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. La goupille est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

##### Contre-Goupilles

Nous vérifions ensuite une à une les Contre-Goupilles:

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), les contre-goupilles bougent de haut en bas, et n'effectuent pas de rotation. **Afin de vérifier les translations, faites un clic prolongé sur le conteneur d'une valeur et effectuez un glissement de gauche à droite.** La valeur va alors monter ou baisser. Si les changements de valeurs sont trop abruptes, restez appuyer sur la touche "Ctrl" de votre clavier durant le processus.

    * Le mouvement le plus important est celui où la contre-goupille monte et descend en fonction de si la clef est introduite dans le stator ou non. Après vérification, ce mouvement se fait sans problème sur l'axe Y.  


<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet.

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en orange. Pour les autres contre-goupilles, copié collé le code sous forme #xxxxxx pour uniformiser la couleur de chacune. 
    
    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. La contre-goupille est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

##### Ressorts

Nous vérifions ensuite un à un les Ressorts:

* **Transform** Si vous vous souvenez de [l'étape 1](#etape-1-définir-la-fragmentation-de-son-modèle-3d), les ressorts ne bougent pas, n'effectuent pas rotation et vont effectuer un changment d'échelle (scale) sur leur hauteurs afin de représenter la déformation du ressort une fois actionné. **Afin de vérifier les translations, faites un clic prolongé sur le conteneur d'une valeur et effectuez un glissement de gauche à droite.** La valeur va alors monter ou baisser. Si les changements de valeurs sont trop abruptes, restez appuyer sur la touche "Ctrl" de votre clavier durant le processus.

    * Le mouvement le plus important est celui où le ressort se déforme dans sa hauteur, s'écrasant en fonction de si la clef est introduite dans le stator ou non. Après vérification, ce mouvement se fait **mal** sur l'axe Y. 

**Règler le problème de la déformation**

On remarque que changer l'échelle du ressort le fait se déplacer: son point de pivot n'est pas bien positionné dans l'espace et entraîne des erreurs en conséquences.

Pour être le plus pratique possible, nous souhaitons que le ressort garde un point d'appui en bas et se déforme en s'aggrandissant vers le haut. En toute logique, le point de pivot se doit d'être positonné tout en bas du ressort.

Pour en savoir plus sur le repositionnement d'un point de pivot, veuillez vous rendre sur [ce guide](#comment-repositionner-correctement-le-point-de-pivot-de-son-objet).

Dans l'onglet Pose, nous allons repositionner chaque ressort de manière à ce que sa partie la plus basse doit positionnée au centre de la scène (au point de croisement des trois axes colorés). Pour plus de visibilité, n'hésitez pas à rendre invisible les autres objets.

**Pour rappel** Une fois l'objet repositionné, notez ses nouvelles valeurs de position. Dans les paramètres de l'objet, inscrivez les valeurs opposées dans les axes correspondant (_exemple_: si Y = 10 dans la Pose, Y = -10 dans les paramètres de l'objet).

Voici les bonnes valeurs pour chaque ressort (le ressort 1 est le plus proche du barillet, le ressort 4 le plus proche du panneton):

* Ressort 1:
    * **Pose** X = 0 / Y = 0.26 / Z = -0.35
    * **Paramètres** X = 0 / Y = -0.26 / Z = 0.35

* Ressort 2:
    * **Pose** X = 0 / Y = 0.26 / Z = -0.26
    * **Paramètres** X = 0 / Y = -0.26 / Z = 0.26

* Ressort 3:
    * **Pose** X = 0 / Y = 0.26 / Z = -0.18
    * **Paramètres** X = 0 / Y = -0.26 / Z = 0.18

* Ressort 4:
    * **Pose** X = 0 / Y = 0.26 / Z = -0.18
    * **Paramètres** X = 0 / Y = -0.26 / Z = 0.18


<img src="/assets/img/doc/AnimatedTours_Exo_08.jpg" width ="400" alt="illustration Media Voyager" />

* **Material** Ces paramètres servent à changer l'aspect visuel de l'objet.

    * **Override** Cochez ce paramètre en **On** pour rendre les changements visibles.

    * **BaseColor** Cliquez sur le rectangle blanc pour changer la couleur de l'objet. Ici, nous le ferrons apparaître en violet. Pour les autres contre-goupilles, copié collé le code sous forme #xxxxxx pour uniformiser la couleur de chacune. 
    
    * **Metalness** Par soucis de praticité, nous changerons la Metalness (aussi appellé Metallic) avant la Roughness. Le ressort est en métal: la Metalness est donc logiquement poussée à 100%.

    * **Roughness** Cette option sera uniquement utilisée pour l'esthétique. Baisser cette valeur rendra l'objet plus brillant.

#### Etape 5: Créer la visite guidée

Une fois toutes ces préparations terminées, nous pouvons passer à la création de la visite guidée. 

<img src="/assets/img/doc/AnimatedTours_Exo_09.jpg" width ="700" alt="illustration Media Voyager" />

Dans l'onglet **Visites** (en haut de l'Explorer).

<img src="/assets/img/doc/AnimatedTours_Exo_10.jpg" width ="400" alt="illustration Media Voyager" />

Créer une nouvelle visite guidée. 

<img src="/assets/img/doc/AnimatedTours_Exo_11.jpg" width ="400" alt="illustration Media Voyager" />

Ouvrez les paramètres de Visite Guidée en cliquant sur l'icône formant trois barres horizontales, tout à droite.

<img src="/assets/img/doc/AnimatedTours_Exo_12.jpg" width ="400" alt="illustration Media Voyager" />

Pour cet exercice, nous aurons besoin de sélectionner les paramètres:

* **Models** afin d'animer le changement de paramètres d'objets (leur visibilité, leur de matériau, etc...);

* **Slicers** afin de permettre la découpe du stator via d'Outil Coupe.

Dans les **Paramètres**, sélectionnez le Stator et rendez-le de nouveau visible.

**N'oubliez pas de sauvegarder votre scène régulièrement**, sauf si vous utilisez le mode standalone.

<img src="/assets/img/doc/AnimatedTours_Exo_13.jpg" width ="600" alt="illustration Media Voyager" />

Nous allons ensuite créer la première étape de notre visite guidée. La création de ces étapes ne se font pas toujours dans l'ordre chronologique, mais dans l'ordre dans lequel il est le plus logique de les créer. De ce fait, il est conseiller de renommer ses étapes seulement à la toute fin, quand elles ont finies d'être créées et que la composition de la visite est sûre de convenir.

Cette étape créée en est un parfait exemple: la clef, les mécanismes liées au goupilles, etc... sont déjà en position pour une étape intermédiaire. 

Pour les besoins de cet exercice, nous l'appellerons **étape A**.

Avant de créer une nouvelle étape, il est important de préparer les paramètres des objets pour préparer l'animation de l'Outil Coupe.

##### Animer l'Outil Coupe

Le stator est ici représenté comme plein: il est par conséquent impossible de voir le mécanisme intérieur. Dans la scène de Serrure présentée dans l'introduction de cette page, le stator est présent sous forme de deux modèles distincts: un stator plein, et un stator coupé en deux. Les deux objets s'alternent en fonction des besoins via les Options **Visible** des paramètres des objets.

Ici, nous allons utiliser une autre méthode: avec un seul modèle, celui du stator plein, nous allons pouvoir obtenir un stator coupé en deux via **l'Outil Coupe**.

Durant l'étape 4, nous avons activé le Paramètre de visite guidée **Slicer** qui permet l'animation de cet outil dans les visites guidées. Nous pouvons donc indiquer dans l'étape quels sont les objets qui seront affectés par cet outil.

<img src="/assets/img/doc/AnimatedTours_Exo_14.jpg" width ="600" alt="illustration Media Voyager" />

Nous allons afficher les Outils de la scène en cliquant sur l'icône correspondant à gauche de l'Explorer. Un onglet s'ouvre alors en bas de de l'Explorer.

En sélectionnant l'Option **Coupe** vous accèderez à l'Outil correspondant. 

<img src="/assets/img/doc/AnimatedTours_Exo_15.jpg" width ="600" alt="illustration Media Voyager" />

Nous activons tout d'abord l'Outil Coupe en cliquant sur le bouton "Off" pour le faire passer en "On". L'Axe X est l'axe de découpe sélectionné par défaut, il s'agit également du bon axe pour cet exercice. Le levier intitulé "Position" défini l'état de la découpe. Positionner-le au milieu pour que le stator soit découpé de moitié.

Le reste des objets sont également affectés par cet Outil. 

<img src="/assets/img/doc/AnimatedTours_Exo_04.jpg" width ="600" alt="illustration Media Voyager" />

Pour y remédier, allez dans l'onglet Paramètre.

<img src="/assets/img/doc/AnimatedTours_Exo_16.jpg" width ="400" alt="illustration Media Voyager" />

Désactiver l'Option SlicerEnabled dans les paramètres de tous les objets, à l'exception du Stator.

<img src="/assets/img/doc/AnimatedTours_Exo_17.jpg" width ="600" alt="illustration Media Voyager" />

Nous penserons bien à mettre l'étape à jour en cliquant sur le bouton "Mettre à jour" du **Tour Editor** en bas de l'Explorer.

_Pourquoi ne pas l'avoir paramétré avant ?_: l'état de cet option est paramétré sur On par défaut, et tout changement n'est sauvegardé que si l'option "Slicer" est active dans les paramètres de visite guidée.

_Pourquoi ne pas le paramétrer après ?_: Les nouvelles étapes reprennent l'état exact de la scène et des paramètres au moment de leur création. Si l'option une option est active par défaut, elle le sera dans toutes les étapes. Changer un paramètre signifierait donc mettre à jour toutes les étapes déjà créée.

<img src="/assets/img/doc/AnimatedTours_Exo_18.jpg" width ="700" alt="illustration Media Voyager" />

Enfin, nous pouvons créer une nouvelle étape qui animera cette découpe. 

**Veuillez vous assurez que l'Etape actuelle présente l'objet dans la position voulue avant de créer l'étape suivante. N'oubliez pas de Mettre à Jour l'étape si vous souhaitez sauvegarder tout changement.

Pour cela, nous prendrons soin de bien selcetionner l'étape 1 (qui est pour le moment la seule dans la liste) avant de cliquer sur l'icône **"+ Créer"**.

Nous nommerons cette étape: **Etape B**.

Dans cette nouvelle étape, nous prendons soin de ne pas modifier le point de vue de la scène ni son orientation afin que les étapes aient strictement la même échelle et la même orientation. Cette similitude rendra d'autant plus attrayante les animations effectuées entre les étapes.

_Si jamais il vous arrive de Mettre à jour par mégarde une étape en bougeant légérement le point de vue, créant un décalage non désiré entre les étapes, vous pouvez suprimer l'étape, revenir sur une étape avec un bon point de vue et recréer l'étape à partir de là. Sinon, si vous avez bien sauvegardé la scène entre temps, et que vous n'avez pas sauvegardé la scène après cette erreur, vous pouvez actualiser la page pour réinitialiser ces changements._

Cette étape servira d'introduction à la viste guidée. Actuellement, elle est placée en seconde position dans la liste d'éape. Afin de la placer à la première place, cliquer sur l'icône "Déplacer vers le haut".

<img src="/assets/img/doc/AnimatedTours_Exo_21.jpg" width ="600" alt="illustration Media Voyager" />

Désactivez ensuite l'Outil de Coupe en cliquant sur le bouton pour le placer en "Off". 

**Astuce**: afin d'obtenir un meilleur effet de transition entre ces deux étapes: placer le curseur du levier "Position" tout à droite. N'oubliez pas de Mettre à jour l'étape pour sauvegarder ces changements.
Vous remarquerez que le curseur se déplace entre les deux étapes: il s'agit de la Transition entre étapes qui interpole les états des deux étapes. Notez que cela permet d'animer visuellement l'effet de coupe.

##### Animer la clef

Dans la première étape de la visite, celle où le stator est montré plein, nous allons déplacer la clef de manière à ce qu'elle soit en dehors du stator.

<img src="/assets/img/doc/AnimatedTours_Exo_19.jpg" width ="400" alt="illustration Media Voyager" />

Dans les paramètres de l'objet Clef, nous ajusterons Son Transform de Position dans l'Axe Z, pour le passer à 0.5.

##### Animer l'actionnement par la clef du barillet

Afin d'animer l'actionnement du barillet et des goupilles, nous créerons l'Etape à partir de l'Etape 2, car la clef et les mécanismes sont déjà dans la bonne position.

Nous nommerons cette nouvelle étape: **étape C**.

Nous aurons besoin de changer la rotation de la clef, du barillet et des quatre goupille. Ces objets sont entrainés par la même action, ils auront par conséquent la même rotation.

<img src="/assets/img/doc/AnimatedTours_Exo_20.jpg" width ="400" alt="illustration Media Voyager" />

Dans les **Paramètres** d'objet, changez la rotation de l'axe Z pour une valeur de 45. Répéter ce changement pour les objets cités juste avant.

<!-- Pas oublier de montrer comment réaliser des Tags d'Objets !-->

Mettez à jour l'étape et n'hésitez pas à tester les animations en cliquant sur les flêches à droite de l'onglet d'étape.

#### Etape 6: Peaufiner ses animations

A partir de ces trois étapes, vous avez réussi à animer le fonctionnement d'une serrure. Félicitations !

Néanmoins, la visite peut-être améliorée en ajoutant des étapes de transitions, des annotations, etc...

##### Animer le mécanisme

Nous allons créer une étape supplémentaire pour montrer à quoi ressemble le mécanisme interne du stator quand la clef n'y est pas introduite. Comme elle servira de transition entre les étape B et A. Si il est tout à fait possible de partir de l'étape B pour la créer, nous utiliserons ici l'étape A, car il est important que le curseur du slicer soit identique entre les deux étapes. 

Nous nommerons cette étape: **étape D**.

_N'oubliez pas de déplacer cette étape vers le haut pour la placer entre les étapes B et A.

Nous commençons tout d'abord par déplacer la clef de façon à ce qu'elle soit en dehors du stator. Afin de garder une transition cohérente, copiez coller les valeurs de Transform dans les **Paramètres** de la clef de l'étape B vers la clef de l'étape D.

Toujours sur l'étape D, nous allons ensuite nous occuper d'animer le mécanisme interne. Sans l'action de la clef pour les pousser, les ressorts sont relachés, et les goupilles et contre-goupilles placées plus haut. Il est important de garder à l'esprit que les contre-goupilles bloque le mécanisme en l'absence de clef, il faut donc qu'elles soient placées à mi hauteur de l'ouverture goupille du barillet.

Ici, nous plaçons: 

* le Scale des Ressorts dans l'Axe Y en 1.5.
* la Position des Goupilles et des Contre-Goupilles dans l'Axe Y à 0.03.

Mettez à jour l'étape et vérifiez les animations.

**Astuce**: il est parfois compliqué de positionner correctement les pièces de mécanisme si la vue est trop dézoomée. Or, zoomer dans l'espace n'est pas bon, car vous risquer de modifier le point de vue entre les différentes étapes.
Il est tout de même possible de vérifier les emplacements sans crainte: zoomez dans l'espace, placez une pièce au bon endroit et notez les nouvelles valeurs du paramètre, changer d'étape et revenez sur l'étape voulue pour réinitialiser la vue. Changer les valeurs de l'objet en fonction de l'objet, mettez à jour l'étape et recommencer si besoin pour les autres objets.

**Pour aller plus loin**: suite aux changements de translation de l'étape D, le mécanisme s'anime lorsque l'on passe à l'étape A... mais également à l'étape B, les deux partageant les mêmes informations données sur ces objets précis. Le stator étant encore plein au moment de la transition entre l'étape B et D, ce léger mouvement n'est pas choquant. Néanmoins, il est possible de règler ce détail de deux manières possibles: 

* Vous pouvez effectuer les changements de l'étape D sur l'étape B, à savoir mettre à jour la Position des goupilles et contre-goupilles, ainsi que l'échelle des ressorts;

* L'étape B et D n'ont qu'une différence: l'étape de l'outil Coupe. Vous pouvez donc supprimer l'étape B, créer une nouvelle étape à partir de l'étape D (afin de repartir avec une étape similaire), la placer en haut de la liste et désactiver l'Outil Coupe.

Les deux méthodes décrites sont optionnelles et amènent au même résultat. La première est plus fiable, car elle ne nécessite pas la supprission ni le changement de liste dans le Tour Editor. La deuxième est plus rapide, surtout quand il est nécessaire de modifier beaucoup d'objets à la fois.

##### Ajouter des Annotations

Ici, nous verrons comment utiliser les Tags d'annotation pour annoter la scène en fonction des étapes de la visite guidée. Une partie des annotations sera affichée pour le mécanisme externe (barillet, stator, etc...), et l'autre partie sera montrée pour le mécanisme interne (goupille, ressort, etc...).

Pour les besoin de cet exercice, nous voulons placer les annotations à l'étape B et D. Nous commençons tout d'abord par sélectionner l'étape B.

<img src="/assets/img/doc/AnimatedTours_Exo_22.jpg" width ="600" alt="illustration Media Voyager" />

Rendez-vous dans l'onglet **Annotation**, en haut de l'Explorer. Nous commencerons par créer les annotations pour le mécanisme externe.

Sélectionnons tout d'abord le Stator. Pour cet exercice, seul le titre de l'annotation ainsi que son tag seront changés. N'hésitez pas à aller plus loin si vous le souhaitez: _pourquoi ne pas essayer de passer vos annotations en Extended et y ajouter des descriptions ?_

<img src="/assets/img/doc/AnimatedTours_Exo_23.jpg" width ="700" alt="illustration Media Voyager" />

En cliquant sur l'icône "Créer", puis sur le stator, une annotation se crée. Dans ses paramètres, nous changeons son titre pour "Stator", et indiquons son Tag en "Mécanisme Extérieur". 

Répéter ces actions pour le Barillet et le Panneton en adaptant le Titre des annotations selon l'objet. **Attention**: nous vous rappelons que les annotations sont liés aux objets de la scène: par conséquent, il est important de bien sélectionné l'objet voulu avant de créer votre annotation.
Pour cet exercice, il est important que ces trois objets partagent strictement le même nom de Tag.

**A noter**: une fois le Tag créée, il apparaitra dans l'onglet des tags, en dessous de l'Explorer. N'oubliez pas de l'activer pour l'afficher sur la scène.

Passons désormais à l'étape D. Nous allons faire de même pour l'un des Ressort, une Goupille, ainsi qu'une Contre-Goupille. Cette fois-ci, le Tag utilisé devra être différent. Ici, nous utiliserons le terme "Mécanisme Intérieur".

**Attention**: si le mécanisme intérieur est visible, n'oubliez pas que le stator le recouvre toujours théoriquement. En essayant de créer une annotation sur l'une de ces pièces intérieures, vous cliquerez sur le stator, ce qui n'est pas souhaitable. N'hésitez pas à rendre invisible le stator dans ses paramètres d'objet, le temps de créer ces annotations.
N'oubliez pas de rendre de nouveau visible le stator une fois l'opération terminée.

Mettez à jour l'étape, sans omettre d'activer le nouveau Tag créée. Il n'est pas nécessaire de créer une annotation pour chaque pièce similaire, mais vous pouvez, par exemple, alterné les rangées annotées pour plus du lisibilité. (ex: placez une annotation sur la goupille de la rangée 1, une annotation sur la contre-goupille de la rangée 2, une annotation sur le ressort de la rangée 3...).

Enfin, créons une annotation pour la clef. Pour cette partie de l'exercice, il n'est pas nécessaire de lui créer de Tag d'annotation. Sans tag, l'annotation sera visible dans les deux étapes. Vous noterez que le panneton est dans la même situation: vous pouvez lui retirer son Tag de Mécanisme extérieur en supprimant ce texte dans le conteneur Tags de ses paramètres.

**Vous pouvez tout à fait choisir de laisser afficher les annotations sur le reste de la visite**. Vous remarquerez d'ailleurs que les annotations suivent les translations d'objet auxquelles elles sont attachées. Par soucis de lisibilité, nous vous conseillons de ne laisser afficher que les annotations du Tag Mécanisme Extérieur.

##### Effectuer un changement d'objet

Il existe, à ce jour, deux méthodes pour effectuer un changement d'objet dans une scène DPO-Voyager.

###### En utilisant les Dérivatives

###### En important un nouvel objet


* [Revenir en haut de la page](#apprendre-à-animer-des-mises-en-scène-grâce-aux-visites-guidées)
