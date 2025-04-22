---
title: Créer une scène
rank: 3
---

## Prise en main d'eCorpus

eCorpus est un **logiciel libre** permettant de conserver, annoter et diffuser des modèles 3D. Cet ensemble de tutoriel a pour but de vous permettre de **découvrir les fonctionnalités d'eCorpus** en tant qu'utilisateur, éditeur et administrateur.

* eCorpus utilise le visualisateur 3D <a href="https://smithsonian.github.io/dpo-voyager/">**DPO-Voyager**</a>.


## Découverte d'une scène eCorpus

<iframe src="https://pod.univ-lille.fr/video/40131-creer_scenemp4/?is_iframe=true" width="800" height="450" style="padding: 0; margin: 0; border:0" allowfullscreen title="creer_scene.mp4" ></iframe>


### Sommaire

* [Gérer les options de scène](#découvrir-les-options-de-gestion-de-scène)
    * [Visualiser sa scène](#le-bouton-voir)
    * [Editer sa scène](#le-bouton-editer)
    * [Administrer sa scène](#administrer-sa-scène)
* [Les bases pour un bon paramètrage de scène](#les-bases-pour-bien-paramètrer-sa-scène-rapidement)
    * [Aperçu rapide de l'interface de Voyager Story](#aperçu-rapide-de-linterface-de-voyager-story)
    * [Les contrôles de base](#les-contrôles-de-base)
    * [Créer une image de miniature](#créer-une-image-de-miniature)
    * [Recentrer un objet dans la scène](#centrer-son-modèle-automatiquement)
* [En savoir plus](#en-savoir-plus)


## Préparation d'une scène eCorpus

### Découvrir les options de gestion de scène

Après avoir chargé votre modèle 3D, préparer vos collaborateurs d'édition, la langue de votre projet, la licence et les informations clés comme l'auteur, le site où l'oeuvre est conservée, la date de réalisation...

<img src="/assets/img/doc/SceneCreation_01.jpg" width ="800" alt="illustration importation" />


Le modèle apparait directement dans l'onglet "**Mes Scènes**" une fois son importation terminée. Par défaut, votre scène arborera une miniature représentant un cube en fil de fer. 
Vous remarquerez **2 boutons cliquables** en dessous de votre scène. 

#### Le bouton "Voir" 
<img src="/assets/img/doc/SceneCreation_03.jpg" alt="illustration importation" width ="200" />


Il sert uniquement à **visualiser** votre scène 3D.


#### Le bouton "Editer" 


<img src="/assets/img/doc/SceneCreation_04.jpg" alt="illustration importation" width ="200" />


Il sert à **éditer** votre scène 3D pour y changer et ajouter du contenu. Dans l'éditeur, vous remarquerez d'abord la fenêtre du milieu, dite "Explorer". Dans celle-ci se trouve le modèle 3D que vous avez importé. Avec votre souris, vous pouvez changer votre vue sur l'objet. Pour en savoir plus sur les options d'édition, [veuillez vous rendre sur ce point](#les-bases-pour-bien-paramètrer-sa-scène-rapidement).


#### Administrer sa scène


<img src="/assets/img/doc/SceneCreation_05.jpg" width ="200" alt="illustration importation" />


Pour gérer l'administration de votre scène, cliquez directement sur le nom de cette-dernière. Dans la catégorie "**Droit d'accès**", à droite, vous trouverez une liste de différents utilisateurs ainsi que leurs droits attribués.

Voyons d'abord les différents status de droit que vous pouvez attribuer à chacun des utilisateurs.
<img src="/assets/img/doc/AdminSettings_01.jpg" width ="100%" alt="illustration importation" />


* **Aucun**: Un utilisateur ayant ce droit ne pourra pas accèder à votre scène.

* **Lecture**: Un utilisateur ayant ce droit aura accès au visualisateur de votre scène, mais ne pourra pas la modifier.

* **Ecriture**: Un utilisateur ayant ce droit pourra voir et éditer votre scène 3D.

* **Admin**: Un utilisateur ayant ce droit pourra voir, éditer, et changer les droit d'administrateur de cette scène.



Maintenant, concentrons nous sur les différents utilisateurs listés:

* **Accès Public**: Concerne tous les visiteurs du lien, y compris les personnes non identifiées sur la base de donnée.

_Si votre scène est visible en public, nous vous conseillons de lui attribuer un droit "Lecture"_

* **Utilisateur Authentifié**: Concerne tous les membres ayant un compte sur votre base de donnée

Vous pouvez ajouter un nom d'utilisateur pour lui donner des droits spécifiques. Il suffit d'écrire son nom d'utilisateur exacte et de cliquer sur "**+**".


<img src="/assets/img/doc/AdminSettings_03.jpg" width ="100%" alt="illustration importation" />


Enfin, vous remarquerez la présence de **4 boutons** à gauche.

##### Editer

Il permet d'**éditer** votre scène eCorpus. Pour en savoir plus sur l'édition de scène, [veuillez vous rendre sur ce point](#les-bases-pour-bien-paramètrer-sa-scène-rapidement).

##### Voir

Il permet de **visualiser** votre scène eCorpus. 

##### Télécharger la scène

Il permet de télécharger la scène sous format de dossier compressé (.zip), contenant notamment votre scène eCorpus sous format .json, les modèles 3D .glb ainsi que les informations d'articles, d'annotations et de visite guidés présents au moment du téléchargement.

Télécharger votre scène eCorpus permet, par exemple:

* de récupérer les modèles de votre base de donnée pour une utilisation quelquonque (impression 3D, édition du modèle, etc...);
* de copier votre scène sur une autre base de données eCorpus;
* de charger votre scène sur####  Aperçu rapide de l'interface de Voyager Story 
 une vitrine holographique interactive.

##### Historique

Il permet d'avoir accèse à l'historique d'édition de la scène. 

Il témoigne de chaque changement effectué sur la scène depuis sa création. 
Si vous avez sauvegardé une mauvaise version de votre scène, vous pouvez restaurer une version précédente à cette modification en survolant une étape de l'historique et en cliquant sur "restaurer".




<img src="/assets/img/doc/AdminSettings_02.jpg" width ="90%" alt="illustration importation" />

**Attention, cliquer sur "restaurer à" ne supprimera pas les changements: de nouvelles entrées seront ajoutées à la date présente pour restaurer la scène dans l'état ou elle était à la date indiquée**


### Les bases pour bien paramètrer sa scène rapidement

####  Aperçu rapide de l'interface de Voyager Story 

Les différentes options sont détaillée au fil des sections qui suivent.

##### pour éditez votre scène

<div class="section">
  <ul>
    <li>{% include sv_button.html name="pose" icon="move" %} Positionner et redimensionner le modèle.</li>
    <li>{% include sv_button.html name="capture" icon="camera" %} Prendre des captures d'écran et enregistrer l'état de la scène.</li>
    <li>{% include sv_button.html name="derivatives" icon="hierarchy" %} Gérer les dérivés (différents niveaux de détail).</li>
    <li>{% include sv_button.html name="annotations" icon="comment" %} Créer et modifier des annotations.</li>
    <li>{% include sv_button.html name="articles" icon="file" %} Créer et éditer des articles.</li>
    <li>{% include sv_button.html name="visites" icon="globe" %}  Créer et modifier des visites guidées.</li>
    <li>{% include sv_button.html name="parametres" icon="eye" %}  Éditer les paramètres de la scène.</li>
  </ul>
</div>


##### pour explorer votre scène
  
  <div class="section">
      <ul>
        <li>{% include sv_button.html icon="globe" %} Afficher les visites guidées.</li>
        <li>{% include sv_button.html icon="file" %} Afficher les articles.</li>
        <li>{% include sv_button.html icon="comment" %} Afficher les annotations.</li>
        <li>{% include sv_button.html icon="share" %} Partager la scène.</li>
        <li>{% include sv_button.html icon="expand" %} Mode plein écran.</li>
        <li>{% include sv_button.html icon="tools" %} Outils et paramètres.</li>
      </ul>
    </div>


####  Les contrôles de base

<img src="/assets/img/doc/SceneEdition_01.jpg" width ="800" alt="illustration importation" />


* Restez appuyé sur clic gauche et bouger votre souris pour pivoter l'objet.

* Restez appuyé sur la molette de la souris pour changer le zoom de l'objet. Avancer votre souris vous ferra zommer sur l'objet, la reculer aura l'effet inverse.

* Restez appuyé sur clic droit et bouger votre souris pour déplacer l'objet dans l'espace.



Vous noterez que le nom de la scène est affiché en haut à gauche de cette fenêtre. Pour le changer, il vous faut vous rendre dans la fenêtre tout à gauche, dans "**Collection**" (la fenêtre affiche "**Navigator**" par défaut). 


<img src="/assets/img/doc/SceneEdition_02.jpg" width ="800"  alt="illustration importation" />


Vous pourrez ici changer la langue de la scène, son titre et l'introduction qui s'affichera en pop-up à chauque ouverture de la scène par un utilisateur. Changer la langue ajoutera une nouvelle langue à la scène et ne supprimera _pas_ les changements faits sur la langue d'origine. 


_Vous pouvez donc avoir plusieurs langues sur une même scène._


<img src="/assets/img/doc/SceneEdition_03.jpg" width ="800" alt="illustration importation" />


**Pour sauvegarder vos changements** cliquez sur le bouton "**Save**" en haut à droite. 

#### Créer une image de miniature

Pour **créer une miniature** à votre scène 3D, rendez-vous dans l'onglet "**Capture**", juste au dessous de la fenêtre "**Explorer**". 


<img src="/assets/img/doc/SceneEdition_04.jpg" width ="800" alt="illustration importation" />


Une fois l'onglet cliqué, vous remarquerez de nouvelles options tout en bas à gauche de votre écran. Dans "**Scene State**", cliquer sur le bouton "**Capture**" pour que l'éditeur prenne une "photo" de la scène dans son état actuel.
<img src="/assets/img/doc/SceneEdition_05.jpg" width ="200" alt="illustration importation" />


 Une prévisualisation se met alors à jour dans la "**Preview**". N'hésitez pas à orienter votre objet différement et à le déplacer si besoin. Vous pouvez recommencer la capture autant de fois que nécessaire.

<img src="/assets/img/doc/SceneEdition_06.jpg" width ="200" alt="illustration importation" />


Une fois que l'image vous convient, vous pouvez la sauvegarder en cliquant sur le bouton "**Save**" en dessous du bouton "**Capture**".

**Attention, sauvegarder la scène sans avoir sauvegarder la miniature dans l'onglet Capture ne suffit pas, vous risquez de perdre votre image de miniature.**

#### Centrer son modèle automatiquement

Lors de l'importation de votre modèle 3D, il se peut que l'emplacement du modèle ne soit pas le bon. Si vous remarquez que votre modèle est excentré dans la scène, ou que son centre de rotation ne semble pas correcte, vous pouvez corriger son emplacement via l'onglet "**Pose**", en haut de l'Explorer.
<img src="/assets/img/doc/SceneEdition_07.jpg" width ="800" alt="illustration importation" />


En cliquant sur "**Pose**" vous noterez un changement dans l'Explorer. La vu 3D est désormais divisée en 4 plans, montrant respectivant une vue 3/4, une vue de dessus, un vue de côté, et enfin une vue de face de votre scène.

Vous remarquerez également l'apparition d'une grille virtuelle. Cette grille ne sert que de repère pour repositionner votre modèle, elle n'apparaîtra donc pas sur votre scène finale.

Le centre de cette grille correspond au centre de rotation de la scène. Nous vous conseillons donc de replacer votre objet de manière à ce que son centre de rotation soit placé au centre de cette grille.

<img src="/assets/img/doc/SceneEdition_08.jpg" width ="300" alt="illustration importation" />


Vous recentrer facilement votre modèle, il vous suffit de cliquer sur le bouton "Center", tout à droit de l'onglet.


Il se peut que le recentrage automatique ne suffise pas à règler les problèmes de placement. Pour replacer votre modèle manuellement, il vous suffit de changer les valeurs dans les emplacements de Position. 

Un tutoriel avancé sur l'édition du point de pivot de votre objet sera bientôt disponible sur la plateforme.


## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="annotation">Créer des annotations</a>.


* [Revenir en haut de la page](#prise-en-main-decorpus)