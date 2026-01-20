---
title:  Gestion des utilisateurs
description: Gérez vos utilisateurs
rank: 6
---

# Gestion des utilisateurs

Lors que vous êtes connecté en tant qu'administrateur, un onglet **administration** apparait dans la barre de navigation. Si celui-ci est absent, demander à un autre administrateur de vérifier que votre rôle est bien "administrateur".

L'outil de gestion des utilisateurs est diponible dans l'onglet 
  <span>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960" width=40><path d="m667 936-10-66q-17-5-34.5-14.5T593 834l-55 12-25-42 47-44q-2-9-2-25t2-25l-47-44 25-42 55 12q12-12 29.5-21.5T657 600l10-66h54l10 66q17 5 34.5 14.5T795 636l55-12 25 42-47 44q2 9 2 25t-2 25l47 44-25 42-55-12q-12 12-29.5 21.5T731 870l-10 66h-54ZM80 892v-94q0-35 17.5-63t50.5-43q72-32 133.5-46T400 632h23q-21 51-19 134.5T438 892H80Zm614-77q36 0 58-22t22-58q0-36-22-58t-58-22q-36 0-58 22t-22 58q0 36 22 58t58 22ZM400 571q-66 0-108-42t-42-108q0-66 42-108t108-42q66 0 108 42t42 108q0 66-42 108t-108 42Z"></path></svg>Utilisateurs</span> de l'interface d'administration. Il permet de créer, modifier et supprimer des utilisateurs.


- Pour **ajouter des nouveaux utilisateurs**, utiliser le bouton "Créer" en haut à droite. 

- Pour **générer un lien de connexion rapide**, cliquer sur l'icône  <svg width="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960"><path d="M280 640.614q-26.846 0-45.73-18.884-18.884-18.884-18.884-45.73 0-26.846 18.884-45.73 18.884-18.884 45.73-18.884 26.846 0 45.73 18.884 18.884 18.884 18.884 45.73 0 26.846-18.884 45.73-18.884 18.884-45.73 18.884Zm0 155.385q-91.538 0-155.768-64.231-64.23-64.23-64.23-155.768t64.23-155.768q64.23-64.231 155.768-64.231 64.307 0 116.307 33.193 52 33.192 79.384 86.807h360.078L935.767 576 781.923 729.075l-74.23-55.769-76.154 56.538-78.076-53.845h-77.772q-27.384 53.23-79.384 86.615T280 795.999ZM280 736q57.539 0 99.654-34.769 42.115-34.77 54.961-85.231h137.694l57.615 39.846 78.154-57.153L776 650.615 850.616 576l-40-40H434.615q-12.846-50.461-54.961-85.231Q337.539 416 280 416q-66 0-113 47t-47 113q0 66 47 113t113 47Z"></path></svg> présente à droite de chaque utilisateur. Le lien de connexion rapide pour cet utilisateur est copié dans le presse-papier.

- Pour **modifier le rôle** d'un utilisateur, utiliser le menu déroulant de la ligne correspondante. Voir les [tableaux récapitulatifs](#tableaux-récapitulatifs) ci-dessous pour le détail des permissions accordées en fonction des rôles (utilisateur, créateur, éditeur, administrateur).

- Pour **supprimer des utilisateurs**, utiliser le bouton <svg xmlns="http://www.w3.org/2000/svg" width="24" viewBox="0 0 448 512"><path d="M192 188v216c0 6.627-5.373 12-12 12h-24c-6.627 0-12-5.373-12-12V188c0-6.627 5.373-12 12-12h24c6.627 0 12 5.373 12 12zm100-12h-24c-6.627 0-12 5.373-12 12v216c0 6.627 5.373 12 12 12h24c6.627 0 12-5.373 12-12V188c0-6.627-5.373-12-12-12zm132-96c13.255 0 24 10.745 24 24v12c0 6.627-5.373 12-12 12h-20v336c0 26.51-21.49 48-48 48H80c-26.51 0-48-21.49-48-48V128H12c-6.627 0-12-5.373-12-12v-12c0-13.255 10.745-24 24-24h74.411l34.018-56.696A48 48 0 0 1 173.589 0h100.823a48 48 0 0 1 41.16 23.304L349.589 80H424zm-269.611 0h139.223L276.16 50.913A6 6 0 0 0 271.015 48h-94.028a6 6 0 0 0-5.145 2.913L154.389 80zM368 128H80v330a6 6 0 0 0 6 6h276a6 6 0 0 0 6-6V128z"></path></svg> de la ligne correspondante. 

<img src="/assets/img/doc/UserManagement_fr.jpg" width ="900" alt="illustration interface gestion des utilisateur" />

## Les droits des utilisateurs en fonction de leur rôle

### Droits sur une scène
Pour un utilisateur connecté, les droits sur une scène peuvent être du moins élévé au plus élevé:
- aucun
- lecture
- écriture
- administration

Les droits effectifs correspondent au niveau le plus élevé parmi :
* les droits d’accès par défaut (pour un utilisateur connecté) de la scène,
* les droits individuels définis sur la scène,
* les droits de groupe définis sur la scène, si l’utilisateur est membre d'un groupe.
  
Aller voir la page de scène et la documentation sur les [permissions](../tutorials/import#administrer-sa-scène) pour modifier ces droits.

### Tableaux récapitulatifs
#### Permissions sur les scènes

| **Rôle de l'utilisateur :** 	               | Anonyme 	| Utilisateur 	| Créateur 	| Éditeur 	| Administrateur 	|
|------------------------------------------|:-------:	|:-----------:	|:------:	 |:--------: | :-------------: |
| Voir la page de la scène / Visualiser dans Voyager / Télécharger une scène 	| Selon l’accès public de la scène 	| Selon les droits **lecture** de la scène 	| Selon les droits **lecture** de la scène 	| Selon les droits **lecture** de la scène 	| ✅ 	 	|
| Voir les droits de la scène 	| ❌ 	| Selon les droits **lecture** de la scène 	| Selon les droits **lecture** de la scène 	| Selon les droits **lecture** de la scène 	| ✅ 		|
| Modifier dans Voyager 	| ❌ 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| ✅ 		|
| Ajouter et supprimer des tags 	| ❌ 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| ✅ 		|
| Téléverser des fichiers dans une scène existante	| ❌ 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| Selon les droits **écriture** de la scène 	| ✅ 	|
| Renommer une scène 	| ❌ 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| ✅ 		|
| Accéder à l’historique et restaurer une version 	| ❌ 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| ✅ 	|
| Modifier les droits d’accès de la scène 	| ❌ 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| ✅ 		|
| Archiver une scène 	| ❌ 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| Selon les droits **administration** de la scène 	| ✅ 	|
| Restaurer / Supprimer une scène archivée 	| ❌ 	| ❌ 	| ❌ 	| ❌ 	| ✅ 	|
| Créer une scène 	| ❌ 	| Non 	| ✅ 	| ✅ 	| ✅ 	|
| Téléverser des fichiers dans une nouvelle scène	| ❌ 	| Non 	| ✅ 	| ✅ 	| ✅ 	|
| Voir la page de collection d'un tag(*)	| Filtrées  selon les accès public 	| Filtrées selon les droits de **lecture** des scènes	| Filtrées selon les droits de **lecture** des scènes	| Filtrées selon les droits de **lecture** des scènes	| ✅ |

(*) Les collections sont visibles si au moins une de leurs scènes est visible.

#### Permissions sur les utilisateurs et les groupes                    


| **Rôle de l'utilisateur :**                                                            	| Anonyme 	| Utilisateur 	| Créateur  	| Éditeur 	| Administrateur                          	|
|-------------------------------------------------------------------------------------	|:--------: |:------------: | :-------: | :--------:	|:----------------------------------------:	|
| Lister les utilisateurs                                                             	| ❌       	| ❌           	| ❌         	| ✅       	| ✅                                       	|
| Créer / Modifier / Supprimer / Générer des liens de connexion pour les utilisateurs 	| ❌       	| ❌           	| ❌         	| ❌       	| ✅* (restrictions sur son propre compte) 	|
| Voir un groupe                                                                      	| ❌       	| Si membre du groupe	| Si membre du groupe 	| ✅       	| ✅                                       	|
| Lister / Créer / Ajouter et supprimer des membres dans les groupes                  	| ❌       	| ❌           	| ❌         	| ✅       	| ✅                                       	|
| Supprimer des groupes                                                               	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|
| Accéder aux statistiques et à la configuration                                      	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|
| Envoyer des e-mails de test / e-mails de connexion                                  	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|