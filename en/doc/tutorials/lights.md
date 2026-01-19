---
title: Scene Lighting 
rank: 10
---

# Lighting

A Voyager scene comes with a default environmental light. However, existing lights and their shadows can be edited and additional light sources can be introduced.

### Summary

- [Lighting](#lighting)
    - [Summary](#summary)
  - [Default Scene Lighting](#default-scene-lighting)
  - [Editing existing lights](#editing-existing-lights)
    - [Editing the environment Light](#editing-the-environment-light)
    - [Shadows using the default "Shadow caster" lights](#shadows-using-the-default-shadow-caster-lights)
  - [Custom light sources](#custom-light-sources)
    - [Warning](#warning)
    - [How to add a light](#how-to-add-a-light)
    - [Types of light](#types-of-light)

## Default Scene Lighting

By default, a Voyager scene includes an environment light that simulates the lighting of a photo studio. Two directional lights named "Shadow casters", initially disabled, are already set up to easily cast a shadow on a floor.

Existing light sources are visible in the *Navigator* pannel (top left) :
<div class="center">
<img src="/assets/img/doc/Lights_01.jpg" width ="400" alt="illustration Navigator lights" />
</div>

## Editing existing lights

There are two ways to edit lights :

- The [Light tool](../advancedUses/tools.html#the-lighting-tool), available in the scene toolbar. This allows to set the intensity and the colors (if applicable) of all the lights.
- Each light's settings. This allows set all the parameters of the lights, including their positions, and their shadow parameters if applicable.

To edit the a light's settings, click on the *Settings* task in the top navigation bar. Then, select the light source you want to edit in the Navigator pannel on the left side.
Below the Navigator pannel, the *Task* tab now displays all available settings for the selected light, including its position, color, intensity, and its shadow parameters.

### Editing the environment Light

The environment light has only one setting : its intensity. You cannot rotate it, or change its color. It cannot cast any shadows.
However it is heavily influenced by the environment map. It is currently possible to chose between three environment maps using the [environment tool](../advancedUses/tools.html#the-environment-tool) or changing the `MapIndex` scene setting (`Environment > Environment > MapIndex`). The environment map can be rottated in the scene settings (`Environment > Environment > Rotation`)


If you do not want to use the environment light, you can disable it by using the *Settings* task and setting "enabled" to *off*.


### Shadows using the default "Shadow caster" lights

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_03.jpg" width ="700" alt="statue without shadows " />
<img src="/assets/img/doc/Lights_02.jpg" width ="700" alt="statue with shadows" />
</div>

The default Voyager scene comes with two "Shadow Caster" lights. These lights are set up to contribute very little to the overall light intensity, but still project shadows. (See [directional lights](#directional-light) for more details) 

To use them:
- Activate one or both "Shadow Caster" lights using the *Settings* task. Select the light to activate in the *Navigator* pannel. Then, in the task pannel just bellow, toggle the "Enabled" setting (`Directional Light > Light > Enabled`)  
- Activate the floor. Using the scene setting (`Floor > Object > Visible`) or the [environment tool](../advancedUses/tools.html#the-environment-tool). If the floor is not active, there is no surface on which to cast the shadows. 
- Activate "ReceiveShadow" on model. If you want cast shadows on the model itself, select the model in the navigator pannel and activate the `ReceiveShadow` setting (`Model > Model > ReceiveShadow`)

**Note**: By default, lights follow camera movements. Therefore, if you turn the camera around the object, the shadows will always stretch on the same side compare to your view point. This can be edited in scenes settings in `Orbit Navigation > LightsFollowCam`.

## Custom light sources

### Warning 
Be careful about editing lights in scenes with already defined tours and annotations. If lights are parts of the properties tracked in [tours snapshot configuration](../advancedUses/animatedtours.html#approaching-guided-tour-parameters), adding or removing lights breaks the scene, preventing further saves.
Ideally, lighting should be defined before creating annotations or tours.
If a light source is no longer necessary, it can be turned off (by setting "Enabled" to off) instead of deleted.

### How to add a light

To add a light, use the "+" button on the right side of the "Lights" in the *Navigator* pannel (top left) :

<div class="center">
<img src="/assets/img/doc/Lights_add_light.png" width ="400" alt="illustration Navigator lights" />
</div>

Then select the appropriate type of light and enter a name for this light source. Press "Create Light".


### Types of light

There are six different types of lights available to be added. Each of them is detailed below with an illustration using only one light source.
These light sources do not use the environment map. This leads to metallic parts on the statue used as exemples looking very dark.
For best results, these should be used with the environment light.

Most light types are influenced by their position. To move a light source, use their position and rotation parameters in their transform matrix.

**Note** By default, lights follow camera movements. For example, a left-oriented secondary light will always illuminate the left of the Explorer, regardless of whether you are viewing the front or back of the object. This can be edited in Scenes `Settings > Orbit Navigation > LightsFollowCam`.

||Light Type                                         |  exemple              |  shadows    |
|:--:| :-----------------------------------------------  | ------------------    | :---------: |
|<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg> | [Ambient Light](#ambient-light)                   | -                     |       ❌    |                         
| <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style=";stroke-width:50;stroke-linecap:round;stroke-linejoin:round" d="M.588 9.16h14.84c.212 0 .384.172.384.385v1.124a.384.384 0 0 1-.385.385H.588a.384.384 0 0 1-.384-.385V9.545c0-.213.171-.385.384-.385zM8 .145c-.499-.003-.998.142-1 .439V3h2V.59C8.998.297 8.499.147 8 .145zm4.734 1.82a.274.274 0 0 0-.199.074l-1.71 1.707 1.411 1.416 1.707-1.701c.36-.364-.663-1.497-1.209-1.496zm-9.464.012C2.725 1.974 1.68 3.09 2.045 3.46l1.707 1.71L5.168 3.76 3.467 2.053a.272.272 0 0 0-.197-.076zM8 5a2.997 2.997 0 0 0-2.988 2.785h5.976A2.997 2.997 0 0 0 8 5zM.586 6.986c-.253.002-.4.375-.438.8h2.846l.002-.796zm12.418.006v.793h2.848c-.034-.419-.177-.786-.432-.789z"/></svg>| [Hemisphere Light](#hemisphere-light)             | Sky and ground        |       ❌    |                            
|<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style="stroke:none" d="m10.824 3.745 1.711-1.705c.425-.416 1.82 1.005 1.408 1.42l-1.707 1.702zm2.18 3.247 2.416.004c.595.006.576 1.997-.008 2l-2.41-.004zm-.765 3.833 1.704 1.711c.416.425-1.005 1.82-1.42 1.408l-1.701-1.708zM8.997 13l-.004 2.416c-.006.594-1.997.576-2-.01l.004-2.41zm-3.825-.758-1.72 1.697c-.426.414-1.814-1.013-1.4-1.427l1.715-1.693zM2.992 8.99.578 8.986c-.594-.006-.576-1.997.009-2l2.41.004zm.76-3.818L2.045 3.46c-.416-.424 1.005-1.819 1.42-1.408L5.168 3.76zM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM7 3V.584C7.005-.01 8.996.004 9 .59V3z"/></svg>| [Directional Light](#directional-light)           | Sun                   |       ✅    |                          
| <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M301.87 108.727c0 52.94 43.06 96 96 96 8.84 0 16-7.16 16-16s-7.16-16-16-16c-35.3 0-64-28.72-64-64 0-8.84-7.16-16-16-16s-16 7.16-16 16zM478.636 144.265a15.898 15.898 0 0 0 4.356-8.146l8.718-43.38a16.008 16.008 0 0 0-4.37-14.468l-55.755-55.755a15.982 15.982 0 0 0-14.467-4.37l-43.381 8.718a16.084 16.084 0 0 0-8.146 4.356l-30.568 30.498L448.13 174.826zM30.3 216.774c-7.856 4.045-10.956 13.686-6.912 21.55l7.32 14.232c4.044 7.855 13.695 10.956 21.55 6.911l207.354-102.82c-5.12-15.272-4.739-35.452-3.706-49.874zM257.42 455.585c-3.858 7.948-.554 17.522 7.4 21.388l14.393 6.994c7.949 3.858 17.53.549 21.388-7.4l108.397-220.653c-14.872 2.094-34.317 1.858-49.625-2.162zM119.554 363.004c-6.162 6.331-6.037 16.458.298 22.63l11.464 11.165c6.331 6.162 16.468 6.034 22.63-.297L309.885 230.5c-11.419-7.558-22.03-17.993-30.532-31.249z"/></svg>| [Spot Light](#spot-light)                         | Spotlight             |       ✅    | 
|<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M44.73 323.21c-7.65 4.42-10.28 14.2-5.86 21.86l8 13.86c4.42 7.65 14.21 10.28 21.86 5.86l93.26-53.84a207.865 207.865 0 0 1-26.83-39.93l-90.43 52.19zM112.46 168H16c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h100.21a210.423 210.423 0 0 1-3.75-48zm127.6 291.17c0 3.15.93 6.22 2.68 8.84l24.51 36.84c2.97 4.46 7.97 7.14 13.32 7.14h78.85c5.36 0 10.36-2.68 13.32-7.14l24.51-36.84c1.74-2.62 2.67-5.7 2.68-8.84l.05-43.18H240.02l.04 43.18zM44.73 60.78l78.98 45.6c5.37-15.29 12.97-29.48 21.64-42.93L68.73 19.21c-7.65-4.42-17.44-1.8-21.86 5.86l-8 13.86c-4.42 7.65-1.79 17.44 5.86 21.85zm550.54 0c7.65-4.42 10.28-14.2 5.86-21.86l-8-13.86c-4.42-7.65-14.21-10.28-21.86-5.86l-76.61 44.23c8.68 13.41 15.76 27.9 21.2 43.19l79.41-45.84zm0 262.43l-90.97-52.52c-7.33 14.23-15.8 27.88-26.36 40.21l93.33 53.88c7.65 4.42 17.44 1.8 21.86-5.86l8-13.86c4.42-7.64 1.79-17.43-5.86-21.85zM624 168h-96.41c.1 2.68.41 5.3.41 8 0 13.54-1.55 26.89-4.12 40H624c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16zM320 80c-52.94 0-96 43.06-96 96 0 8.84 7.16 16 16 16s16-7.16 16-16c0-35.3 28.72-64 64-64 8.84 0 16-7.16 16-16s-7.16-16-16-16zm0-80C217.72 0 144 82.97 144 176c0 44.37 16.45 84.85 43.56 115.78 16.64 18.99 42.74 58.8 52.42 92.16v.06h48v-.12c-.01-4.77-.72-9.51-2.15-14.07-5.59-17.81-22.82-64.77-62.17-109.67-20.53-23.43-31.52-53.14-31.61-84.14-.2-73.64 59.67-128 127.95-128 70.58 0 128 57.42 128 128 0 30.97-11.24 60.85-31.65 84.14-39.11 44.61-56.42 91.47-62.1 109.46a47.507 47.507 0 0 0-2.22 14.3v.1h48v-.05c9.68-33.37 35.78-73.18 52.42-92.16C479.55 260.85 496 220.37 496 176 496 78.8 417.2 0 320 0z"/></svg>| [Point Light](#point-light)                       | Light bulb            |       ✅    | 
|<svg viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg"><path style="stroke-linecap:round;-inkscape-stroke:none" d="M351.053 207.98a25 25 0 0 0-12.014 4.811l-7.65 5.729a25 25 0 0 0-5.028 34.996 25 25 0 0 0 34.996 5.027l7.65-5.729a25 25 0 0 0 5.028-34.996 25 25 0 0 0-22.982-9.838zm-58.348 43.956a25 25 0 0 0-11.848 5.203L45.99 445.346a25 25 0 0 0-3.877 35.14 25 25 0 0 0 35.143 3.877l234.867-188.207a25 25 0 0 0 3.875-35.142 25 25 0 0 0-23.293-9.078zM131.023 68.966c-7.535 0-12.006 1.996-17.07 6.53-5.064 4.535-11.212 17.475-6.45 28.72a25.003 25.003 0 0 0 .017.036l114 267.99a25.003 25.003 0 0 0 .048.115c.146.338.588 2.384 3.852 6.344 3.264 3.96 12.068 9.254 19.603 9.254h335.891c7.51 0 12.01-1.991 17.082-6.539 5.073-4.548 11.19-17.488 6.438-28.709a25.003 25.003 0 0 0-.014-.037l-114-267.99a25.003 25.003 0 0 0-.018-.04c-.155-.363-.602-2.438-3.883-6.42-3.28-3.98-12.096-9.253-19.605-9.253H131.025zM444.428 104.3l.677 1.59c-.513-.992-.653-1.531-.677-1.59zm-276.313 14.668h282.553l93.154 218.988H261.27zm98.705 232.037c.48.923.597 1.378.623 1.467z"/></svg>| [Rectangle (rect) Light](#rectangle-light)   | Windows               |       ❌    | 


<h4 id="ambient-light"> <svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg> Ambient Light  </h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_Ambient.png" width ="300" alt="statue without shadows " />
</div>

This light uniformly illuminates all objects in the scene equally. It cannot be used to cast shadows as it does not have a direction.
**Settings** :
- **Color** : Light color
- **Intensity** : Light intensity

<h4 id="hemisphere-light"> <svg width=1em viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style=";stroke-width:50;stroke-linecap:round;stroke-linejoin:round" d="M.588 9.16h14.84c.212 0 .384.172.384.385v1.124a.384.384 0 0 1-.385.385H.588a.384.384 0 0 1-.384-.385V9.545c0-.213.171-.385.384-.385zM8 .145c-.499-.003-.998.142-1 .439V3h2V.59C8.998.297 8.499.147 8 .145zm4.734 1.82a.274.274 0 0 0-.199.074l-1.71 1.707 1.411 1.416 1.707-1.701c.36-.364-.663-1.497-1.209-1.496zm-9.464.012C2.725 1.974 1.68 3.09 2.045 3.46l1.707 1.71L5.168 3.76 3.467 2.053a.272.272 0 0 0-.197-.076zM8 5a2.997 2.997 0 0 0-2.988 2.785h5.976A2.997 2.997 0 0 0 8 5zM.586 6.986c-.253.002-.4.375-.438.8h2.846l.002-.796zm12.418.006v.793h2.848c-.034-.419-.177-.786-.432-.789z"/></svg>
 Hemisphere Light </h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_Hemisphere.png" width ="300" alt="statue without shadows " />
</div>

A light source positioned above the scene, with color fading from the sky color to the ground color. This light cannot be used to cast shadows. 

**Settings** :     
- **skyColor** : Color of the light coming from the top of the scene 
- **groundColor** : Color of the light coming from the bottom of the scene
- **intensity** : Light intensity

<h4 id="directional-light"> <svg width=1em viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path style="stroke:none" d="m10.824 3.745 1.711-1.705c.425-.416 1.82 1.005 1.408 1.42l-1.707 1.702zm2.18 3.247 2.416.004c.595.006.576 1.997-.008 2l-2.41-.004zm-.765 3.833 1.704 1.711c.416.425-1.005 1.82-1.42 1.408l-1.701-1.708zM8.997 13l-.004 2.416c-.006.594-1.997.576-2-.01l.004-2.41zm-3.825-.758-1.72 1.697c-.426.414-1.814-1.013-1.4-1.427l1.715-1.693zM2.992 8.99.578 8.986c-.594-.006-.576-1.997.009-2l2.41.004zm.76-3.818L2.045 3.46c-.416-.424 1.005-1.819 1.42-1.408L5.168 3.76zM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM7 3V.584C7.005-.01 8.996.004 9 .59V3z"/></svg>
Directional Light </h4>

<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_directional.png" width ="300" alt="statue without shadows " />
</div>

A light emitted in a specific direction. This light will behave as though it is infinitely far away and the rays produced from it are all parallel. The common use case for this is to simulate daylight; the sun is far enough away that its position can be considered to be infinite, and all light rays coming from it are parallel. This light can cast shadows. It is equivalent to the "Sun light" in Blender.


With some specific settings, this is the type used for the default "Shadow casters". These have a very low light intensity of 0.01 (to avoid contributing additional light to the environment light) and very high shadow intensity of 50 or 60 (to still project a visible shadow).

**Settings** :
- **Color** : Light color
- **Intensity** : Light intensity
- **Shadow Settings** : 
    - **Resolution** : Level of shadow detail
    - **Blur** : Higher values produce softer, more blurred shadows
    - **Intensity** : intensity of shadows


<h4 id="spot-light"><svg width=1em viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M301.87 108.727c0 52.94 43.06 96 96 96 8.84 0 16-7.16 16-16s-7.16-16-16-16c-35.3 0-64-28.72-64-64 0-8.84-7.16-16-16-16s-16 7.16-16 16zM478.636 144.265a15.898 15.898 0 0 0 4.356-8.146l8.718-43.38a16.008 16.008 0 0 0-4.37-14.468l-55.755-55.755a15.982 15.982 0 0 0-14.467-4.37l-43.381 8.718a16.084 16.084 0 0 0-8.146 4.356l-30.568 30.498L448.13 174.826zM30.3 216.774c-7.856 4.045-10.956 13.686-6.912 21.55l7.32 14.232c4.044 7.855 13.695 10.956 21.55 6.911l207.354-102.82c-5.12-15.272-4.739-35.452-3.706-49.874zM257.42 455.585c-3.858 7.948-.554 17.522 7.4 21.388l14.393 6.994c7.949 3.858 17.53.549 21.388-7.4l108.397-220.653c-14.872 2.094-34.317 1.858-49.625-2.162zM119.554 363.004c-6.162 6.331-6.037 16.458.298 22.63l11.464 11.165c6.331 6.162 16.468 6.034 22.63-.297L309.885 230.5c-11.419-7.558-22.03-17.993-30.532-31.249z"/></svg> Spot Light </h4>

<div class="media" style="display:flex; justify-content: center; align-items: space-around;">
<img src="/assets/img/doc/Lights_spotlight1.png" width ="300" alt="spot light illustration" /><img src="/assets/img/doc/Lights_spotlight2.png" width ="300" alt="spot light illustration with gizmo" />
</div>
This light gets emitted from a single point in one direction, along a cone that increases in size the further from the light it gets. This light can cast shadows.

**Settings** :
- **Color** : Light color
- **Intensity** : Light intensity
- **Distance** : Maximum range of the light. 0 means infinite
- **Angle** : The angle of the cone of dispersion of the spotlight. The higher the angle, the wider the splotlight. 
- **Penumbra** : Percent of the spotlight cone that is attenuated due to penumbra. Value range is [0,1]
- **Decay** : The amount the light dims along the distance of the light. 
- **Shadow Settings** :
    - **Resolution** : Level of shadow detail
    - **Blur** : Higher values produce softer, more blurred shadows
    - **Intensity** : intensity of shadows
  
<h4 id="point-light"><svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M44.73 323.21c-7.65 4.42-10.28 14.2-5.86 21.86l8 13.86c4.42 7.65 14.21 10.28 21.86 5.86l93.26-53.84a207.865 207.865 0 0 1-26.83-39.93l-90.43 52.19zM112.46 168H16c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h100.21a210.423 210.423 0 0 1-3.75-48zm127.6 291.17c0 3.15.93 6.22 2.68 8.84l24.51 36.84c2.97 4.46 7.97 7.14 13.32 7.14h78.85c5.36 0 10.36-2.68 13.32-7.14l24.51-36.84c1.74-2.62 2.67-5.7 2.68-8.84l.05-43.18H240.02l.04 43.18zM44.73 60.78l78.98 45.6c5.37-15.29 12.97-29.48 21.64-42.93L68.73 19.21c-7.65-4.42-17.44-1.8-21.86 5.86l-8 13.86c-4.42 7.65-1.79 17.44 5.86 21.85zm550.54 0c7.65-4.42 10.28-14.2 5.86-21.86l-8-13.86c-4.42-7.65-14.21-10.28-21.86-5.86l-76.61 44.23c8.68 13.41 15.76 27.9 21.2 43.19l79.41-45.84zm0 262.43l-90.97-52.52c-7.33 14.23-15.8 27.88-26.36 40.21l93.33 53.88c7.65 4.42 17.44 1.8 21.86-5.86l8-13.86c4.42-7.64 1.79-17.43-5.86-21.85zM624 168h-96.41c.1 2.68.41 5.3.41 8 0 13.54-1.55 26.89-4.12 40H624c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16zM320 80c-52.94 0-96 43.06-96 96 0 8.84 7.16 16 16 16s16-7.16 16-16c0-35.3 28.72-64 64-64 8.84 0 16-7.16 16-16s-7.16-16-16-16zm0-80C217.72 0 144 82.97 144 176c0 44.37 16.45 84.85 43.56 115.78 16.64 18.99 42.74 58.8 52.42 92.16v.06h48v-.12c-.01-4.77-.72-9.51-2.15-14.07-5.59-17.81-22.82-64.77-62.17-109.67-20.53-23.43-31.52-53.14-31.61-84.14-.2-73.64 59.67-128 127.95-128 70.58 0 128 57.42 128 128 0 30.97-11.24 60.85-31.65 84.14-39.11 44.61-56.42 91.47-62.1 109.46a47.507 47.507 0 0 0-2.22 14.3v.1h48v-.05c9.68-33.37 35.78-73.18 52.42-92.16C479.55 260.85 496 220.37 496 176 496 78.8 417.2 0 320 0z"/></svg>Point Light</h4>



<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_pointlight.png" width ="300" alt="statue without shadows " />
</div>

A light that gets emitted from a single point in all directions. A common use case for this is to replicate the light emitted from a bare lightbulb. This light can cast shadows.

**Settings** :
- **Color** : Light color
- **Intensity** : Light intensity
- **Distance** : Maximum range of the light. 0 means infinite
- **Decay** : The amount the light dims along the distance of the light. 
- **Shadow Settings** :
    - **Resolution** : Level of shadow detail
    - **Blur** : Higher values produce softer, more blurred shadows
    - **Intensity** : intensity of shadows
  

<h4 id="rectangle-light"><svg width=1em viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg"><path style="stroke-linecap:round;-inkscape-stroke:none" d="M351.053 207.98a25 25 0 0 0-12.014 4.811l-7.65 5.729a25 25 0 0 0-5.028 34.996 25 25 0 0 0 34.996 5.027l7.65-5.729a25 25 0 0 0 5.028-34.996 25 25 0 0 0-22.982-9.838zm-58.348 43.956a25 25 0 0 0-11.848 5.203L45.99 445.346a25 25 0 0 0-3.877 35.14 25 25 0 0 0 35.143 3.877l234.867-188.207a25 25 0 0 0 3.875-35.142 25 25 0 0 0-23.293-9.078zM131.023 68.966c-7.535 0-12.006 1.996-17.07 6.53-5.064 4.535-11.212 17.475-6.45 28.72a25.003 25.003 0 0 0 .017.036l114 267.99a25.003 25.003 0 0 0 .048.115c.146.338.588 2.384 3.852 6.344 3.264 3.96 12.068 9.254 19.603 9.254h335.891c7.51 0 12.01-1.991 17.082-6.539 5.073-4.548 11.19-17.488 6.438-28.709a25.003 25.003 0 0 0-.014-.037l-114-267.99a25.003 25.003 0 0 0-.018-.04c-.155-.363-.602-2.438-3.883-6.42-3.28-3.98-12.096-9.253-19.605-9.253H131.025zM444.428 104.3l.677 1.59c-.513-.992-.653-1.531-.677-1.59zm-276.313 14.668h282.553l93.154 218.988H261.27zm98.705 232.037c.48.923.597 1.378.623 1.467z"/></svg> Rectangle (rect) Light </h4>





<div class="media" style="display:flex; justify-content: center">
<img src="/assets/img/doc/Lights_rect.png" width ="300" alt="statue without shadows " />
</div>

This light emits uniformly across the face a rectangular plane. This light type can be used to simulate light sources such as bright windows or strip lighting. This is the equivalent of an "Area light" in Blender.

**Settings** :
- **Color** : Light color
- **Intensity** : Light intensity
 
The size of the rectangle can be edited using the scale parameters of the transform. Do NOT set any scale to 0.


* [Return to the top of the page](#lighting)
