---
title: Les modèles 3D
---

## Principes de base 

L'éditeur fonctionne principalement avec le format [gltf](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html). Plus particulièrement la variante `gltf-binary` décrite [ici](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification).

Des modèles au format [USD](https://openusd.org/release/intro.html) (`.usdz`) peuvent être fournis pour activer la réalité augmentée sur les appareils iOS mais ils ne peuvent pas être intégrés à la scène web3D pour le moment.

## Exporter pour eCorpus

[Blender](https://www.blender.org/) est le logiciel idéal pour convertir des fichiers de la plupart des formats 3D (**OBJ**, ***FBX**, etc...) vers glTF car il dispose d'un plugin officiel maintenu par le consortium Khronos, responsable du format glTF.

<div class="row">
  <div class="col-12 col-lg-6">
    <h3>Menu d'export</h3>
    <p>Le plugin glTF est installé par défaut avec blender. Assurez-vous d'utiliser une version récente de Blender, de préférence 4.0 ou supérieure.</p>
    <p> Cliquez sur <b>File > Export > glTF 2.0</b> pour ouvrir la fenêtre d'export</p>
    <p>Vous pouvez choisir de n'exporter que la sélection courante ou toute la scène.</p>
  </div>
  <div class="col-12 col-lg-6 d-flex flex-column">
    <figure>
      <img class="img-fluid" alt="capture d'écran du menu d'import-export de blender" src="/assets/img/doc/blender_export_gltf.webp"/>
      <figcaption class="px-4">le menu d'export de Blender</figcaption>
    </figure>
  </div>
</div>

<h3>Options d'export</h3>
<div class="row">
  <div class="col-12 col-sm-6 col-xl-4">
    <figure>
      <img class="img-fluid" alt="capture d'écran des options d'export au format glTF dans blender" src="/assets/img/doc/blender_export_gltf_options.webp"/>
      <figcaption class="px-4">les options d'export</figcaption>
    </figure>
  </div>
  <div class="col-12 col-sm-6 col-xl-8">
    <p>Retrouvez la documentation complète du plugin sur <a href="https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html">doc.blender.org</a>.</p>
    <ul>
      <li>Le format <b>Binary</b> (<code>.glb</code>) est à privilégier.</li>
      <li>Il est aussi possible de choisir entre <b>Z up</b> et <b>Y up</b> dans le menu <b>Transform</b> pour l'orientation des axes de la scène.</li>
      <li>Pensez à activer la compression, qui permet de réduire la taille du fichier de sortie: cela accélèrera les temps de chargement : Sur certains modèles, la taille compressée peut être jusqu'à deux fois plus petite que la taille originale.</li>
      <li>Il n'est généralement pas utile de modifier les paramètres de compression.</li>
    </ul>
  </div>
</div>

## Aller plus loin

### Niveaux de détail

L'application peut enregistrer plusieurs niveaux de détail pour un objet et tenter d'en afficher le plus pertinent. Les niveaux supportés sont :

    Thumb
    Low
    Medium
    High
    Highest

La selection se fait en fonction de la capacité `maxTextureSize` du moteur de rendu 

 > Voir la doc : [WebGLRenderer.capabilities.maxTextureSize](https://threejs.org/docs/?q=webGLRenderer#api/en/renderers/WebGLRenderer.capabilities)

En fonction de cette valeur, la qualité idéale sera:

 - si inférieur à 2048 : **Low**
 - si inférieur à 4096 : **Medium**
 - sinon               : **High**

Il est conseillé de fournir des textures de taille correspondante ou inférieure avec les modèles. 

### Shaders

En pratique, les modèles sont affublés d'un `MeshStandardMaterial`. Les bénéfices et limites en sont décrites dans la [documentation THREEJS](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial).

