---
title: Optimiser des modèles
---

## Préparer des modèles pour Voyager / eCorpus

DPO-Voyager fonctionne principalement avec le format [glTF](https://registry.khronos.org/glTF/), spécialement créé pour une diffusion web.

La librairie utilisée, [THREE.GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) supporte la majorité des extensions courantes.

**Note**: il n'est pas toujours nécessaire d'optimiser les modèles à outrance. Gardez à l'esprit que l'optimisation est toujours une question de compromis. 

### Outils logiciels

Les optimisations "basiques" de ce guide sont accessibles via la plupart des exporteurs glTF récents. Nous recommandons le plugin [Blender glTF](https://github.com/KhronosGroup/glTF-Blender-IO), très bien maintenu et mis à jour régulièrement; qui dispose d'une interface graphique facile à utiliser.

Pour des cas [plus avancés](#compression-maximale), des outils comme [gltfpack](https://meshoptimizer.org/gltf/) ou [gltf-transform](https://gltf-transform.dev/) peuvent être nécessaires.

### Niveaux de qualité

#### Scènes à un seul modèles

Seuls deux niveaux de qualité seront généralement utiles :

 - **Thumb**: Taille de fichier `< 1Mo`, textures généralement `256x256`
 - **High**: Textures `4096x4096` ou plus. jusqu'à 500k faces.

#### Scènes multi-modèles

Il peut être utile de générer des qualités intermédiaires pour tirer parti des nouvelles fonctionnalités de niveau de détail dynamique:

 - **Thumb**: Taille de fichier `< 1Mo`, textures généralement `256x256`
 - **Low**: Textures `1024x1024`, `~100k` faces
 - **Medium**: Textures `2048x2048`, `~150k` faces
 - **High**: Textures `4096x4096` ou plus. jusqu'à `500k` faces.

Il est toujours possible de fournir un modèle en qualité `Highest`.

Gardez à l'esprit que ces tailles sont indicatives et doivent être adaptées aux besoins de chaque projet.

### Considérations

#### Performance

En optimisant un modèle, on s'intérese autant au poids du fichier qu'aux ressources qu'il consommera pour être affiché dans la scène 3D.

C'est la raison pour laquelle il vaut mieux diminuer la taille des textures autant que possible avant d'en optimiser la compression : Une fois en mémoire, une image de `4096x4096` pixels occupera à elle seule une part non négligeable de la mémoire graphique d'un téléphone.


### Compression

#### Compression légère

Donne des modèles plus lourds, mais plus faciles à exporter et réutiliser dans d'autres outils.

Correspond généralement aux options par défaut d'outils comme **Scaniverse**.

 - Format d'image: **JPEG** (qualité 85 à 95)
 - Compression du mesh: **Aucune**


#### Compression moyenne

Modèles plus légers, bien adaptés à une diffusion web, mais toujours faciles à paramétrer.


 - Format d'image: **WEBP** (qualité 85 à 95)
 - Compression du mesh: **DRACO** 

#### Compression maximale

Ce type de technique n'est accessible qu'avec des outils "de pointe", comme  [gltfpack](https://meshoptimizer.org/gltf/) ou [gltf-transform](https://gltf-transform.dev/).

 - Format d'image: **UASTC** (Occlusion/Roughness/Metalness) + **ETC1S** (Diffuse, Emissive)
 - Compression du mesh: **MESHOPT** ou  **DRACO**

##### Meshopt

L'algorithme [Meshoptimizer](https://github.com/zeux/meshoptimizer) est optimisé pour un envoi web (avec `Content-Encoding: deflate`) et un décodage plus rapide.

##### KTX2

Le format [KTX](https://www.khronos.org/ktx/), développé par KhronosGroup regroupe des algorithmes de compression d'image compatibles avec les GPU. Il permet de transférer en VRAM les fichiers encore compressés.

Les algorithmes les plus utilisés sont **UASTC** et **ETC1S**, qui donnent des fichiers généralement plus gros que **WEBP**, mais qui réduisent drasstiquement l'empreinte en *GPU Memory* de la scène et le temps de transfert de ces textures, permettant un chargement plus fluide.

Ces deux caractéristiques sont cruciales dans le cas de scènes multi-modèles où le chargement doit se faire en temps réel sans bloquer l'utilisateur.

La complexité de ces formats ; leurs nombreuses options de configuration ; la difficulté à trouvver des outils les supportant ; les compromis auxquels ils obligent, les réserve encore pour le moment aux cas d'optimisation les plus extrêmes où tous les gains de performance plus faciles d'accès ont été explorés.

### Conclusion

Le bon traitement d'un modèle est affaire de compromis. Il n'existe pas de _meilleure_ solution adaptée à toutes les situations. Il faut d'abord se demander _pour qui_ on optimise le modèle, _pour quoi_ il sera utilisé et _comment_ il sera consommé.
