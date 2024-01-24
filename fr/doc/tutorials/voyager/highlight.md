---
title: Mise en évidence d'une zone d'intérêt
---


La mise en surbrillance d'une zone d'interêt est une fonctionnalité expérimentale fournie par DPO-Voyager.

 > Attention: Cette fonctionnalité est expérimentale et peut ne pas fonctionner correctement dans certaines situations. De plus, elle requiert des étapes manuelles via la ligne de commande.

## Prérequis

 - Une scène 3D avec un modèle, correctement configurée sur votre instance eCorpus
 - Une texture correspondant à l'*UV mapping* de votre modèle, au format PNG (canal alpha requis).

Pour l'exemple, on utilisera ce modèle très simple de [cube](/assets/fixtures/cube.glb) et cette [texture](/assets/fixtures/highlight.png).

On utilisera `cube` comme nom de scène et `ecorpus.holusion.com` comme nom d'instance tout au long de ce tutoriel. Remplacez-le par le nom de votre scène.

## Étapes

Dans votre terminal, tapez la commande suivante :
```bash
curl -XGET -L -o scene.svx.json https://ecorpus.holusion.com/scenes/cube/scene.svx.json
```

Editez le fichier obtenu, pour ajouter dans la section `models[0]` les propriétés suivantes :

```
"overlayMap": 1,
[...]
"derivatives":[
  {
    "usage": "Web3D",
    "quality": "Highest",
    "assets": [
      {
        "uri": "models/cube.glb",
        "type": "Model",
        "byteSize": 24532,
        "numFaces": 12,
        "imageSize": 8192
      },
      {
        "uri": "images/highlight.png",
        "type": "Image",
        "mapType": "Zone"
      }
    ]
  }
]
```
Envoyez la scène modifée avec :

```bash
curl -L -XPUT -u "<username>:<password>" -H "Content-Type: application/json" --data-binary @scene.svx.json http://ecorpus.holusion.com/scenes/cube/scene.svx.json
```

Pensez à envoyer aussi la texture `highlight.png` dans le dossier `images` de votre scène:

```bash
curl -L -XMKCOL -u "<username>:<password>" http://ecorpus.holusion.com/scenes/cube/images
curl -L -XPUT -u "<username>:<password>" -H "Content-Type: image/png" --data-binary @highlight.png http://ecorpus.holusion.com/scenes/cube/images/highlight.png
```


## Utilisation dans une visite guidée

Il faut à nouveau éditer à la main le fichier `scene.svx.json`.

Il faut activer le suivi des propriétés **models** dans le tour editor. Ensuite, éditer la propriété **overlayMap** du modèle pour lui donner la valeur **0** ou **1** selon les étapes.
