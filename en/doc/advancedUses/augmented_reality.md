---
title: Augmented Reality
rank: 10
---

## Augmented Reality



<img  src="/assets/img/doc/AR_nu_fardeau.jpg" title="3D model through Augmented Reality" class="fluid" alt="3D model through Augmented Reality">

The **Augmented Reality** (AR) feature allows for the overlay of a digital object into a real-world environment.

The augmented reality module works by transmitting a compatible 3D model to the mobile browser.

The operating systems **iOS** and **Android** require specific implementations, which are described below.

### Summay

* [iPhone (iOS)](#iphone-ios)
    * [SVX Update](#svx-update)
    * [SVX Loading](#loading-the-svx)
    * [Generate the USDZ](#generate-the-usdz)
    * [Import the USDZ](#import-the-usdz)
* [Smartphone (Android)](#smartphone-android)
    * [SVX Update](#svx-update-1)
    * [SVX Loading](#loading-of-the-svx)
    * [Generate the GLB](#generate-the-glb)
    * [Import the GLB](#import-the-glb)

### iPhone (iOs)

This module uses Apple's [ARKit](https://developer.apple.com/augmented-reality/arkit/) for iOS and 3D models in the USDZ format.

#### SVX Update

**Requirements :** 

- be familiar with the data structure of eCorpus scenes, which is inherited from the [SVX document format of the Voyager scene](https://smithsonian.github.io/dpo-voyager/document/overview/). 
- know how to use the eCorpus [API](../hosting/api) to modify the scene files.


**Add the AR model to the SVX**

Get the SVX of the scene from the interface or [from the API](../hosting/api).


Edit the derivative section to add a new element with the following information:
- usage : iOSApp3D
- quality : AR

The result should be close to this: 

```json
{"SVX...": {"SVX..."},

    "derivatives":[
       {
           "existing derivatives":"...",
        },

       {"usage":"iOSApp3D",
        "quality":"AR",
       "assets":[
           {"uri":"${FILENAME}.usdz",
           "type":"Model",
           "Type":"model/vnd.usdz+zip"}
           ]
        }

    ],
"SVX...": {"SVX..."},
}
```

#### Loading the SVX

Replace the existing SVX using the API.

```bash
curl -L -XPUT  -u "${USERNAME}:${PASSWORD}"  -H "Content-Type: application/json" --data-binary @scene.svx.json https://${HOSTNAME}/scenes/${NAME}/scene.svx.json
```

#### Generate the USDZ

**Using Blender**, export in USD* and save the scene under the name ${FILENAME}.usdz

Quality recommendations :

- Polycount : 200k
- Texture 4k 

**Using a Mac**, use [Reality Converter](https://developer.apple.com/augmented-reality/tools/) to export a 3D fil into a usdz file.

#### Import the USDZ

Import the model with the API.

```bash
curl -L -XPUT -u "${USERNAME}:${PASSWORD}" --data-binary @${FILENAME}.usdz https://${HOSTNAME}/scenes/${NAME}/${FILENAME}.usdz
```

The scene will now offer an AR option for iOS devices with access to ARKit.

<img  src="/assets/img/doc/AR.jpg" title="AR option enabled on mobile" class="fluid" alt="AR option enabled on mobile">


### Smartphone (Android)

This module uses Android features and 3D models in the glTF format (.GLB).

#### SVX Update

**Requirements :**

- be familiar with the data structure of eCorpus scenes, which is inherited from the [SVX document format of the Voyager scene](https://smithsonian.github.io/dpo-voyager/document/overview/). 
- know how to use the eCorpus [API](../hosting/api) to modify the scene files.

**Add the AR model to the SVX**

Get the SVX of the scene from the interface or [from the API](../hosting/api).


Edit the derivative section to add a new element with the following information:
- usage : App3D
- quality : AR

The result should be close to this: 

```json
{"SVX...": {"SVX..."},

    "derivatives":[
       {
           "existing derivatives":"...",
        },

       {"usage":"App3D",
        "quality":"AR",
       "assets":[
           {"uri":"${FILENAME}.glb",
           "type":"Model",
           "Type":"model/vnd.glb+zip"}
           ]
        }

    ],
"SVX...": {"SVX..."},
}
```

It is also possible to drag and drop a .GLB model into an existing eCorpus scene and select the "AR" derivative.

This operation will add a derivative in the SVX in this form:

```json
{"SVX...": {"SVX..."},

    "derivatives":[
       {
           "existing derivatives":"...",
        },

       {"usage":"Web3D",
        "quality":"AR",
       "assets":[
           {"uri":"${FILENAME}.glb",
           "type":"Model",
           "Type":"model/vnd.glb+zip"}
           ]
        }

    ],
"SVX...": {"SVX..."},
}
```

#### Loading of the SVX

Replace the existing SVX using the API.

```bash
curl -L -XPUT  -u "${USERNAME}:${PASSWORD}"  -H "Content-Type: application/json" --data-binary @scene.svx.json https://${HOSTNAME}/scenes/${NAME}/scene.svx.json
```

#### Generate the GLB

**Using Blender**, export in glTF and save the scene under the name ${FILENAME}.glb

Quality recommendation :

- Polycount : 200k
- Texture 4k 

#### Import the GLB

Import the GLB using the API.

```bash
curl -L -XPUT -u "${USERNAME}:${PASSWORD}" --data-binary @${FILENAME}.usdz https://${HOSTNAME}/scenes/${NAME}/${FILENAME}.usdz
```

The scene will now offer an AR option for Android mobiles with a compatible browser.

<img  src="/assets/img/doc/AR.jpg" title="AR option enabled on mobile" class="fluid" alt="AR option enabled on mobile">