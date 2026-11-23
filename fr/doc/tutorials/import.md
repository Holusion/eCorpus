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

Pour **charger un modèle 3D** sur votre compte eCorpus, rendez-vous sur la page d'accueil de votre base de données. Le logo affiché en haut à gauche de la page y ramène à tout moment.

<img src="/assets/img/doc/SceneCreation_01.png" width="800" alt="page d'accueil d'une base eCorpus" />

Dans la barre de navigation, cliquez sur "**créer**". La page de téléversement s'ouvre : elle sert à créer une nouvelle scène comme à mettre à jour une scène existante.

<img src="/assets/img/doc/SceneCreation_06.png" width="100%" alt="page de téléversement d'une scène" />

Déposez vos fichiers dans la zone prévue, ou cliquez dans cette zone pour parcourir vos documents. Il reste ensuite à renseigner trois éléments :

* le **nom de la scène**. Ce nom apparaît dans l'URL de la scène : évitez les caractères spéciaux ;
* la **langue par défaut** de la scène ;
* l'option "**Optimiser les modèles**", à laisser activée pour les fichiers volumineux. La conversion s'exécute alors en tâche d'arrière-plan et la scène se charge plus vite dans les visualisateurs.

Cliquez enfin sur "**créer une scène**" pour lancer l'import du modèle.

* Les formats **.glb** et **.gltf** sont utilisés par l'éditeur eCorpus, ainsi que **.obj** accompagné de ses matériaux (.mtl et textures associées). Pour apprendre à exporter un modèle en .glb, reportez-vous à [Préparer son modèle 3D](../advancedUses/models/model.html).
* Si vous êtes administrateur de la base de données, vous pouvez aussi déposer une **archive .zip** contenant une ou plusieurs scènes eCorpus complètes (modèles, articles, annotations, vignettes). Le bouton "**extraire**" reconstruit alors les scènes telles qu'elles ont été exportées. Pour obtenir une telle archive, reportez-vous à [Télécharger la scène](#télécharger-la-scène).

### Découvrir les options de gestion de scène

Après avoir chargé votre modèle 3D, vous pouvez préparer vos collaborateurs d'édition, la langue de votre projet, la licence et les informations clés comme l'auteur, le site où l'œuvre est conservée ou la date de réalisation.

Le modèle apparaît dans "**mes scènes**" une fois l'importation terminée. Par défaut, la scène affiche une miniature représentant un cube en fil de fer, en attendant que vous en définissiez une depuis l'éditeur.

Chaque carte de scène propose deux actions.

#### Le bouton "Voir"

<img src="/assets/img/doc/SceneCreation_03.png" width="138" alt="bouton Voir sur une carte de scène" />

Il sert uniquement à **visualiser** votre scène 3D dans le visualisateur DPO-Voyager.

#### Le bouton "Editer"

<img src="/assets/img/doc/SceneCreation_04.png" width="138" alt="bouton Editer sur une carte de scène" />

Il sert à **éditer** votre scène 3D pour y changer et ajouter du contenu. Dans l'éditeur, la fenêtre du milieu, dite "Explorer", affiche le modèle importé : avec votre souris, vous pouvez changer votre vue sur l'objet. Pour en savoir plus sur les options d'édition, reportez-vous à [ce point](#les-bases-pour-bien-paramètrer-sa-scène-rapidement).

<a id="manage-scene-permissions"></a>
#### Administrer sa scène

<img src="/assets/img/doc/SceneCreation_05.png" width="319" alt="nom d'une scène dans sa carte" />

Pour administrer une scène, cliquez sur son **nom** dans la liste, ou ouvrez son "**Aperçu**". Vous arrivez sur la fiche de la scène, qui récapitule sa vignette, ses métadonnées et ses tags.

<img src="/assets/img/doc/AdminSettings_01.png" width="100%" alt="fiche d'une scène dans l'interface d'administration" />

Le menu de gauche de cette fiche donne accès à toutes les opérations : "**Aperçu**", "**Voir**", "**Editer**", "**Historique**", "**tâches**" et "**Paramètres**".

Les droits d'accès, les tags, le renommage et l'archivage se trouvent dans "**Paramètres**". La page réunit trois blocs :

* "**Droits d'accès**" : le niveau d'accès public, le niveau par défaut des utilisateurs connectés, puis les droits accordés à des groupes ou à des utilisateurs nommés ;
* "**Modifier les tags**" : les collections auxquelles la scène appartient ;
* en bas de page, "**Renommer**", "**Archiver**" et "**Télécharger la scène**".

Le détail des niveaux de visibilité, de l'accès public, de l'accès par défaut et des groupes est expliqué pas à pas dans [Confidentialité des scènes](../explainers/permissions.html).

Voyons d'abord les différents niveaux de droit que vous pouvez attribuer à un utilisateur.

* **aucun** : la scène n'est pas accessible ;
* **lecture** : l'utilisateur voit la scène dans le visualisateur, sans pouvoir la modifier ;
* **écriture** : l'utilisateur voit et édite la scène 3D ;
* **administration** : l'utilisateur voit, édite et modifie les droits d'accès de cette scène. Ce niveau n'existe que pour un utilisateur nommé.

Deux règles générales s'appliquent à toute la scène :

* "**Accès public**" concerne tous les visiteurs, y compris les personnes non identifiées. Deux valeurs seulement : "aucun" ou "lecture". Pour qu'un lien de scène soit visible par tous, réglez-le sur "**lecture**" ;
* "**Accès par défaut**" concerne tous les membres ayant un compte sur la base de données : "aucun", "lecture" ou "écriture". Il ne peut pas être plus restrictif que l'accès public.

Pour donner des droits spécifiques à une personne, écrivez son nom d'utilisateur exact, choisissez le niveau, puis cliquez sur "**+**". Le bouton "**Ajouter un groupe**" fonctionne de la même façon avec un nom de groupe.

<img src="/assets/img/doc/AdminSettings_03.png" width="100%" alt="ajout d'un utilisateur dans les droits d'accès d'une scène" />

##### Historique

L'entrée "**Historique**" affiche chaque changement effectué sur la scène depuis sa création. Si une mauvaise version a été enregistrée, survolez une étape et cliquez sur "**restaurer**" pour revenir à cet état.

<img src="/assets/img/doc/AdminSettings_02.png" width="90%" alt="historique d'édition d'une scène" />

**Attention, cliquer sur "restaurer" ne supprime pas les changements : de nouvelles entrées sont ajoutées à la date présente pour remettre la scène dans l'état où elle était à la date indiquée.**

##### Télécharger la scène

Le bouton "**Télécharger la scène**", en bas de la page "**Paramètres**", exporte la scène dans une archive .zip contenant la scène au format .json, les modèles .glb et les informations d'articles, d'annotations et de visites guidées présentes au moment du téléchargement.

Télécharger une scène eCorpus permet, par exemple :

* de récupérer les modèles de votre base de données pour un autre usage (impression 3D, édition du modèle, etc.) ;
* de copier votre scène sur une autre base de données eCorpus, en déposant l'archive sur la page de téléversement.

##### Ajouter sa scène dans une collection précise

Il est possible de créer et de gérer des collections de scènes eCorpus grâce aux **tags**.

Dans la page "**Paramètres**", le bloc "**Modifier les tags**" liste les tags actuels, et le champ "**Ajouter un tag**" permet d'en créer un nouveau.

<img src="/assets/img/doc/AdminSettings_04.png" width="90%" alt="modification des tags d'une scène" />

* Pour rattacher la scène à **une collection existante**, commencez à saisir son nom : les tags déjà utilisés sont proposés au fur et à mesure ;
* Pour créer **une collection qui n'existe pas encore**, saisissez son nom en entier puis cliquez sur "**+**" : le tag est créé et associé immédiatement à la scène.

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

**Attention : pour que la scène soit visible par le public non identifié, réglez "Accès public" sur "lecture" dans les "Paramètres" de la scène.**

#### Permettre l'affichage de la scène sur une page Web

Cette solution permet l'affichage d'une scène eCorpus dans une page Web. Chaque scène eCoprus possède une icône de **Partage**, situé à gauche de l'Explorer, permettant la copie d'un code "Iframe".
[Vous trouverez ici la liste des icônes de l'Explorer](#pour-explorer-votre-scène)

Il suffit donc de récupérer de copier coller ce colle dans le code de votre page, à l'endroit souhaité.

**Attention : pour que la scène soit visible par le public non identifié, réglez "Accès public" sur "lecture" dans les "Paramètres" de la scène.**

#### Partager la scène à ses collègues vient les droits d'administration

Si vos collègues possèdent un compte sur votre base de données eCorpus, vous pouvez partager votre scène avec eux en lecture seule. Il suffit d'ajouter le nom d'utilisateur de la personne dans les **droits d'accès** de la scène, avec le niveau "lecture", comme [montré dans ce point](#administrer-sa-scène). Les groupes y remplacent avantageusement les ajouts individuels quand plusieurs personnes doivent recevoir les mêmes droits.

La scène s'affichera alors dans la liste de cet utilisateur.


## En savoir plus
Si vous souhaitez en apprendre plus sur les fonctionnalités d'eCorpus, vous pouvez vous rendre sur ce guide: <a href="annotation">Créer des annotations</a>.


* [Revenir en haut de la page](#prise-en-main-decorpus)