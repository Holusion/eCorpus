---
title: Ajouter une narration Audio
rank: 7
---

## Placer l'immersion au coeur de votre médiation

Souvent delaissé à tord, la narration audio est un véritable atout dans l'immersion du visiteur. Avec ce guide, vous apprendrez comment ajouter et mettre en avant des pistes audio dans votre scène eCorpus.

## Présentation de la fonction Audio

WIP [Insérer une vidéo de présentation ici]

<iframe name="eCorpus Voyager" src="https://ecorpus.holusion.com/ui/scenes/BoulogneSurMer_Gargouille/view?lang=FR" width="800" height="450" allow="xr; xr-spatial-tracking; fullscreen"></iframe>

### Sommaire

* [Importer des pistes audio](#importer-des-pistes-audio-dans-une-scène-ecorpus)
    * [Préparer des pistes audio](#comment-préparer-des-pistes-audio-pour-une-bonne-implémentation-dans-ecorpus)
    * [Ajouter et créer des pistes audio dans eCorpus](#ajouter-et-créer-des-pistes-audio-dans-une-scène-ecorpus)
* [Mettre en scène des pistes audio](#mettre-en-scène-des-pistes-audio)
    * [Créer et paramétrer des éléments audio](#tout-savoir-sur-les-éléments-audio)
    * [Utiliser l'outil Narration](#utiliser-loutil-narration)
    * [Utiliser de l'audio dans des Annotations](#lier-de-laudio-aux-annotations)
* [En savoir plus](#en-savoir-plus)


## Importer des pistes audio dans une scène eCorpus

### Comment préparer des pistes audio pour une bonne implémentation dans eCorpus

Avant de procéder à l'implémentation de vos premières pistes audio dans eCorpus, il est important de s'assurer de la **bonne préparation des pistes sonores**. eCorpus n'est pas limité en nombre de fichiers audio intégré dans la scène, en revanche, **seul les fichier .mp3 sont utilisables** pour cette fonctionnalité.

#### Comment organiser la production de ses pistes audio ?

Au même titre que les fonctions d'[Annotations](annotation), d'[Articles](article) et de [Visites Guidée](tours), la fonction Narration Audio crée un icone en haut à gauche de votre visualisateur de scène, sur lequel l'utilisateur peut cliquer pour lancer la piste audio lié.

**A noter: la Narration Audio ne peut contenir qu'une seule piste audio**

A ce titre, deux approches sont possibles:

* **La Narration sert d'introduction à la scène**. Elle peut donner les informations sémantiques principales, invite l'utilisateur à entamer des visites guidées, ou bien servir d'ambiance pour faciliter l'immersion de l'utilisateur. Le reste des informations sonores serra ensuite donné sous forme de pistes audio liés à des annotations.

* **La Narration compile toutes les informations données sur l'oeuvre présentée**. Des extraits de cette piste générale peuvent ensuite être redonnés avec contexte sous forme de pistes audio liées à des annotations. C'est par exemple le cas avec la scène de la Gargouille, [donnée en exemple un peu plus haut](#présentation-de-la-fonction-audio)

La préparation des pistes se fait donc en fonction de la mise en scène souhaitée. Il est tout de même conseillé de garder une piste sonore contenant toutes les différentes parties du scénario. Cette piste dite "Master" assurera une édition facilité pour de possibles retouches sonores ou fragmentation des pistes via un logiciel tiers de traitement audio.

#### Editer et créer vos pistes vous-même grâce à un logiciel d'édition audio

De nombreuses solutions sont disponibles concernant la création et l'édition de pistes audio. Vous êtes tout à fait libre de choisir la plus adaptée à vos besoins, du moment que le fichier exporté soit dans le format .mp3. 

Pour ceux à la recherche d'un **logiciel d'édition audio libre et gratuit**, nous recommandons <a href="https://audacity.fr.softonic.com/">Audacity</a>. Un guide apprenant les bases du logiciel sera prochainement présenté dans les guides <a href="/fr/doc/advancedUses/index">d'Utilisations avancées</a>. 

### Ajouter et créer des pistes audio dans une scène eCorpus

Afin de pouvoir utiliser une narration audio dans eCorpus, il est indispensable **d'importer les fichiers .mp3 voulus dans la scène eCorpus à éditer**. Rendez-vous tout d'abord sur votre base de données eCorpus, et sélectionnez le bouton **"Editer"** dans la scène à mettre à jour. Si vous souhaitez revoir les paramètres importants de création et d'édition de scène, veuillez vous rendre sur [ce guide](import).

<img src="/assets/img/doc/Audio_01.jpg" width ="900" alt="illustration Media Voyager" />

Une fois dans le mode Edition de votre scène, rendez-vous dans l'onglet **"Media"**, en haut à gauche de votre page.

<img src="/assets/img/doc/Audio_02.jpg" width ="400" alt="illustration Media Voyager" />

Cet onglet représente tous les médias annexes présents dans votre scène, tels que les modèles 3D importés et les images capturées pour les miniatures. 

Pour importer vos fichiers .mp3, **selectionnez-les pour venir les glisser-déposer directement dans l'onglet Média**.

#### Organiser ses Médias

Dans l'optique de garder une bonne visibilité dans vos Médias, l'onglet dispose de deux fonctionnalités, décrites ci-dessous:

##### Créer des dossiers

<img src="/assets/img/doc/Audio_10.jpg" width ="400" alt="illustration Media Voyager" />

En cliquant sur le bouton en forme de dossier, il vous est possible de créer des dossiers que vous pouvez renommer comme bon vous semble. Vous pouvez, par exemple, créer un dossier "Audio" pour y ranger vos pistes audio, comme illustré ci-dessus.

_Conseil: si votre narration est multilingues, vous pouvez créer des sous-dossier pour organiser vos médias par type, et aussi par langue._

##### Supprimer des Médias

<img src="/assets/img/doc/Audio_09.jpg" width ="400" alt="illustration Media Voyager" />

Cliquer sur l'icône de poubelle pour supprimer un média sélectionner.

## Mettre en scène des pistes audio

### Tout savoir sur les éléments audio

Une fois vos médias importé, il est important de créer des **éléments Audio**. Ces éléments ont un fonctionnement très similaire aux annotations.

<img src="/assets/img/doc/Audio_03.jpg" width ="900" alt="illustration Media Voyager" />

Afin d'ouvrir l'onglet scpécifique aux éléments audio, cliquez sur l'onglet **Audio** disponible en haut de l'Explorer, à droite de bouton de **Visites Guidées**.

<img src="/assets/img/doc/Audio_04.jpg" width ="400" alt="illustration Media Voyager" />

Une fois cliqué, l'onglet élements audio s'ouvrira en bas à gauche de l'Explorer, juste en dessous de l'onglet comprenant les Médias, dans lequel sont déposés les médias audio.

Cet onglet se compose d'une liste comprenant les éléments audio créés, ainsi que deux boutons:

##### Create

Ce bouton permet de créé un élément audio.

##### Delete

Ce bouton permet de supprimer un élément audio. Il est grisé et inutilisable si la liste d'élément audio est vide.

**Attention, la suppression d'un élément audio est définitive, et ne supprime pas le média audio auquel il est attribué.**

#### Les paramètres des éléments audio

Chaque élément audio contient une liste de paramètre qu'il vous ait donné de modifier.

##### Title

Ce paramètre permet de donner un nom à votre élément audio. C'est ce nom qui sera affiché dans la liste des éléments audio, et dans les listes d'attribution audio d'annotation, décrite plus bas.

##### Language

Ce paramètre permet de définir la piste audio selon la langue désirée. **Un élément audio peut donc contenir plusieurs pistes audio**, une pour chaque langage proposé.

##### Filepath

<img src="/assets/img/doc/Audio_11.jpg" width ="400" alt="illustration Media Voyager" />


Ce paramètre contient la piste audio utilisé par l'élément. Pour y attribuer une piste audio, **sélectionnez-là dans les médias, et glisser-déposer la piste directement dans le conteneur du Filepath**.

##### Captionpath

Ce paramètre contient le **média de sous-titrage** qui se jouera en même temps que la piste audio attribuée.

**Il n'est pas nécessaire d'avoir un élément de sous-titrage pour le bon fonctionnement de la narration audio.**

Si vous souhaitez intégrer un sous-titrage à votre élément audio, il vous faudra importer vos fichiers correspondant dans le Média, en utilisant le même procédé que pour une piste audio.

#### Note avancée: Réaliser vos sous-titrage par vous-même

Envie de réaliser vos sous-titrage par vous-même ? Il vous suffit d'ouvrir n'importe quel application de traitement de texte, tel que le Bloc-Notes Windows, Google Docs, WordPad, Notepad, etc... et d'écrire vos sous-titrage sous cette forme:

**NB**: les balises entre $[] sont à remplacer par des valeurs personalisées selon vos besoins.

```
WEBVTT 

$[Balise temporelle de début du sous-titrage 1 (minutes:secondes.milisecondes)] ---> $[balise temporelle de fin de sous-titrage 1 (minutes:secondes.milisecondes)]
$[Texte de sous titrage 1]

$[Balise temporelle de début du sous-titrage 2 (minutes:secondes.milisecondes)] ---> $[balise temporelle de fin de sous-titrage 2 (minutes:secondes.milisecondes)]
$[Texte de sous titrage 2]
```
**A noter** Il est important de garder un espace " " à la fin du WEBVTT

_Voici un exemple concret avec un extrait du texte de sous-titrage utilisé pour l'exemple de la Gargouille:_
```
WEBVTT 

00:00.000 --> 00:01.302
Si vous êtes amateur de vieilles pierres,

00:01.310 --> 00:03.072
ou tout simplement observateur

00:03.100 --> 00:06.611
vous avez forcément déjà vu des gargouilles
```

Une fois votre texte écrit, vous pouvez le sauvegarder en **format .vtt** et l'importer dans eCorpus.

##### Si aucune fonction d'export .vtt n'existe dans votre application 

Ce n'est pas grave: il existe un moyen simple de contorner cette contrainte. Enregistrez le texte en format de texte brut (.txt). Ensuite, retrouver le fichier dans votre ordinateur et renommer-le de façon à remplacer le .txt par .vtt.


### Utiliser l'outil Narration

L'icône Narration est très utile pour ajouter un aspect immersif via une narration audio. Il fonctionne selon la même logique que les icônes Annotations et Visites Guidées: il est affiché en haut à gauche de l'Explorer et se lance dés que l'utilisateur clique dessus. Par défaut, l'icône n'est pas affiché si le paramètre de Narration n'est pas activé.

**Pour activer le paramètre de Narration**, rendez-vous dans l'onglet **Audio** et sélectionner l'élément audio que vous souhaitez passer en Narration Audio. Si vous souhaitez revoir l'étape pour accéder à cet onglet, veuillez vous réferrer [au point précédent](#mettre-en-scène-des-pistes-audio).

<img src="/assets/img/doc/Audio_05.jpg" width ="400" alt="illustration Media Voyager" />

Une fois le bon élément audio selectionné, vous pouvez cliquer sur le bouton **isNarration** pour activer l'icône Narration. Une fois activé, le bouton passe en bleu.

**Attention**: vous ne pouvez avoir qu'un seul élément audio d'activé parmis tous les éléments audio. Il est impossible d'avoir plusieurs éléments partageant cette spécificité.

<img src="/assets/img/doc/Audio_06.jpg" width ="900" alt="illustration Media Voyager" />

Une fois cliqué, l'icône Narration fait apparaître une piste de lecture audio un haut de l'explorer. **La piste devrait se jouer automatiquement**.
Si vous avez ajouter des sous-titres dans le paramètre "Captionpath" de l'élément, ils devraient s'afficher automatiquement lors de la lecture audio. 


Si les sous-titrages ne s'affichent pas à la lecture d'une piste audio, alors qu'un fichier .vtt a bien été associé dans le Captionpath de l'élément audio, **vérifier que l'icône "CC" apparaissant en bas à droite de l'explorer est bien activé** (représenté par une couleur bleue).

<img src="/assets/img/doc/Audio_12.jpg" width ="200" alt="illustration Media Voyager" />

**Attention**: l'icône d'activation du sous-titrage **"CC"** n'est visible que lorsqu'une piste audio est en cours de lecture.

Si les sous-titrages ne s'affichent toujours pas, veuillez relire attentivement le fichier .vtt afin de vérifier qu'aucune erreur ne se soit glisser dans la mise en forme du fichier.

### Lier de l'audio aux Annotations

A l'instar des Articles, il est tout à fait possible de **lier des éléments audio à des annotations**.

<img src="/assets/img/doc/Audio_07.jpg" width ="400" alt="illustration Media Voyager" />

Pour ce faire, sélectionnez l'annotation dans laquelle vous souhaiteriez ajouter un élément audio. 

Cliquer sur la flêche dans le conteneur **Audio**, dans les paramètres de l'annotation, pour faire apparaître une liste déroulante contenant les éléments audio créés. Sélectionnez ensuite l'élément voulu.

<img src="/assets/img/doc/Audio_08.jpg" width ="700" alt="illustration Media Voyager" />

Une fois l'annotation sauvegardé, une piste de lecture audio devrait s'afficher dans l'annotation.

**Attention**: Le style d'annotation doit être paramétré en **Extended** pour que la piste de lecture apparaisse. Vous pouvez en savoir plus en suivant [ce guide](annotation).

## En savoir plus

Vous venez à bout des tutoriels vous apprenant les bases d'eCorpus, félicitations !

Les possibilités qu'offrent eCorpus sont nombreuses, et n'ont pas toutes été citées. Une catégorie de guides avancés vous attendent pour en découvrir encore plus.

Apprenez-en plus sur les fonctionnalités d'eCorpus et la manière de gérer vos contenus en suivant nos guides avancés: <a href="/fr/doc/advancedUses/index">Utilisations avancées</a>

* [Revenir en haut de la page](#placer-limmersion-au-coeur-de-votre-médiation)