---
title: Advanced scene setup
description: Learn to setup a scene in dpo-voyager
rank: 7
---


# Advanced scene setup

This tutorial will go through the main setup options of a scene in DPO-Voyager.

Everything will happen under the <span class="d-inline-flex"> {% include sv_button.html name="parameters" style="width:150px" icon="eye" %} </span> tab, with the <img style="max-height:1.5rem" src="/assets/img/doc/scene_node.jpg" title="scene node" alt="scene node in voyager's hierarchy"> node selected.

## Zoom Lock

Restrict how close the camera can zoom using the **Orbit Navigation** > **Limits** options.

Setting `OrbitNavigation.Limits.Min.Offset.Z` will prevent the camera from zooming too close.
Setting `OrbitNavigation.Limits.Max.Offset.Z` will prevent dezooming too far.

Changing `OrbitNavigation.Limits.<Min/Max>.Orbit.X` might also help for objects that have a bad texture under.


## Background

Some integrations will look better with a matched background.

Set the **Background** option to change it.

## Lights Rotation

By default, lights are following the camera rotation, giving the impression of a central object that rotates around itself. Disabling `LightFollowCam` under **Orbit Navigation** > **Navigation** makes the lights fixed.


## Interface

Most interface elements can be removed. Check out **Reader** > **Enabled** or **Viewer** > **Annotations** > **Visible** for example.



## Highlighting a zone - Experimental

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