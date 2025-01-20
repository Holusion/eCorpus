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
        "children": [2, 3, 4, 5]
    }, {
        "translation": [0, 0, 2],
        "rotation": [0.4829741, -0.1070728, 0.1880998, 0.8484633],
        "scale": [1, 1, 1],
        "name": "Key",
        "id": "00000003",
        "light": 0
    }, {
        "rotation": [0.3546969, 0.163893, -0.3861077, 0.8356136],
        "scale": [1, 1, 1],
        "name": "Fill #1",
        "id": "00000004",
        "light": 1
    }, {
        "translation": [0, 0, 1],
        "rotation": [0.9374013, -0.3018693, 0.0532277, 0.1652891],
        "name": "Fill #2",
        "id": "00000005",
        "light": 2
    }, {
        "translation": [1, 0, -1],
        "rotation": [0.373256, 0.6426073, -0.5786063, 0.3360813],
        "scale": [1, 1, 1],
        "name": "Rim",
        "id": "00000006",
        "light": 3
    }],
    "setups": [{
        "units": "m"
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
        "color": [1, 0.95, 0.9],
        "intensity": 1,
        "type": "directional",
        "shadowEnabled": true
    }, {
        "color": [0.9, 0.95, 1],
        "intensity": 0.7,
        "type": "directional",
        "shadowEnabled": true
    }, {
        "color": [0.8, 0.85, 1],
        "intensity": 0.5,
        "type": "directional"
    }, {
        "color": [0.85, 0.9078313, 1],
        "intensity": 0.6,
        "type": "directional"
    }]
} as const;

/**
 * This is a workaround for JSON imports syntax changing every other day and the fact we _might_ mutate the document in place one returned
 * @returns a pristine default document that we are free to mutate or otherwise modify
 */
export default async function getDefaultDocument(){
/** @fixme structuredClone is only available starting with node-17. Remove this check once node-16 support is dropped */
//@ts-ignore 
return (typeof structuredClone ==="function")?structuredClone(default_doc) : JSON.parse(JSON.stringify(default_doc));
}
