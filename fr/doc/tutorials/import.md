---
title: Créer une scène
rank: 3
---

# Création de scènes

## Prise en main d'eCorpus

eCorpus est un **logiciel libre** permettant de conserver, annoter et diffuser des modèles 3D. Cet ensemble de tutoriel a pour but de vous permettre de **découvrir les fonctionnalités d'eCorpus** en tant qu'utilisateur, éditeur et administrateur.

* eCorpus utilise le visualisateur 3D <a href="https://smithsonian.github.io/dpo-voyager/">**DPO-Voyager**</a>.


## Découverte d'une scène eCorpus

<iframe src="https://pod.univ-lille.fr/video/40131-creer_scenemp4/?is_iframe=true" width="800" height="450" style="padding: 0; margin: 0; border:0" allowfullscreen title="creer_scene.mp4" ></iframe>


### Sommaire

* [Créer une scène eCorpus](#créer-une-scène-ecorpus)
* [Gérer les options de scène](#découvrir-les-options-de-gestion-de-scène)
    * [Visualiser sa scène](#le-bouton-voir)
    * [Editer sa scène](#le-bouton-editer)
    * [Administrer sa scène](#administrer-sa-scène)
* [Les bases pour un bon paramètrage de scène](#les-bases-pour-bien-paramètrer-sa-scène-rapidement)
    * [Aperçu rapide de l'interface de Voyager Story](#aperçu-rapide-de-linterface-de-voyager-story)
    * [Les contrôles de base](#les-contrôles-de-base)
    * [Créer une image de miniature](#créer-une-image-de-miniature)
    * [Recentrer un objet dans la scène](#centrer-son-modèle-automatiquement)
* [Partager facilement sa scène](#pouvoir-partager-facilement-sa-scène-ecorpus)
    * [Implémenter la scène sur une page Web](#permettre-laffichage-de-la-scène-sur-une-page-web)
* [En savoir plus](#en-savoir-plus)


## Préparation d'une scène eCorpus

### Créer une scène eCorpus

#### Comment générer et mettre en ligne votre modèle 3D
Pour **charger un modèle 3D** sur votre compte eCorpus, il vous suffit de vous rendre la page principal de votre base de donnée. Vous pouvez notamment vous y rendre en cliquant sur le logo affiché en haut à gauche de la page.

<img src="/assets/img/doc/SceneCreation_01.jpg" width ="800" alt="illustration connexion" />

Vous trouverez un onglet "**Tools**" en haut à gauche dans lequel s'imbrique 3 boutons. Cliquez sur le bouton "**Créer une scène**". La page changera pour afficher les paramètres de création de scènes eCorpus.

<img src="/assets/img/doc/SceneCreation_06.jpg" width ="100%" alt="paramètre création de scène" />

Une fois rendu, cliquez sur le bouton "**Choisir un fichier**". Un pop-up apparaîtra vous demandant de sélectionnier dans vos documents le fichiers à téléverser sur la base de données.

* *Vous pouvez également glisser déposer le fichier à téléverser directement sur l'onglet*

Enfin, nommez votre scène (ce nom sera directement visible dans l'URL, par conséquent, veuillez éviter les caractères spéciaux), sélectionner la langue par défaut de votre, et cliquer sur le bouton "**créer une scène**" pour lancer l'import de votre modèle 3D dans la base de données.


* Seule l'extension .glb est utilisable sur l'editeur eCorpus. Pour apprendre à exporter un modèle en .glb, veuillez vous réferrer [au point suivant](#découvrir-les-options-de-gestion-de-scène).
* Si vous êtes administrateur sur votre base de données eCorpus, il vous est possible d'importer des scènes eCorpus (préalablement téléchargement d'une autre base de données eCorpus, par exemple) directement sous format .zip. Pous savoir comment télécharger une scène sous format .zip, veuillez vous rendre sur [ce point](#télécharger-la-scène).

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

##### Historique

Il permet d'avoir accès à l'historique d'édition de la scène. 

Il témoigne de chaque changement effectué sur la scène depuis sa création. 
Si vous avez sauvegardé une mauvaise version de votre scène, vous pouvez restaurer une version précédente à cette modification en survolant une étape de l'historique et en cliquant sur "restaurer".




<img src="/assets/img/doc/AdminSettings_02.jpg" width ="90%" alt="illustration importation" />

**Attention, cliquer sur "restaurer à" ne supprimera pas les changements: de nouvelles entrées seront ajoutées à la date présente pour restaurer la scène dans l'état ou elle était à la date indiquée**

##### Ajouter sa scène dans une collection précise

Il est tout à fait possible de créer et de gérer des collections de scènes eCorpus en fonction des besoins, grâce à la création et à la gestion de **Tags**. 


En haut à droite de la fenêtre de gestion des Droits d'accès ([comme illustré dans ce point](#administrer-sa-scène)) se trouve le lien cliquable **"Modifier les tags"**. Il vous suffit de cliquer dessus pour y faire apparaître un bouton vous permettant de modifier les tags associés à cette scène.

<img src="/assets/img/doc/AdminSettings_04.jpg" width ="90%" alt="illustration création tag" />

* Si vous souhaitez inclure la scène dans **une collection déjà existante**, cliquez sur la flêche du menu déroulant et sélectionnez le nom correspondant au tag que vous souhaitez associer.
* Si vous souhaitez inclure la scène dans une **collection qui n'existe pas encore**, cliquez directement dans la barre du menu déroulant pour y entrer le nom souhaité pour votre collection. Une fois le nom entré, cliquer sur l'icône **+** juste à droite pour créer la collection et y associé d'emblé la scène.

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


## Pouvoir partager facilement sa scène eCorpus

Une fois votre scène créée et paramétrée selon votre souhait, il vous ait possible de la partager. Pour cela, plusieurs solutions sont possibles:

#### Partager le lien du visualisateur

La première solution est également la plus simple: il s'agit de se rendre sur le visualisateur de la scène eCorpus (bouton **"Voir"**) et de copier coller le lien pour le partager ensuite sur des publications de réseau sociaux (type LinkedIn).

**Attention: afin que la scène soit visible au public non identifié, veuillez à bien indiquer "Lecture" dans les droits d'accès intitulé "Accès Public" de la scène en question**

#### Permettre l'affichage de la scène sur une page Web

Cette solution permet l'affichage d'une scène eCorpus dans une page Web. Chaque scène eCoprus possède une icône de **Partage**, situé à gauche de l'Explorer, permettant la copie d'un code "Iframe".
[Vous trouverez ici la liste des icônes de l'Explorer](#pour-explorer-votre-scène)

Il suffit donc de récupérer de copier coller ce colle dans le code de votre page, à l'endroit souhaité.

**Attention: afin que la scène soit visible au public non identifié, veuillez à bien indiquer "Lecture" dans les droits d'accès intitulé "Accès Public" de la scène en question**

#### Partager la scène à ses collègues vient les droits d'administration

Si ils possèdent un compte sur votre base de données eCorpus, il est tout à fait possible de partager votre scène à vos collègue pour une lecture seule. Il vous suffit simplement de changer les **droits d'accès** de votre scène en y ajoutant le nom d'utilisateur de la personne souhaité, comme [montré dans ce point](#administrer-sa-scène).

La scène s'affichera alors dans la liste de cet utilisateur.


## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="annotation">Créer des annotations</a>.


* [Revenir en haut de la page](#prise-en-main-decorpus)