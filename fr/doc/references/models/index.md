---
title: Les modèles 3D
---

## Les modèles 3D : principes de base

L'éditeur fonctionne principalement avec le format [gltf](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html){:target="_blank"}. Plus particulièrement la variante `gltf-binary` décrite [ici](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification){:target="_blank"}.

Des modèles au format [USD](https://openusd.org/release/intro.html){:target="_blank"} (`.usdz`) peuvent être fournis pour activer la réalité augmentée sur les appareils iOS mais ils ne peuvent pas être intégrés à la scène web3D pour le moment.

## Exporter pour eCorpus

[Blender](https://www.blender.org/){:target="_blank"} est le logiciel idéal pour convertir des fichiers de la plupart des formats 3D (**OBJ**, ***FBX**, etc...) vers glTF car il dispose d'un plugin officiel maintenu par le consortium Khronos, responsable du format glTF.

<div>
    <h3>Menu d'export</h3>
    <p>Le plugin glTF est installé par défaut avec blender. Assurez-vous d'utiliser une version récente de Blender, de préférence 4.0 ou supérieure.</p>
    <p> Cliquez sur <b>File > Export > glTF 2.0</b> pour ouvrir la fenêtre d'export</p>
    <p>Vous pouvez choisir de n'exporter que la sélection courante ou toute la scène.</p>
    <figure>
      <img alt="capture d'écran du menu d'import-export de blender" src="/assets/img/doc/blender_export_gltf.webp"/>
      <figcaption>Le menu d'export de Blender</figcaption>
    </figure>
</div>

<h3>Options d'export</h3>
<div>
    <figure>
      <img alt="capture d'écran des options d'export au format glTF dans blender" src="/assets/img/doc/blender_export_gltf_options.webp"/>
      <figcaption>Les options d'export</figcaption>
    </figure>
    <p>Retrouvez la documentation complète du plugin sur <a href="https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html" target="_blank">doc.blender.org</a>.</p>
      <p>Le format <b>Binary</b> (<code>.glb</code>) est à privilégier.</p>
      <p>Il est aussi possible de choisir entre <b>Z up</b> et <b>Y up</b> dans le menu <b>Transform</b> pour l'orientation des axes de la scène.</p>
      <p>Pensez à activer la compression, qui permet de réduire la taille du fichier de sortie: cela accélèrera les temps de chargement : Sur certains modèles, la taille compressée peut être jusqu'à deux fois plus petite que la taille originale.</p>
      <p>Il n'est généralement pas utile de modifier les paramètres de compression.</p>
</div>

## Aller plus loin

### Niveaux de détail

L'application peut enregistrer plusieurs niveaux de détail pour un objet et tenter d'en afficher le plus pertinent. Les niveaux supportés sont :

    Thumb (textures 512x512)
    Low (textures 1024x2024)
    Medium (textures 2048x2048)
    High (textures 4096x4096)
    Highest 


Voir <a href="/fr/doc/guides/optimizing_models">le guide d'optimisatio</a> pour plus de détails.
Il est conseillé de fournir des textures de taille correspondante ou inférieure avec les modèles. 

### Shaders

En pratique, les modèles sont affublés d'un `MeshStandardMaterial`. Les bénéfices et limites en sont décrites dans la [documentation THREEJS](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial){:target="_blank"}.

