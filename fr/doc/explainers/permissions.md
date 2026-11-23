---
title: Confidentialité des scènes
description: Droits d'accès, visibilité publique ou privée et groupes d'utilisateurs
rank: 1
---

# Confidentialité des scènes

Une scène eCorpus n'est pas forcément visible par tout le monde. Selon les réglages que vous choisissez, elle peut être ouverte à tous les visiteurs, réservée aux personnes qui possèdent un compte sur la base, ou au contraire invisible sauf pour les quelques personnes que vous autorisez nommément.

Ce guide répond à trois questions, dans cet ordre :

* **Qui peut ouvrir la scène ?** C'est la question de la visibilité : publique, réservée aux utilisateurs connectés, ou privée.
* **Qui peut la modifier ?** C'est la question des droits : lecture, écriture, administration.
* **Comment autoriser une personne en particulier ?** En ajoutant son compte directement sur la scène, ou en passant par un groupe d'utilisateurs.

Les réglages décrits ici sont accessibles à toute personne qui dispose du droit **administration** sur la scène. La création des groupes et la gestion des comptes dépendent, elles, du rôle que vous avez sur l'instance eCorpus (voir la [gestion des utilisateurs](../advancedUses/userAdministration.html)).

### Sommaire

* [Régler la confidentialité d'une scène](#régler-la-confidentialité-dune-scène)
* [Les trois niveaux de visibilité](#les-trois-niveaux-de-visibilité)
* [Les quatre niveaux de droits des utilisateurs](#les-quatre-niveaux-de-droits-des-utilisateurs)
* [Donner un accès à un utilisateur précis](#donner-un-accès-à-un-utilisateur-précis)
* [Utiliser les groupes](#utiliser-les-groupes)
* [Le droit effectif est le plus élevé](#le-droit-effectif-est-le-plus-élevé)
* [Erreurs et questions fréquentes](#erreurs-et-questions-fréquentes)

## Régler la confidentialité d'une scène

Les réglages se trouvent dans la page **Paramètres** de la scène.

<img src="/assets/img/doc/Confidentialite_01.png" width="100%" alt="Page de paramètres d'une scène, section Droits d'accès" />

1. Ouvrez la scène depuis la liste de vos scènes.
2. Cliquez sur **Paramètres** dans la barre d'outils de la scène, ou sur son nom. L'adresse de la page se termine par `/settings`.
3. Cherchez la section **Droits d'accès** : c'est le tableau reproduit ci-dessous.

<img src="/assets/img/doc/Confidentialite_02.png" width="100%" alt="Tableau des droits d'accès : accès public, accès par défaut, groupes, utilisateurs" />

Le tableau se lit de haut en bas :

* deux lignes de réglages généraux, **Accès public** et **Accès par défaut** ;
* les **groupes** qui disposent d'un droit spécifique sur cette scène, avec le formulaire **Ajouter un groupe** ;
* les **utilisateurs** qui disposent d'un droit spécifique sur cette scène, avec le formulaire **Ajouter un utilisateur**.

Si vous n'avez que le droit *lecture* ou *écriture* sur la scène, la section s'affiche en lecture seule : les valeurs sont visibles, mais sans sélecteurs. C'est normal, il faut le droit *administration* pour modifier les droits.

Deux de ces réglages dépendent l'un de l'autre : l'**accès par défaut** ne peut pas être plus restrictif que l'**accès public**. Si l'accès public est sur *lecture*, l'option *aucun* est grisée pour l'accès par défaut ; et si l'accès par défaut est sur *aucun*, c'est l'option *lecture* qui est grisée pour l'accès public. Dans ce cas, modifiez d'abord la ligne qui bloque, puis revenez à l'autre.

## Les trois niveaux de visibilité

| Visibilité | Accès public | Accès par défaut | Qui peut ouvrir la scène ? |
|---|---|---|---|
| **Publique** | lecture | aucun, lecture ou écriture | tout le monde, sans compte |
| **Utilisateurs connectés** | aucun | lecture ou écriture | toute personne connectée à la base |
| **Privée** | aucun | aucun | seulement les droits spécifiques (utilisateurs et groupes) |

### Une scène publique

L'**accès public** est réglé sur **lecture**.

La scène s'ouvre pour n'importe qui, sans compte et sans connexion.

C'est le réglage à utiliser quand la scène est prête à être diffusée, par exemple dans une collection accessible depuis la page d'accueil.

La scène peut alors également être intégrée sur une page web via le protocole [oEmbed](../tutorials/embed.html) ou réutilisée par une application tierce via ses [API](../hosting/api.html).

L'accès public ne peut jamais aller au-delà de la lecture : on ne peut pas autoriser des visiteurs anonymes à modifier une scène.

<img src="/assets/img/doc/Confidentialite_03.png" width="450" alt="Badge Publique et cadenas ouvert sur une scène accessible à tous" />

Le badge **Publique** indique que l'accès public est ouvert : la scène est visible sans compte. Le cadenas **ouvert** indique que les personnes connectées peuvent au moins la consulter.

### Une scène réservée aux utilisateurs connectés

L'**accès public** est réglé sur **aucun** et l'**accès par défaut** sur **lecture** (ou **écriture**).

Un visiteur non connecté ne voit rien : le lien mène à une erreur 404. En revanche, toute personne qui possède un compte sur la base eCorpus et qui se connecte peut voir la scène si elle le souhaite.

C'est le réglage adapté aux bases internes, aux projets d'enseignement où tous les étudiants ont un compte, ou aux scènes que l'on veut montrer à toute une institution sans les publier sur internet. Attention : « tous les comptes » veut dire tous, y compris des comptes créés pour d'autres projets sur la même base.

C'est aussi le bon choix quand un serveur est dédié à une équipe et qu'il n'y a pas de problème de confidentialité entre les collaborateurs.

<img src="/assets/img/doc/Confidentialite_04.png" width="450" alt="Badge Privée et cadenas ouvert sur une scène réservée aux utilisateurs connectés" />

Ici le badge **Privée** signifie que l'accès public est fermé : un visiteur non connecté ne voit rien. Le cadenas reste **ouvert** car les personnes connectées, elles, peuvent consulter la scène. C'est le cas « réservé aux utilisateurs connectés ».

### Une scène privée

L'**accès public** est réglé sur **aucun** et l'**accès par défaut** sur **aucun**.

Personne ne peut voir la scène, sauf les utilisateurs et les groupes auxquels vous avez accordé un droit spécifique.

C'est le réglage adapté pour une scène en cours de préparation, et le seul qui garantisse qu'une scène reste invisible tant que vous n'en avez pas décidé autrement, même pour les autres usagers du serveur.


<img src="/assets/img/doc/Confidentialite_05.png" width="450" alt="Badge Privée et cadenas fermé sur une scène entièrement privée" />

Le cadenas **fermé** indique que même les personnes connectées n'ont aucun droit par défaut : seuls les droits spécifiques ouvrent la scène. C'est le cas réellement privé.

En résumé : le badge parle de l'accès **sans compte**, le cadenas parle de l'accès **avec un compte**.

## Les quatre niveaux de droits des utilisateurs

Les droits accordés à un utilisateur ou à un groupe vont du plus faible au plus fort :

| Droit | Visualiser la scène | Modifier son contenu | Gérer les droits, les tags et l'historique |
|---|:---:|:---:|:---:|
| **aucun** | non | non | non |
| **lecture** | oui | non | non |
| **écriture** | oui | oui | non |
| **administration** | oui | oui | oui |

Quelques précisions utiles :

* **lecture** donne accès à la page de la scène, au visualiseur Voyager, aux articles, aux annotations, aux visites guidées et au téléchargement de la scène.
* **écriture** ajoute tout ce qui touche au contenu : modifier les modèles, les annotations, les articles, les visites, ajouter ou retirer des tags, téléverser des fichiers.
* **administration** ajoute la gestion de la scène elle-même : renommer, archiver, consulter et restaurer l'historique, et surtout modifier les droits d'accès. Une personne qui a l'administration sur une scène peut donc ouvrir cette scène à d'autres, ou l'en fermer.

Le détail complet, droit par droit et rôle par rôle, se trouve dans les [tableaux récapitulatifs](../advancedUses/userAdministration.html#tableaux-récapitulatifs) de la page de gestion des utilisateurs.

Les mêmes droits se déclinent différemment selon le réglage :

| Réglage | Valeurs possibles | À quoi cela s'applique |
|---|---|---|
| **Accès public** | aucun, lecture | les visiteurs sans compte |
| **Accès par défaut** | aucun, lecture, écriture | toutes les personnes connectées à la base |
| **Droit d'un utilisateur** | aucun, lecture, écriture, administration | un compte nommément désigné |
| **Droit d'un groupe** | aucun, lecture, écriture, administration | tous les membres du groupe |


Deux asymétries à retenir :

* l'**accès public** ne propose que *aucun* et *lecture* : un visiteur anonyme ne peut jamais écrire ;
* l'**accès par défaut** ne propose pas *administration* : ouvrir la gestion des droits à tous les comptes de la base serait dangereux ; cette responsabilité se donne donc uniquement à des personnes ou à des groupes identifiés.

## Donner un accès à un utilisateur précis

Ajouter un droit spécifique sert à deux choses : **ouvrir** une scène privée à quelqu'un, ou **élever** ses droits au-delà du droit par défaut (par exemple donner l'écriture à une seule personne dans une base où tout le monde est en lecture).

### Ajouter un utilisateur

1. Dans la section **Droits d'accès**, descendez jusqu'au formulaire **Ajouter un utilisateur**.
2. Saisissez le **nom d'utilisateur** de la personne dans le champ prévu.
3. Choisissez le droit à lui accorder dans le menu déroulant voisin : **lecture**, **écriture** ou **administration**.
4. Cliquez sur le bouton **+**.

### Changer ou retirer un droit individuel

Pour chaque utilisateur listé, le menu déroulant de sa ligne permet de changer le droit : *lecture*, *écriture* ou *administration*. La modification s'applique tout de suite.

Pour retirer complètement un droit spécifique, choisissez **retirer l'accès spécifique** dans ce même menu.

## Utiliser les groupes

### Pourquoi passer par un groupe

Le groupe permet d'attribuer un droit une seule fois à un ensemble de comptes, puis de faire évoluer la composition de cet ensemble sans revenir sur chaque scène.

Un groupe associe donc deux choses : des **membres** (des comptes) et des **scènes**, avec un niveau d'accès commun.

### Créer un groupe

<img src="/assets/img/doc/Confidentialite_06.png" width="100%" alt="Gestion des groupes dans l'interface d'administration" />

1. Ouvrez **Administration**, puis **Groupes**.
2. Saisissez le nom du nouveau groupe dans le champ en haut à droite, à côté du bouton **+**.
3. Cliquez sur **+**.

Pour supprimer un groupe, utilisez la corbeille de sa ligne. La suppression retire le groupe et ses droits sur les scènes.

### Ajouter des membres au groupe

<img src="/assets/img/doc/Confidentialite_07.png" width="100%" alt="Page d'un groupe : membres et scènes autorisées" />

1. Cliquez sur le nom du groupe dans la liste.
2. Dans la section **Membres du groupe**, saisissez le nom d'utilisateur dans le champ, puis cliquez sur **+**.
3. Répétez pour chaque personne. La corbeille d'une ligne retire le membre du groupe.

### Attacher des scènes au groupe

Toujours sur la page du groupe, la section **Droits d'accès** liste les scènes auxquelles le groupe est attaché, avec le droit correspondant.

1. Saisissez le nom de la scène dans le champ prévu à cet effet, puis choisissez le droit (*lecture*, *écriture* ou *administration*).
2. Validez : la scène est ajoutée à la liste.
3. Pour modifier le droit d'une scène déjà listée, utilisez le menu déroulant de sa ligne.
4. Pour détacher une scène, choisissez **retirer l'accès spécifique**.

Tous les membres du groupe obtiennent alors ce droit sur la scène, sans aucune action de leur part.

### Rattacher un groupe depuis la scène

L'opération inverse existe :

1. Ouvrez les **Paramètres** de la scène, section **Droits d'accès**.
2. Dans le formulaire **Ajouter un groupe**, saisissez le nom du groupe existant et choisissez le droit.
3. Cliquez sur **+**.

Le groupe apparaît alors dans le tableau des groupes de la scène. Le groupe doit déjà exister : si le nom saisi ne correspond à aucun groupe, l'ajout échoue. Il n'y a pas de création de groupe à la volée depuis cet écran.

Les deux chemins écrivent exactement la même information : attacher une scène depuis la page du groupe, ou attacher un groupe depuis la page de la scène, revient au même.

## Le droit effectif est le plus élevé

Un même utilisateur peut cumuler plusieurs sources de droits sur une même scène :

* l'**accès public**, s'il consulte la scène sans être connecté ;
* l'**accès par défaut**, parce qu'il possède un compte ;
* les droits des **groupes** dont il est membre ;
* un éventuel **droit individuel**.

C'est donc **le droit le plus élevé** qui est retenu, quel que soit le nombre de sources.

## Erreurs et questions fréquentes

**La scène renvoie une erreur 404 alors qu'elle existe.** La scène existe probablement, mais le visiteur n'a aucun droit dessus : eCorpus ne distingue pas une scène interdite d'une scène absente. Vérifiez l'accès public, l'accès par défaut, et l'éventuel droit individuel ou de groupe de la personne.

**J'ai ajouté un utilisateur, mais le bouton + ne fait rien.** Le nom d'utilisateur est probablement refusé, parce qu'il ne correspond à aucun compte, ou parce qu'il n'est pas orthographié comme dans la base (les majuscules et les accents ne comptent pas). Vérifiez dans **Administration** puis **Utilisateurs**.

**L'option lecture est grisée dans l'accès public.** L'accès par défaut est sur *aucun*. Passez-le d'abord sur *lecture*, puis revenez à l'accès public.

**L'option aucun est grisée dans l'accès par défaut.** L'accès public est sur *lecture*. Repassez d'abord l'accès public sur *aucun*.

**J'ai donné l'administration à quelqu'un, peut-il me retirer mes droits ?** Oui : l'administration d'une scène inclut la gestion des droits de cette scène, y compris les vôtres. Ne confiez ce niveau qu'à des personnes de confiance, et gardez au moins un administrateur actif sur chaque scène importante.

**Je ne vois pas la section Droits d'accès, ou elle est en lecture seule.** Vous n'avez pas le droit *administration* sur la scène. Un administrateur de la scène doit vous l'accorder.

**Une scène privée apparaît-elle dans les collections et la recherche ?** Non, pas pour les visiteurs qui n'y ont pas accès. Les collections et les résultats de recherche sont filtrés selon les droits de la personne qui consulte : une scène privée n'apparaît que pour ceux qui peuvent l'ouvrir.

**Supprimer un utilisateur lui fait-il perdre ses droits ?** Oui, ses droits individuels et son appartenance aux groupes disparaissent avec le compte. En revanche, supprimer un membre d'un groupe ne supprime pas son compte, et supprimer un groupe ne supprime pas les comptes de ses membres.
