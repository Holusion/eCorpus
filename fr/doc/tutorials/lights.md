---
title: Éclairage de scène
rank: 10
---

# Éclairage

Une scène Voyager est fournie avec un éclairage environnemental par défaut. Les lumières existantes et leurs ombres peuvent être modifiées, et d’autres sources lumineuses peuvent être ajoutées.

### Sommaire

- [Éclairage](#éclairage)
    - [Sommaire](#sommaire)
  - [Éclairage de scène par défaut](#éclairage-de-scène-par-défaut)
  - [Modification des lumières existantes](#modification-des-lumières-existantes)
    - [Modification de la lumière d’environnement](#modification-de-la-lumière-denvironnement)
    - [Ombres avec les lumières par défaut « Shadow caster »](#ombres-avec-les-lumières-par-défaut--shadow-caster-)
  - [Sources lumineuses personnalisées](#sources-lumineuses-personnalisées)
    - [Avertissement](#avertissement)
    - [Ajouter une lumière](#ajouter-une-lumière)
    - [Types de lumières](#types-de-lumières)

## Éclairage de scène par défaut

Par défaut, une scène Voyager inclut une lumière d’environnement qui simule l’éclairage d’un studio photo. Deux lumières directionnelles nommées « Shadow casters », initialement désactivées, sont également configurées afin de projeter facilement des ombres sur un sol.

Les sources lumineuses existantes sont visibles dans le panneau *Navigator* (en haut à gauche) :
<div class="center">
<img src="/assets/img/doc/Lights_01.jpg" width ="400" alt="illustration Navigator lights" />
</div>

## Modification des lumières existantes

Il existe deux méthodes pour modifier les lumières :

- L’outil [Éclairage](../advancedUses/tools.html#loutil-eclairage), disponible dans la barre d’outils de la scène. Il permet de régler l’intensité et les couleurs (le cas échéant) de l’ensemble des lumières.
- Les paramètres de chaque lumière, qui permettent de configurer l’ensemble des propriétés, y compris la position et les paramètres d’ombres lorsqu’ils sont disponibles.

Pour modifier les paramètres d’une lumière, cliquez sur la tâche *Paramètres* dans la barre de navigation, puis sélectionnez la source lumineuse à éditer dans le panneau *Navigator* à gauche.  
Sous le panneau *Navigator*, l’onglet *Task* affiche alors l’ensemble des paramètres disponibles pour la lumière sélectionnée : position, couleur, intensité et paramètres d’ombres.

### Modification de la lumière d’environnement

La lumière d’environnement ne possède qu’un seul paramètre : son intensité (*intensity*). Il n’est pas possible de la faire pivoter, ni d’en modifier la couleur. Elle ne peut pas projeter d’ombres.  
En revanche, elle est fortement influencée par la map d’environnement. Il est actuellement possible de choisir entre trois map d’environnement via l’outil [Environment](../advancedUses/tools.html#loutil-environnement) ou en modifiant le paramètre de scène **MapIndex** (`Environment > Environment > MapIndex`). La map d'environment peut être pivotée via les paramètres de scène (`Environment > Environment > Rotation`) 

Si vous ne souhaitez pas utiliser cette lumière, vous pouvez la désactiver via la tâche *Settings* en positionnant le paramètre "Enabled" sur *off*.

### Ombres avec les lumières par défaut « Shadow caster »

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_03.jpg" width ="700" alt="statue sans ombres" />
<img src="/assets/img/doc/Lights_02.jpg" width ="700" alt="statue avec ombres" />
</div>

La scène Voyager par défaut inclut deux lumières « Shadow caster ». Ces lumières sont configurées pour contribuer très faiblement à l’intensité lumineuse globale, tout en projetant des ombres visibles (voir les [lumières directionnelles (*directional*)](#directional-light) pour plus de détails).

Pour les utiliser :

- Activez une ou deux lumières **Shadow Caster** via la tâche *Settings*. Sélectionnez la lumière dans le panneau *Navigator*, puis activez le paramètre "Enabled" (`Directional Light > Light > Enabled`).
- Activez le sol via les paramètres de scène (`Floor > Object > Visible`) ou à l’aide de l’outil [Environment](../advancedUses/tools.html#loutil-environnement). Sans sol, aucune surface ne peut recevoir les ombres.
- Activez "ReceiveShadow" sur le modèle. Pour projeter des ombres sur le modèle lui-même, sélectionnez-le dans le panneau Navigator et activez "ReceiveShadow" (`Model > Model > ReceiveShadow`).

**Remarque**  
Par défaut, les lumières suivent les mouvements de la caméra. Ainsi, si vous faites tourner la caméra autour de l’objet, les ombres resteront toujours du même côté par rapport à votre point de vue. Ce comportement peut être modifié dans les paramètres de scène `Orbit Navigation > LightsFollowCam`.

## Sources lumineuses personnalisées

### Avertissement

Soyez prudent lors de la modification de l’éclairage dans des scènes contenant déjà des visites guidées et des annotations. Si les lumières font partie des propriétés suivies dans la configuration des [snapshots de visite guidées](../advancedUses/animatedtours.html#aborder-les-paramètres-de-visites-guidées), l’ajout ou la suppression de lumières peut corrompre la scène et empêcher toute sauvegarde ultérieure.  
Idéalement, l’éclairage doit être défini avant l’ajout d’annotations et de tours.  
Si une source lumineuse n’est plus nécessaire, il est recommandé de la **désactiver** (paramètre **Enabled** sur *off*) plutôt que de la supprimer.

### Ajouter une lumière

Pour ajouter une lumière, utiliser le bouton "+" à droite de "Lights" dans le panneau *Navigator* (en haut à gauche) :

<div class="center">
<img src="/assets/img/doc/Lights_add_light.png" width ="400" alt="illustration Navigator lights" />
</div>

Sélectionnez ensuite le type de lumière approprié dans le menu déroulant et entrez un nom pour cette source lumineuse. Cliquer sur "Create Light".

### Types de lumières

Six types de lumières peuvent être ajoutés. Chacun est détaillé ci-dessous avec une illustration utilisant une seule source lumineuse.  
Ces sources lumineuses n’utilisent pas la carte d’environnement, ce qui explique pourquoi les parties métalliques de la statue utilisée en exemple apparaissent très sombres. Pour un rendu optimal, elles doivent être utilisées avec la lumière d’environnement.

La plupart des types de lumières sont influencés par leur position. Pour déplacer une source lumineuse, utilisez les paramètres de position et de rotation de sa matrice de transformation.

**Remarque**  
Par défaut, les lumières suivent les mouvements de la caméra. Par exemple, une lumière secondaire orientée à gauche éclairera toujours la gauche de l’Explorer, que vous observiez l’objet de face ou de dos. Ce comportement peut être modifié dans `Scene Settings > Orbit Navigation > LightsFollowCam`.

|   | Type de lumière | Exemple | Ombres |
|:--:|:-------------------------------|:------------------|:-------:|
|<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg>  | [Lumière Ambiante (*ambient*)](#ambient-light) | — | ❌ |
| <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style=";stroke-width:50;stroke-linecap:round;stroke-linejoin:round" d="M.588 9.16h14.84c.212 0 .384.172.384.385v1.124a.384.384 0 0 1-.385.385H.588a.384.384 0 0 1-.384-.385V9.545c0-.213.171-.385.384-.385zM8 .145c-.499-.003-.998.142-1 .439V3h2V.59C8.998.297 8.499.147 8 .145zm4.734 1.82a.274.274 0 0 0-.199.074l-1.71 1.707 1.411 1.416 1.707-1.701c.36-.364-.663-1.497-1.209-1.496zm-9.464.012C2.725 1.974 1.68 3.09 2.045 3.46l1.707 1.71L5.168 3.76 3.467 2.053a.272.272 0 0 0-.197-.076zM8 5a2.997 2.997 0 0 0-2.988 2.785h5.976A2.997 2.997 0 0 0 8 5zM.586 6.986c-.253.002-.4.375-.438.8h2.846l.002-.796zm12.418.006v.793h2.848c-.034-.419-.177-.786-.432-.789z"/></svg>| [Lumière hémisphérique (hemisphere)](#hemisphere-light)             | Sky and ground        |       ❌    |  
<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style="stroke:none" d="m10.824 3.745 1.711-1.705c.425-.416 1.82 1.005 1.408 1.42l-1.707 1.702zm2.18 3.247 2.416.004c.595.006.576 1.997-.008 2l-2.41-.004zm-.765 3.833 1.704 1.711c.416.425-1.005 1.82-1.42 1.408l-1.701-1.708zM8.997 13l-.004 2.416c-.006.594-1.997.576-2-.01l.004-2.41zm-3.825-.758-1.72 1.697c-.426.414-1.814-1.013-1.4-1.427l1.715-1.693zM2.992 8.99.578 8.986c-.594-.006-.576-1.997.009-2l2.41.004zm.76-3.818L2.045 3.46c-.416-.424 1.005-1.819 1.42-1.408L5.168 3.76zM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM7 3V.584C7.005-.01 8.996.004 9 .59V3z"/></svg>| [Lumière directionnelle (*directional*)](#directional-light) | Soleil | ✅ |
| <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M301.87 108.727c0 52.94 43.06 96 96 96 8.84 0 16-7.16 16-16s-7.16-16-16-16c-35.3 0-64-28.72-64-64 0-8.84-7.16-16-16-16s-16 7.16-16 16zM478.636 144.265a15.898 15.898 0 0 0 4.356-8.146l8.718-43.38a16.008 16.008 0 0 0-4.37-14.468l-55.755-55.755a15.982 15.982 0 0 0-14.467-4.37l-43.381 8.718a16.084 16.084 0 0 0-8.146 4.356l-30.568 30.498L448.13 174.826zM30.3 216.774c-7.856 4.045-10.956 13.686-6.912 21.55l7.32 14.232c4.044 7.855 13.695 10.956 21.55 6.911l207.354-102.82c-5.12-15.272-4.739-35.452-3.706-49.874zM257.42 455.585c-3.858 7.948-.554 17.522 7.4 21.388l14.393 6.994c7.949 3.858 17.53.549 21.388-7.4l108.397-220.653c-14.872 2.094-34.317 1.858-49.625-2.162zM119.554 363.004c-6.162 6.331-6.037 16.458.298 22.63l11.464 11.165c6.331 6.162 16.468 6.034 22.63-.297L309.885 230.5c-11.419-7.558-22.03-17.993-30.532-31.249z"/></svg>| [Spot lumineux (*spot*)](#spot-light) | Projecteur | ✅ |
|<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M44.73 323.21c-7.65 4.42-10.28 14.2-5.86 21.86l8 13.86c4.42 7.65 14.21 10.28 21.86 5.86l93.26-53.84a207.865 207.865 0 0 1-26.83-39.93l-90.43 52.19zM112.46 168H16c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h100.21a210.423 210.423 0 0 1-3.75-48zm127.6 291.17c0 3.15.93 6.22 2.68 8.84l24.51 36.84c2.97 4.46 7.97 7.14 13.32 7.14h78.85c5.36 0 10.36-2.68 13.32-7.14l24.51-36.84c1.74-2.62 2.67-5.7 2.68-8.84l.05-43.18H240.02l.04 43.18zM44.73 60.78l78.98 45.6c5.37-15.29 12.97-29.48 21.64-42.93L68.73 19.21c-7.65-4.42-17.44-1.8-21.86 5.86l-8 13.86c-4.42 7.65-1.79 17.44 5.86 21.85zm550.54 0c7.65-4.42 10.28-14.2 5.86-21.86l-8-13.86c-4.42-7.65-14.21-10.28-21.86-5.86l-76.61 44.23c8.68 13.41 15.76 27.9 21.2 43.19l79.41-45.84zm0 262.43l-90.97-52.52c-7.33 14.23-15.8 27.88-26.36 40.21l93.33 53.88c7.65 4.42 17.44 1.8 21.86-5.86l8-13.86c4.42-7.64 1.79-17.43-5.86-21.85zM624 168h-96.41c.1 2.68.41 5.3.41 8 0 13.54-1.55 26.89-4.12 40H624c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16zM320 80c-52.94 0-96 43.06-96 96 0 8.84 7.16 16 16 16s16-7.16 16-16c0-35.3 28.72-64 64-64 8.84 0 16-7.16 16-16s-7.16-16-16-16zm0-80C217.72 0 144 82.97 144 176c0 44.37 16.45 84.85 43.56 115.78 16.64 18.99 42.74 58.8 52.42 92.16v.06h48v-.12c-.01-4.77-.72-9.51-2.15-14.07-5.59-17.81-22.82-64.77-62.17-109.67-20.53-23.43-31.52-53.14-31.61-84.14-.2-73.64 59.67-128 127.95-128 70.58 0 128 57.42 128 128 0 30.97-11.24 60.85-31.65 84.14-39.11 44.61-56.42 91.47-62.1 109.46a47.507 47.507 0 0 0-2.22 14.3v.1h48v-.05c9.68-33.37 35.78-73.18 52.42-92.16C479.55 260.85 496 220.37 496 176 496 78.8 417.2 0 320 0z"/></svg>| [Lumière ponctuelle (*point*)](#point-light) | Ampoule | ✅ |
|<svg viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg"><path style="stroke-linecap:round;-inkscape-stroke:none" d="M351.053 207.98a25 25 0 0 0-12.014 4.811l-7.65 5.729a25 25 0 0 0-5.028 34.996 25 25 0 0 0 34.996 5.027l7.65-5.729a25 25 0 0 0 5.028-34.996 25 25 0 0 0-22.982-9.838zm-58.348 43.956a25 25 0 0 0-11.848 5.203L45.99 445.346a25 25 0 0 0-3.877 35.14 25 25 0 0 0 35.143 3.877l234.867-188.207a25 25 0 0 0 3.875-35.142 25 25 0 0 0-23.293-9.078zM131.023 68.966c-7.535 0-12.006 1.996-17.07 6.53-5.064 4.535-11.212 17.475-6.45 28.72a25.003 25.003 0 0 0 .017.036l114 267.99a25.003 25.003 0 0 0 .048.115c.146.338.588 2.384 3.852 6.344 3.264 3.96 12.068 9.254 19.603 9.254h335.891c7.51 0 12.01-1.991 17.082-6.539 5.073-4.548 11.19-17.488 6.438-28.709a25.003 25.003 0 0 0-.014-.037l-114-267.99a25.003 25.003 0 0 0-.018-.04c-.155-.363-.602-2.438-3.883-6.42-3.28-3.98-12.096-9.253-19.605-9.253H131.025zM444.428 104.3l.677 1.59c-.513-.992-.653-1.531-.677-1.59zm-276.313 14.668h282.553l93.154 218.988H261.27zm98.705 232.037c.48.923.597 1.378.623 1.467z"/></svg>| [Lumière rectangulaire (*rectangle*)](#rectangle-light) | Fenêtres | ❌ |

<h4 id="ambient-light">
<svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg> Lumière ambiante (<span style="font-style: italic;">ambient</span>)</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_Ambient.png" width ="300" alt="illustration lumière ambiante" />
</div>

Cette lumière éclaire uniformément l’ensemble des objets de la scène. Elle ne peut pas projeter d’ombres, car elle ne possède pas de direction.

**Paramètres** :
- **Color** : couleur de la lumière  
- **Intensity** : intensité de la lumière

<h4 id="hemisphere-light">
<svg width=1em viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style=";stroke-width:50;stroke-linecap:round;stroke-linejoin:round" d="M.588 9.16h14.84c.212 0 .384.172.384.385v1.124a.384.384 0 0 1-.385.385H.588a.384.384 0 0 1-.384-.385V9.545c0-.213.171-.385.384-.385zM8 .145c-.499-.003-.998.142-1 .439V3h2V.59C8.998.297 8.499.147 8 .145zm4.734 1.82a.274.274 0 0 0-.199.074l-1.71 1.707 1.411 1.416 1.707-1.701c.36-.364-.663-1.497-1.209-1.496zm-9.464.012C2.725 1.974 1.68 3.09 2.045 3.46l1.707 1.71L5.168 3.76 3.467 2.053a.272.272 0 0 0-.197-.076zM8 5a2.997 2.997 0 0 0-2.988 2.785h5.976A2.997 2.997 0 0 0 8 5zM.586 6.986c-.253.002-.4.375-.438.8h2.846l.002-.796zm12.418.006v.793h2.848c-.034-.419-.177-.786-.432-.789z"/></svg>
Lumière hémisphérique (<span style="font-style: italic;">hemisphere</span>)</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_Hemisphere.png" width ="300" alt="illustration lumière hémisphérique" />
</div>

Source lumineuse positionnée au-dessus de la scène, avec une couleur dégradée entre la couleur du ciel et celle du sol. Cette lumière ne projette pas d’ombres.

**Paramètres** :
- **skyColor** : couleur de la lumière provenant du haut de la scène  
- **groundColor** : couleur de la lumière provenant du bas de la scène  
- **intensity** : intensité de la lumière

<h4 id="directional-light">
<svg width=1em viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style="stroke:none" d="m10.824 3.745 1.711-1.705c.425-.416 1.82 1.005 1.408 1.42l-1.707 1.702zm2.18 3.247 2.416.004c.595.006.576 1.997-.008 2l-2.41-.004zm-.765 3.833 1.704 1.711c.416.425-1.005 1.82-1.42 1.408l-1.701-1.708zM8.997 13l-.004 2.416c-.006.594-1.997.576-2-.01l.004-2.41zm-3.825-.758-1.72 1.697c-.426.414-1.814-1.013-1.4-1.427l1.715-1.693zM2.992 8.99.578 8.986c-.594-.006-.576-1.997.009-2l2.41.004zm.76-3.818L2.045 3.46c-.416-.424 1.005-1.819 1.42-1.408L5.168 3.76zM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM7 3V.584C7.005-.01 8.996.004 9 .59V3z"/></svg>
Lumière directionnelle (<span style="font-style: italic;">directional</span>)
</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_directional.png" width ="300" alt="illustration lumière directionnelle" />
</div>

Lumière émise dans une direction spécifique. Elle se comporte comme si elle était située à une distance infinie : tous les rayons lumineux sont parallèles. Ce type de lumière est couramment utilisé pour simuler la lumière du jour, le soleil étant suffisamment éloigné pour être considéré comme infini. Cette lumière peut projeter des ombres. Elle est équivalente à la lumière "Sun" de Blender.

Avec des réglages spécifiques, ce type de lumière est utilisé pour les "Shadow casters" par défaut : une intensité lumineuse très faible (0,01) afin de ne pas ajouter de lumière à l’éclairage d’environnement, et une intensité d’ombre très élevée (50 ou 60) pour conserver des ombres visibles.

**Paramètres** :
- **Color** : couleur de la lumière  
- **Intensity** : intensité de la lumière  
- **Shadow Settings** :
  - **Resolution** : niveau de détail des ombres  
  - **Blur** : Flou. un blur plus élevé produit des ombres plus douces, aux contours diffus.
  - **Intensity** : intensité des ombres

<h4 id="spot-light"> <svg width=1em viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M301.87 108.727c0 52.94 43.06 96 96 96 8.84 0 16-7.16 16-16s-7.16-16-16-16c-35.3 0-64-28.72-64-64 0-8.84-7.16-16-16-16s-16 7.16-16 16zM478.636 144.265a15.898 15.898 0 0 0 4.356-8.146l8.718-43.38a16.008 16.008 0 0 0-4.37-14.468l-55.755-55.755a15.982 15.982 0 0 0-14.467-4.37l-43.381 8.718a16.084 16.084 0 0 0-8.146 4.356l-30.568 30.498L448.13 174.826zM30.3 216.774c-7.856 4.045-10.956 13.686-6.912 21.55l7.32 14.232c4.044 7.855 13.695 10.956 21.55 6.911l207.354-102.82c-5.12-15.272-4.739-35.452-3.706-49.874zM257.42 455.585c-3.858 7.948-.554 17.522 7.4 21.388l14.393 6.994c7.949 3.858 17.53.549 21.388-7.4l108.397-220.653c-14.872 2.094-34.317 1.858-49.625-2.162zM119.554 363.004c-6.162 6.331-6.037 16.458.298 22.63l11.464 11.165c6.331 6.162 16.468 6.034 22.63-.297L309.885 230.5c-11.419-7.558-22.03-17.993-30.532-31.249z"/></svg> Spot lumineux (<span style="font-style: italic;">spot</span>)</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_spotlightl.png" width ="300" alt="illustration projecteur" />
</div>

Cette lumière est émise depuis un point unique dans une direction donnée, selon un cône qui s’élargit avec la distance. Elle peut projeter des ombres.

**Paramètres** :
- **Color** : couleur de la lumière  
- **Intensity** : intensité de la lumière  
- **Distance** : portée maximale de la lumière (0 = infinie)  
- **Angle** : angle de diffusion du projecteur. Plus l’angle est élevé, plus le faisceau est large  
- **Penumbra** : Pénombre. pourcentage du cône affecté par la pénombre (intervalle [0,1])  
- **Decay** : atténuation de la lumière en fonction de la distance  
- **Shadow Settings** :
  - **Resolution** : niveau de détail des ombres  
  - **Blur** : Flou. un blur plus élevé produit des ombres plus douces, aux contours diffus.
  - **Intensity** : intensité des ombres

<h4 id="point-light">
<svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M44.73 323.21c-7.65 4.42-10.28 14.2-5.86 21.86l8 13.86c4.42 7.65 14.21 10.28 21.86 5.86l93.26-53.84a207.865 207.865 0 0 1-26.83-39.93l-90.43 52.19zM112.46 168H16c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h100.21a210.423 210.423 0 0 1-3.75-48zm127.6 291.17c0 3.15.93 6.22 2.68 8.84l24.51 36.84c2.97 4.46 7.97 7.14 13.32 7.14h78.85c5.36 0 10.36-2.68 13.32-7.14l24.51-36.84c1.74-2.62 2.67-5.7 2.68-8.84l.05-43.18H240.02l.04 43.18zM44.73 60.78l78.98 45.6c5.37-15.29 12.97-29.48 21.64-42.93L68.73 19.21c-7.65-4.42-17.44-1.8-21.86 5.86l-8 13.86c-4.42 7.65-1.79 17.44 5.86 21.85zm550.54 0c7.65-4.42 10.28-14.2 5.86-21.86l-8-13.86c-4.42-7.65-14.21-10.28-21.86-5.86l-76.61 44.23c8.68 13.41 15.76 27.9 21.2 43.19l79.41-45.84zm0 262.43l-90.97-52.52c-7.33 14.23-15.8 27.88-26.36 40.21l93.33 53.88c7.65 4.42 17.44 1.8 21.86-5.86l8-13.86c4.42-7.64 1.79-17.43-5.86-21.85zM624 168h-96.41c.1 2.68.41 5.3.41 8 0 13.54-1.55 26.89-4.12 40H624c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16zM320 80c-52.94 0-96 43.06-96 96 0 8.84 7.16 16 16 16s16-7.16 16-16c0-35.3 28.72-64 64-64 8.84 0 16-7.16 16-16s-7.16-16-16-16zm0-80C217.72 0 144 82.97 144 176c0 44.37 16.45 84.85 43.56 115.78 16.64 18.99 42.74 58.8 52.42 92.16v.06h48v-.12c-.01-4.77-.72-9.51-2.15-14.07-5.59-17.81-22.82-64.77-62.17-109.67-20.53-23.43-31.52-53.14-31.61-84.14-.2-73.64 59.67-128 127.95-128 70.58 0 128 57.42 128 128 0 30.97-11.24 60.85-31.65 84.14-39.11 44.61-56.42 91.47-62.1 109.46a47.507 47.507 0 0 0-2.22 14.3v.1h48v-.05c9.68-33.37 35.78-73.18 52.42-92.16C479.55 260.85 496 220.37 496 176 496 78.8 417.2 0 320 0z"/></svg> Lumière ponctuelle (<span style="font-style: italic;">point</span>)</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_pointlight.png" width ="300" alt="illustration lumière ponctuelle" />
</div>

Lumière émise depuis un point unique dans toutes les directions. Elle est couramment utilisée pour reproduire la lumière d’une ampoule nue. Elle peut projeter des ombres.

**Paramètres** :
- **Color** : couleur de la lumière  
- **Intensity** : intensité de la lumière  
- **Distance** : portée maximale de la lumière (0 = infinie)  
- **Decay** : atténuation de la lumière en fonction de la distance  
- **Shadow Settings** :
  - **Resolution** : niveau de détail des ombres  
  - **Blur** : Flou. un blur plus élevé produit des ombres plus douces, aux contours diffus.
  - **Intensity** : intensité des ombres

<h4 id="rectangle-light">
<svg width=1em viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg"><path style="stroke-linecap:round;-inkscape-stroke:none" d="M351.053 207.98a25 25 0 0 0-12.014 4.811l-7.65 5.729a25 25 0 0 0-5.028 34.996 25 25 0 0 0 34.996 5.027l7.65-5.729a25 25 0 0 0 5.028-34.996 25 25 0 0 0-22.982-9.838zm-58.348 43.956a25 25 0 0 0-11.848 5.203L45.99 445.346a25 25 0 0 0-3.877 35.14 25 25 0 0 0 35.143 3.877l234.867-188.207a25 25 0 0 0 3.875-35.142 25 25 0 0 0-23.293-9.078zM131.023 68.966c-7.535 0-12.006 1.996-17.07 6.53-5.064 4.535-11.212 17.475-6.45 28.72a25.003 25.003 0 0 0 .017.036l114 267.99a25.003 25.003 0 0 0 .048.115c.146.338.588 2.384 3.852 6.344 3.264 3.96 12.068 9.254 19.603 9.254h335.891c7.51 0 12.01-1.991 17.082-6.539 5.073-4.548 11.19-17.488 6.438-28.709a25.003 25.003 0 0 0-.014-.037l-114-267.99a25.003 25.003 0 0 0-.018-.04c-.155-.363-.602-2.438-3.883-6.42-3.28-3.98-12.096-9.253-19.605-9.253H131.025zM444.428 104.3l.677 1.59c-.513-.992-.653-1.531-.677-1.59zm-276.313 14.668h282.553l93.154 218.988H261.27zm98.705 232.037c.48.923.597 1.378.623 1.467z"/></svg> Lumière rectangulaire (<span style="font-style: italic;">rectangle</span>)</h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_rect.png" width ="300" alt="illustration lumière rectangulaire" />
</div>

Cette classe de lumière émet de manière uniforme depuis la surface d’un plan rectangulaire. Elle permet de simuler des sources telles que des fenêtres ou des bandes lumineuse. Elle est équivalente à une "Area Light" dans Blender.

**Paramètres** :
- **Color** : couleur de la lumière  
- **Intensity** : intensité de la lumière  

La taille du rectangle peut être modifiée à l’aide des paramètres d’échelle (*scale*) de la transformation. **Ne définissez jamais une échelle à 0.**

* [Retour en haut de la page](#éclairage)
