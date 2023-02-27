
# Voyager Story

## Editeur de scènes pour Voyager

<style>
  .btn-h{
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .btn-h > .ff-button.ff-control{
    flex: 0 1 150px;
    align-self: center;
  }
  .btn-h h2{
    flex: 1 1 auto;
  }
  h1, h3{
    color: var(--color-primary-light)
  }
  .ff-button.ff-control{
    width: 150px;
  }
  .ff-button.ff-control.ff-disabled{
    color: white !important;
  }
  .ff-button.ff-control.ff-disabled > .ff-icon{
    fill: white !important;
  }
  .inline{
    display:inline-block;
  }
  li{
    margin: 0.5rem;
    list-style: none;
  }
  li a{
    color: var(--color-light);
    text-decoration: none;
  }
  li a:hover{
    color: white;
  }
</style>

<ul>
  <li><a href="#positionneretredimensionnerlemodle"><span class="inline"><ff-button text="Pose" icon="move"></ff-button></span> Positionner et redimensionner le modèle</a></li>
  <li><a href="#capture"><span class="inline"><ff-button text="Capture" icon="camera"></ff-button></span> Prendre des captures d'écran et enregistrer l'état de la scène</a><li>
  <li><a href="#derivatives"><span class="inline"><ff-button text="Derivatives" icon="hierarchy"></ff-button></span> Gérer les dérivés (différents niveaux de détail)</a></li>
  <li><a href="#annotations"><span class="inline"><ff-button text="Annotations" icon="comment"></ff-button></span> Créer et modifier des annotations</a></li>
  <li><a href="#articles"><span class="inline"><ff-button text="Articles" icon="file"></ff-button></span> Créer et éditer des articles</a></li>
  <li><a href="#tours"><span class="inline"><ff-button text="Visites" icon="globe"></ff-button></span> Créer et modifier des visites guidées</a></li>
  <li><a href="#audio"><span class="inline"><ff-button text="Audio" icon="audio"></ff-button></span> Ajouter et organiser des audios</a></li>
  <li><a href="#settings"><span class="inline"><ff-button text="Paramètres" icon="eye"></ff-button></span> Editer les paramètres de la scène</a></li>
</ul>

## Créer une scène pas à pas

### Importer un modèle

Importez un modèle en .glb en le glissant dans la scène à partir de vos fichiers.

Selectionnez la résolution correspondante et ajoutez lui un nom.

Allez ensuite dans l'onglet _collection_ pour ajouter un titre à votre scène (initialement "Missing Title").

### Positionner et redimensionner le modèle

Allez dans l'onglet <span class="inline"><ff-button text="Pose" icon="move" disabled></ff-button></span> et selectionnez votre modèle pour ajuster sa position.

Vous pouvez alors le recenter dans la scène, puis ajuster sa position et sa rotation à l'aide des fenêtres de vue _top_, _left_ et _front_.

Pensez à vérifier l'unité de mesure de la scène, ainsi que de l'object. Vous pouvez vous servir de l'outil _mesure_ dans les outils pour vérifier la taille du modèle.

### Prendre des captures d'écran et enregistrer l'état de la scène

Une fois le modèle positionné comme voulu, allez dans l'onglet <span class="inline"><ff-button text="Capture" icon="camera" disabled></ff-button></span> pour enregistrer son positionnement et générer une image de miniature. 

Il est necessaire de capturer la scène pour enregistrer son état.

### Créer et modifier des annotations

Dans l'onglet <span class="inline"><ff-button text="Annotations" icon="comment" disabled></ff-button></span>, cliquer sur le bouton create pour créer votre annotation.

### Créer et éditer des articles

### Créer et modifier des visites guidées