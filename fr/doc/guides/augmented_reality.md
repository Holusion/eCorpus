---
title: Réalité Augmentée
---

## Réalité augmentée



<img  src="/assets/img/doc/AR_nu_fardeau.jpg" title="Modèle 3D en Réalité Augmentée" class="fluid" alt="Modèle 3D en Réalité Augmentée">


Le module de réalité augmentée fonctionne en transmettant au navigateur mobile un modèle 3D compatible.

Dans un premier temps, seul la fonction pour **iPhone sous iOS** est implémentée.

### iPhone (iOs)

Ce module utilise l'[ARKit](https://developer.apple.com/augmented-reality/arkit/) d'Apple pour iOS et des modèles 3D au format USDZ

#### Mise à jour du SVX

**Prérequis :** 

- être familier avec la structure de données des scènes eCorpus. Celle-ci est héritée du [format de document SVX de la scène Voyager](https://smithsonian.github.io/dpo-voyager/document/overview/). 
- savoir utiliser les [API](/fr/doc/guides/import_export) de eCorpus pour modifier les fichiers de la scène.


**Ajouter le modèle AR dans le SVX**

Récupérer le SVX de la scène à partir de l'interface ou [à partir de l'API](/fr/doc/guides/import_export).


Editer la section derivative pour ajouter un nouvel élement avec les informations suivantes :
- usage : iOSApp3D
- quality : AR

Le resultat devrait s'approcher de celui-ci :  

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

#### Chargement du SVX

Remplacer le SVX existant en utilisant l'API.

```bash
curl -L -XPUT  -u "${USERNAME}:${PASSWORD}"  -H "Content-Type: application/json" --data-binary @scene.svx.json https://${HOSTNAME}/scenes/${NAME}/scene.svx.json
```

#### Générer le USDZ

**Depuis Blender**, exporter en USD* et enregistrer la scène sous le nom ${FILENAME}.usdz

Recommandation de qualité :

- Polycount : 200k
- Texture 4k 

**Depuis un Mac**, utiliser [Reality Converter](https://developer.apple.com/augmented-reality/tools/) pour transformer un fichier 3D en usdz.

#### Importer le USDZ

Importer le modèle avec l'API.

```bash
curl -L -XPUT -u "${USERNAME}:${PASSWORD}" --data-binary @${FILENAME}.usdz https://${HOSTNAME}/scenes/${NAME}/${FILENAME}.usdz
```

La scène proposera maintenant un option AR pour les mobiles iOS ayant accès à l'ARKit.

<img  src="/assets/img/doc/AR.jpg" title="Option AR activée sur mobile" class="fluid" alt="Option AR activée sur mobile">
