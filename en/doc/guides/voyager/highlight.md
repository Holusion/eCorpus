---
title: Highlighting a zone
---

## Highlighting a zone

Highlighting an area of interest is an experimental feature provided by DPO-Voyager.

> Caution: This feature is experimental and may not work properly in certain situations. In addition, it requires manual steps via the command line.

### Prerequisites

- A 3D scene with a model, correctly configured on your eCorpus instance.
 - A texture corresponding to the *UV mapping* of your model, in PNG format (alpha channel required).

For the example, we'll use this very simple model of [cube](/assets/fixtures/cube.glb) and this [texture](/assets/fixtures/highlight.png){:target="_blank"}.

We'll use `cube` as the scene name and `ecorpus.holusion.com` as the instance name throughout this tutorial. Replace it with the name of your scene.

### Steps

In your terminal, type the following command:
```bash
curl -XGET -L -o scene.svx.json https://ecorpus.holusion.com/scenes/cube/scene.svx.json
```

Edit the resulting file to add the following properties to the `models[0]` section:

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
Send the modified scene with :

```bash
curl -L -XPUT -u "<username>:<password>" -H "Content-Type: application/json" --data-binary @scene.svx.json http://ecorpus.holusion.com/scenes/cube/scene.svx.json
```

Remember to also send the `highlight.png` texture in the `images` folder of your scene:

```bash
curl -L -XMKCOL -u "<username>:<password>" http://ecorpus.holusion.com/scenes/cube/images
curl -L -XPUT -u "<username>:<password>" -H "Content-Type: image/png" --data-binary @highlight.png http://ecorpus.holusion.com/scenes/cube/images/highlight.png
```


### Use in a guided tour

Once again, edit the `scene.svx.json` file by hand.

Activate the **models** property tracking in tour editor. Next, edit the model's **overlayMap** property to give it the value **0** or **1**, depending on the steps.