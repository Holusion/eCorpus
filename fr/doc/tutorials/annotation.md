---
title: Ajouter des Annotations
rank: 4
---

## Lié un vocabulaire à un visuel

Grâce à sa fonctionnalité avancée d'annotations, eCorpus vous offre la possibilité de lier un lexique précis à une partie de votre modèle 3D de **manière simple et intuitive**. Cette fonction permet un **enrichissement sémantique** simple et efficace. Il rend accessible les **thermes techniques** et autre **iconographie** à l'utilisateur, sert à **mettre en valeur les détails** peu accessibles pour un oeil non aguérri, et plus encore.


## Présentation des Annotations

<iframe src="https://pod.univ-lille.fr/video/40135-gestion-des-annotations-ecorpus/?is_iframe=true" width="800" height="450" style="padding: 0; margin: 0; border:0" allowfullscreen title="Gestion des annotations eCorpus" ></iframe>


### Sommaire

* [Créer son annotation](#créer-son-annotation)
    * [Ajouter son annotation](#ajouter-des-annotations)
    * [Paramètrer son annotation](#paramètrer-son-annotation)
* [Enrichir son annotation](#enrichir-son-annotation)
    * [Définir le style de son annotation](#style-dannotation)
    * [Ajouter un un titre et une description](#ajouter-un-titre-et-une-description)
    * [Lié un article à son annotation](#lier-un-article-à-son-annotation)
* [En Savoir Plus](#en-savoir-plus)

## Créer son annotation


### Ajouter des annotations

Gérer le moteur d'annotation, ajouter du contenu, les organiser et les animer.


eCorpus est très pratique pour **enrichir sémantiquement** sa scène 3D. Pour ce faire, voyons d'abord comment fonctionne le système d'annotation.


Si des annotation ont été ajoutées dans une scène 3D, un **icône annontation** sera visible dans le visualisateur 3D. Il vous suffit alors de cliquer sur cet icône pour faire apparaître ou disparaître les annotations.


_Notez que chaque annotation est lié a un modèle 3D. Il ne peut donc pas y avoir d'annotation "dans le vide"._


<img src="/assets/img/doc/Annotation_01.jpg" width ="800" alt="illustration annotations" /> 


Pour créer ces annotations, rendez-vous dans le **mode édition** de votre scène 3D. 

Vous pouvez apprendre comment vous y rendre en suivant le guide: [Préparation d'une scène eCorpus](import).

Une fois votre éditeur ouvert, il faut d'abord **selectionner un modèle** sur lequel vous souhaitez ajouter des annotations. Pour cela, il faut se rendre dans la fenêtre "**Navigator**" en haut à gauche, et cliquer sur le nom de l'objet à selectionner. Vous pouvez également cliquer sur le modèle souhaité directement dans l'**Explorer**.

Quand un modèle est selectionné, un encadré jaune apparait autour de lui. **Attention, cet encadré est visible sur les captures de miniature.** Pour deselectionner un objet, vous pouvez cliquer sur un endroit vide de la scène. 


Une fois le modèle selectionné, cliquer sur l'onglet "**Annotation**" en haut de la fenêtre de l'Explorer.

<img src="/assets/img/doc/Annotation_02.jpg" width ="800" alt="illustration annotations"/>

Une fenêtre s'ouvre alors en bas à gauche. Il s'agit de l'Editeur d'Annotation. Cet éditeur possède 4 boutons que nous détaillerons ci-après.

#### Select 


<img src="/assets/img/doc/Annotation_03.jpg" width ="300" alt="illustration annotations"/>


Le bouton **Select** est le bouton selectionné par défaut lorsque vous ouvrer le menu d'edition d'annotations. Ils vous permet se sélectionner des annotations depuis l'Explorer lorsque celles-ci sont visibles.

#### Move

<img src="/assets/img/doc/Annotation_04.jpg" width ="300" alt="illustration annotations"/>


Le bouton **Move** permet de **modifier l'emplacement** des annotations selectionnées.

Pour ce faire, selectionnez l'annotation voulue dans le menu déroulant, ou via l'outil Select vu un peu plus tôt. Une fois l'annotation selectionné, cliquez sur l'outil **Move** et cliquer sur l'endroit voulu pour y bouger l'annotation. Pour rappel, vous ne pouvez pas déplacer l'annotation "dans le vide". 

Dans le cas où vous souhaiteriez déplacer l'annotation sur un autre modèle, il vous faudra supprimer l'annotation directement avant de la recréer sur le modèle souhaité.

#### Create

<img src="/assets/img/doc/Annotation_05.jpg" width ="300" alt="illustration annotations"/>


Le bouton **Create** vous permet de **créer une annotation** en cliquant directement à l'endroit de son emplacement voulu sur le modèle dans l'Explorer. Si l'annotation ne s'est pas placée au bon endroit, vous pouvez modifier son emplacement via l'outil **Move**, vu précédement.


#### Delete

<img src="/assets/img/doc/Annotation_06.jpg" width ="300" alt="illustration annotations"/>

Le bouton **Delete** permet de supprimer une annotation selectionnée. Par défaut, ce bouton est grisé si le modèle selectionné est dépourvu d'annotation.


**Attention, cliquer sur ce bouton entrainera directement la supression de votre annotation, vérifiez donc bien que vous ayez selectionné le bon élément**

### Paramètrer son annotation



<img src="/assets/img/doc/Annotation_07.jpg" width ="300" alt="illustration annotations"/>


Il existe plusieurs paramètres pour modifier son annotation. Vous verrez sur l'image ci-dessus les paramètres les plus couramment utilisés en surbrillance. Nous allons les détailler ci-après.


## Enrichir son annotation


### Style d'annotation
<img src="/assets/img/doc/Annotation_08.jpg" width ="300" alt="illustration annotations" />


Le paramètre **Style** permet de changer, comme son nom l'indique, le style de l'annotation.


<img src="/assets/img/doc/Annotation_09.jpg" width ="100" alt="illustration annotations"/>


* Par défaut, le style est en **Standard**. Il correspond à une annotation dont seul le Titre est affiché.


<img src="/assets/img/doc/Annotation_10.jpg" width ="200" alt="illustration annotations"/>


* Le Style **Circle** remplace l'annotation par un rond sur lequel l'utilisateur peut cliquer pour déplier l'annotation et y lire les informations données.


<img src="/assets/img/doc/Annotation_11.jpg" width ="200" alt="illustration annotations"/>


* Le Style **Extended** est une annotation de type standard sur lequel l'utilisateur peut cliquer pour élargir l'annotation et y afficher les informations contenu dans la description de l'annotation.

### Ajouter un Titre et une Description

Le titre et la description sont la partie **la plus importante** d'une annotation. 

Pour nommer une annotation, il vous suffit de changer le texte dans le paramètre **Title**. Un titre n'est pas limité en nombre de caractère. Cependant, un titre trop long risque de sortir des cadres de l'annotation.


Pour plus d'efficacité, nous vous conseillons d'utiliser des titres courts et concis. Si besoin est de rajouter des informations, vous pouvez changer le style de l'annotation en "Extended" pour lui ajouter une courte description de 200 caractères maximum.

La description est à ajouter dans le paramètre "**Lead**". Les chiffres affichés sur le côté correspondent au nombre de mot contenus dans le Lead.


Il est tout à fait possible que les 200 caractères d'une description ne suffisent pas à décrire efficacement le partie montré. Si vous souhaitez ajouter plus de contenu dans votre annotation, veuillez-vous réferrer au point suivant: <a href="article">Créer des articles</a>.

### lier un Article à son annotation 

Si votre annotation a un style "**Extented**", il est tout à fait possible de le lier à un article sous forme d'"*en savoir plus*"

<img src="/assets/img/doc/Annotation_12.jpg" width ="300" alt="illustration annotations"/>

Pour lier votre annotation a un article, il suffit simplement de selectionner l'article voulu dans le paramètre "**Article**"

**Pensez à bien vérifier que le style de votre annotation est en "Extended"**

Pour fonctionner, vérifiez préalablement que l'article que vous voulez lier a bien été créé dans les mêmes Langues disponibles que l'annotation.

## En Savoir Plus

Si vous souhaitez apprendre à créer des articles, rendez-vous dans ce guide: <a href="article">Créer des articles</a>.

* [Revenir en haut de la page](#lié-un-vocabulaire-à-un-visuel)


