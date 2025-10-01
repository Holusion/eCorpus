import { IDocument } from "./document.js";

/**
 * Copied from DPO-Voyager
 * 
 * Some default changed. 
 */
const default_doc = {
    "asset": {
        "type": "application/si-dpo-3d.document+json",
        "version": "1.0",
        "copyright": "(c) Holusion SAS, all rights reserved",
        "generator": "eCorpus"
    },
    "scene": 0,
    "scenes": [{
        "nodes": [0, 1],
        "setup": 0,
        "units": "m"
    }],
    "nodes": [{
        "name": "Camera",
        "id": "00000001",
        "translation": [0, 0, 15],
        "camera": 0
    }, {
        "name": "Lights",
        "id": "00000002",
        "children": [2, 3, 4]
    }, {
        "translation": [0, 0, 2],
        "rotation": [0.4829741, -0.1070728, 0.1880998, 0.8484633],
        "scale": [1, 1, 1],
        "name": "Shadow Caster #1",
        "id": "00000003",
        "light": 0
    }, {    
        "rotation": [0.3546969, 0.163893, -0.3861077, 0.8356136],
        "scale": [1, 1, 1],
        "name": "Shadow Caster #2",
        "id": "00000004",
        "light": 1
    },  {
        "name": "Environment",
        "id": "00000005",
        "light": 2
    }],
    "setups": [{
        "units": "m",
        "interface": {
            "visible": true,
            "logo": true,
            "menu": true,
            "tools": true
        },
        "viewer": {
            "shader": "Default",
            "toneMapping": true,
            "exposure": 1,
            "gamma": 2,
            "annotationsVisible": false
        },
        "reader": {
            "enabled": false,
            "position": "Overlay"
        },
        "navigation": {
            "type": "Orbit",
            "enabled": true,
            "autoZoom": true,
            "lightsFollowCamera": true,
            "autoRotation": false,
            "orbit": {
                "orbit": [-24, -26, 0],
                "offset": [0, 0, 150],
                "minOrbit": [-90, null, null],
                "maxOrbit": [90, null, null],
                "minOffset": [null, null, 0.1],
                "maxOffset": [null, null, 10000]
            }
        },
        "background": {
            "style": "RadialGradient",
            "color0": [ 0.2, 0.25, 0.3 ],
            "color1": [ 0.01, 0.03, 0.05 ]
        },
        "floor": {
            "visible": false,
            "position": [0, -25, 0],
            "size": 50,
            "color": [ 0.6, 0.75, 0.8 ],
            "opacity": 0.5,
            "receiveShadow": false
        },
        "grid": {
            "visible": false,
            "color": [0.5, 0.7, 0.8]
        },
        "tape": {
            "enabled": false,
            "startPosition": [0, 0, 0],
            "startDirection": [0, 0, 0],
            "endPosition": [0, 0, 0],
            "endDirection": [0, 0, 0]
        },
        "slicer": {
            "enabled": false,
            "axis": "X",
            "inverted": false,
            "position": 0.5
        }
    }],
    "cameras": [{
        "type": "perspective",
        "perspective": {
            "yfov": 52,
            "znear": 0.1,
            "zfar": 100000
        }
    }],
    "lights": [{
        "enabled": false,
        "color": [1, 0.95, 0.9],
        "intensity": 0.01,
        "type": "directional",
        "shadowEnabled": true,
        "shadowIntensity": 50
    }, {
        "enabled": false,
        "color": [0.9, 0.95, 1],
        "intensity": 0.01,
        "type": "directional",
        "shadowEnabled": true,
        "shadowIntensity": 60
    }, {
        "enabled": true,
        "intensity": 1.0,
        "type": "environment"
    }]
} as const;
/**
 * This is a workaround for JSON imports syntax changing every other day and the fact we _might_ mutate the document in place one returned
 * @returns a pristine default document that we are free to mutate or otherwise modify
 */
export default function getDefaultDocument(): IDocument&Required<Pick<IDocument,"nodes"|"scene"|"scenes"|"setups"|"cameras"|"lights">>{
/** @fixme structuredClone is only available starting with node-17. Remove this check once node-16 support is dropped */
//@ts-ignore 
return (typeof structuredClone ==="function")?structuredClone(default_doc) : JSON.parse(JSON.stringify(default_doc));
}
