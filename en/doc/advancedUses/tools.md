---
title: Using eCorpus Tools
description: Learn how to use DPO-Voyager Tools and parameters
rank: 8
---

## Learn to Use DPO-Voyager Scene Tools and Parameters

Not to be confused with scene editing parameters, **tools and parameters constitute a set of functionalities** accessible to the user in both **editing mode** and **viewing mode**.

With these, you can, among other things, change the camera's viewpoint (switch from perspective to orthographic view), modify the scene's lighting, cut the model along an axis, or measure it with a ruler tool.


WIP[Insert presentation video here]


### Summary

* [Understanding Scene Tools and Parameters](#understanding-scene-tools-and-parameters)
* [List of Available Tools](#the-view-tool)
    * [The View Tool](#the-view-tool)
        * [Creating an Orthophoto](#creating-an-orthophoto-with-the-view-tool)
    * [The Texture Tool](#the-texture-tool)
    * [The Environment Tool](#the-environment-tool)
    * [The Lighting Tool](#the-lighting-tool)
    * [The Measure Tool](#the-measure-tool)
        * [Modifying a Scene's Units of Measurement](#modifying-a-scenes-units-of-measurement)
    * [The Cut Tool](#the-cut-tool)

### Understanding Scene Tools and Parameters

These **non-destructive** tools are used to quickly change scene display parameters, for example, the camera's viewpoint (switch from a perspective to an orthographic viewpoint), the environment, or the lighting.

They have the advantage of being easily accessible, while offering the possibility of being **staged during a guided tour**. **Caution**, not all functionalities are animatable in a guided tour. These specificities will be detailed for each function in the tools listed below.

Generally, most functions found in these parameters are also found in the scene parameters in DPO-Voyager's edit mode.

* **Changing scene parameters in DPO-Voyager editing** and saving these changes will modify the default display in your scene.

* **Changing scene display parameters in the parameter icon** will not change the default values of your scene's display. The changes will therefore be local and will be replaced by their default values as soon as the page is refreshed in your browser.

<img src="/assets/img/doc/Tools_01.jpg" width ="900" alt="illustration Media Voyager" />

To **make these tools appear**, simply click on the corresponding icon, on the left in the Explorer.

### The View Tool

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|**Projection**| Perspective| Reproduces the human eye's viewpoint: distant objects are smaller| No|
| | Orthographic| No notion of depth, objects are seen at the same scale| No|
|**View**| Front| Reorients the viewpoint to the front of the scene| No|
| | Back| Reorients the viewpoint to the back of the scene| No|
| | Left| Reorients the viewpoint to the left of the scene| No|
| | Right| Reorients the viewpoint to the right of the scene| No|
| | Top| Reorients the viewpoint to the top of the scene| No|
| | Bottom| Reorients the viewpoint to the bottom of the scene| No|

**Note** viewpoints are fixed relative to the **scene**. If your object does not appear at the correct angle when selecting a specific view, it means the object is incorrectly oriented relative to the scene.

To **reorient the object**, please go to the **Pose** tab at the top of the Explorer. To learn more, you can consult [this guide](../tutorials/import).

#### Creating an Orthophoto with the View Tool

It is possible to **create orthophotos** with a DPO-Voyager scene through the use of the View Tool described above.

<img src="/assets/img/doc/Tools_02.jpg" width ="700" alt="illustration Media Voyager" />

To do this, activate the Tool bar in scene Edit mode. Then go to the parameters of the **View** Tool.

<img src="/assets/img/doc/Tools_03.jpg" width ="700" alt="illustration Media Voyager" />

By default, the projection is in **Perspective**. Click on **Orthographic** right next to the Perspective button.

Once in orthographic projection, select the desired view (from the 5 available).

<img src="/assets/img/doc/Tools_04.jpg" width ="400" alt="illustration Media Voyager" />

Then go to the **"Capture"** tab at the top of the Explorer. Click on **"Capture"** to take a screenshot of the desired orthographic view.

<img src="/assets/img/doc/Tools_05.jpg" width ="400" alt="illustration Media Voyager" />

Once the screenshot is taken, a preview will be displayed at the bottom of the tab. If the obtained image is not suitable, repeat the process until you get the desired photo.

Once satisfied with your capture, click on the **"Download"** button to download the obtained image.

**Caution**: it is not necessary to click on "Save" during this process. This operation is only useful if you want the screenshot to become the thumbnail of your scene.

### The Texture Tool

<img src="/assets/img/doc/Tools_06.jpg" width ="700" alt="illustration Media Voyager" />

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|**Texture**| Default| Displays your object according to the display parameters of its source file| Yes|
| | Clay| Displays your object with a rendering mimicking the visual properties of clay| Yes|
| | X-Ray| Displays your object in transparency, mimicking a "ghostly" visual| Yes|
| | Normals| Displays your object by coloring it according to how light interacts with it ([see advanced guide](models/model))| Yes|
| | Wireframe| Displays your object transparent, only the 3D mesh of the model is visible| Yes|

**Caution** Materials are only animatable via the Texture Tool. The "Shader" parameter of an object, which performs a similar function to the Texture Tool, is not animatable.

#### Default Material

<img src="/assets/img/doc/Tools_07.jpg" width ="400" alt="illustration Media Voyager" />

Displays the 3D models of the scene with the same material information from the source .glb files.

It is the only material in the list displaying so-called "Albedo" texture information.

#### Clay Material

<img src="/assets/img/doc/Tools_08.jpg" width ="400" alt="illustration Media Voyager" />

Displays the 3D models of the scene with a material mimicking the visual properties of clay.

Widely used for 3D sculpting, this material allows judging the quality of the model's surface.

An object's Albedo texture can sometimes be misleading. It is said to "fake," mimicking volume information that the model does not truly incorporate.

Its absence therefore allows appreciating the good definition of volumes and their real interaction with the scene's lights.

#### X-Ray Material

<img src="/assets/img/doc/Tools_09.jpg" width ="400" alt="illustration Media Voyager" />

Displays the scene's 3D models with a semi-transparent material, mimicking a "ghostly" visual aspect.

It is mainly useful for staging aspects of Guided Tours, to represent a scanner aspect, for example.

#### Normal Material

<img src="/assets/img/doc/Tools_10.jpg" width ="400" alt="illustration Media Voyager" />

Displays the scene's 3D models with a material showing normals in visual form.

This material is useful for verifying the proper presence of a Normal Map in your objects. As a reminder, a Normal Map artificially adds micro-surface details without touching the object's geometry. If you wish, you can learn more by following [this guide](models/model).

#### Wireframe Material

<img src="/assets/img/doc/Tools_11.jpg" width ="400" alt="illustration Media Voyager" />

Displays the scene's 3D models with a transparent material, revealing only the edges and vertices of the 3D meshes.

**Caution**: since this material is based on your 3D model's mesh, it may not have the desired effect if your object's mesh is too dense.

In the example of the "Nu au Fardeau", the object's mesh is so dense that the Wireframe material gives it a solid appearance. It is necessary to zoom in more than usual to see the edges and vertices appear.

For comparison, here's how the Wireframe material reacts with another model, with a lighter mesh:

<img src="/assets/img/doc/Tools_12.jpg" width ="400" alt="illustration Media Voyager" /> <img src="/assets/img/doc/Tools_13.jpg" width ="400" alt="illustration Media Voyager" />

### The Environment Tool

<img src="/assets/img/doc/Tools_14.jpg" width ="700" alt="illustration Media Voyager" />

This tool focuses mainly on the scene's environment, i.e., **the space surrounding the imported models**.

It therefore serves to enhance their presentation and can be modified to align with established graphic charters.

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|**Background**| Solid| Colors the background with a solid color. Only color 1 is used for this change| No|
| | Linear| Colors the background with a horizontal gradient. Color 1 is at the bottom, 2 is at the top.| No|
| | Radial| Colors the background with a radial gradient. Color 1 is at the center, 2 is at the outside| No|
| | Color 1| Allows modifying the primary background color| **Yes** - Option: _Background_|
| | Color 2| Allows modifying the secondary background color| **Yes** - Option: _Background_|
|**Grid**| Grid| Displays a grid as the scene's floor. The square to its right represents its color parameter| No|
|**Floor**| Floor| Displays a radial gradient as the scene's floor. The square to its right represents its color parameter| No|
|**Env Map**| Env Map| Allows changing the scene's Environment Map. It determines the metallic reflections adopted by objects with Metallic values greater than 0| No|

### The Lighting Tool

<img src="/assets/img/doc/Tools_15.jpg" width ="700" alt="illustration Media Voyager" />

As its name suggests, this tool allows modifying the lighting parameters present in the scene. By default, a Voyager scene includes 4 lights, based on photo studio lighting principles, described below.

**Note** lights follow camera movements. For example, the left-oriented secondary light will always illuminate the left of the Explorer, regardless of whether you are viewing the front or back of the object.

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|**Lighting**| Key| Allows adjusting the intensity and color of the scene's main light| **Yes** - Option: _Lights_|
| | Fill 1| Allows adjusting the intensity and color of the scene's right-oriented secondary light| **Yes** - Option: _Lights_|
| | Fill 2| Allows adjusting the intensity and color of the scene's left-oriented secondary light| **Yes** - Option: _Lights_|
| | Backlight| Allows adjusting the intensity and color of the scene's Rim light| **Yes** - Option: _Lights_|

#### Key Lighting

The **Key Light** is the most important light in the scene. It emits the most light. It is always placed in front of the camera.

Generally, its color is white, so as not to affect the actual color of the illuminated object. A key light can be colored to give specific moods to the scene (e.g., blue to recreate an American night).

#### Secondary Lighting

The **Fill Light** is an optional but preferred light. It is traditionally placed towards the front of the subject, oriented to the left or right.

Their role is to complement the area of light emitted by the key light. They are often slightly colored to create softer and more interesting shadows in photos.

Here, DPO-Voyager scenes are composed by default of two secondary lights. Fill #1 is oriented to the right of the screen, while Fill #2 is oriented to the left of the screen.

It is customary to use warm colors for these lights, or to alternate a warm color on one side and a cool color on the other.

#### Backlighting

The **Rim Light** is the most optional of all the lights presented. Traditionally placed behind the subject, they serve to create a halo of light on the contours of the latter, in order to highlight it.

In the scene, the backlight is placed in the background, to the right of the screen.

It is customary for this light to be colored so as not to contradict the Key Light. Cool colors are preferred, to contrast with the generally warm colors of the Secondary Lights.

### The Measure Tool

<img src="/assets/img/doc/Tools_16.jpg" width ="700" alt="illustration Media Voyager" />

The measure tool allows **measuring the distance between two selected points in the scene**. Its operation is described below.

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|Measure| Activation| Activates the ability to measure a distance between two points defined by the user| No|

To use this tool, first select it from the list of Tool parameters.

<img src="/assets/img/doc/Tools_17.jpg" width ="900" alt="illustration Media Voyager" />

Then, click on the "Off" button to switch it to "On".

As long as the Measure Tool is active, you will be able to click on any part of the scene, as long as you are clicking on a visible 3D model.

<img src="/assets/img/doc/Tools_18.jpg" width ="400" alt="illustration Media Voyager" />

The first click will place a first point in the form of a thumbtack.

<img src="/assets/img/doc/Tools_19.jpg" width ="400" alt="illustration Media Voyager" />

In the same logic, the second click will place a second point which will cause a line to appear between the first and last point.

For now, **only one distance can be displayed**. A third click will erase the previous points and create a new one.

The units of measurement displayed by the distance are linked to the scene's **Global Unit** parameter.

##### Modifying a Scene's Units of Measurement

To **modify this unit of measurement**, go to the **"Pose"** tab at the top of the Explorer. Then select a model in the Navigator to the left of the Explorer.

<img src="/assets/img/doc/Tools_26.jpg" width ="400" alt="illustration Media Voyager" />

A tab at the bottom left of the Explorer will then appear. Click on the arrow in the Global Units parameter container.

### The Cut Tool

<img src="/assets/img/doc/Tools_20.jpg" width ="700" alt="illustration Media Voyager" />

Last in the list, but not least, the Cut Tool allows **sectioning a 3D model along a given axis**. One part of the model remains intact while the other disappears. The hole in the model obtained by the slice is automatically filled and colored blue.

**Reminder**: these parameters are non-destructive. Using the Cut Tool will not affect the mesh of your 3D file, only its display. You can therefore use the Cut Tool without fear of altering your source model.

|Function| Sub-function| Description | Animatable in Guided Tours |
|:----------|----------|----------|-----------:|
|**Cut Tool**| Cut Tool| enables the Tool. One of the three axes will always be selected by default| **Yes** - Option: _Slicer_|
|**Axis**| X| Cuts your models along its width| **Yes** - Option: _Slicer_|
| | Y| Cuts your models along its height| **Yes** - Option: _Slicer_|
| | Z| Cuts your models along its depth| **Yes** - Option: _Slicer_|

**Note**: you can reverse the direction of the cut by clicking on the desired axis again.

**Important** It is possible to choose which object is affected or not by this tool. This choice is made in the object's Material category parameters: **SlicerEnabled**.

#### The X-Axis

<img src="/assets/img/doc/Tools_22.jpg" width ="700" alt="illustration Media Voyager" />

If we consider that the object is placed in the same orientation as the scene: cuts the object along an X-axis, representing here the length (left/right).

**Note**: you can reverse the direction of the cut by clicking on the desired axis again.

#### The Y-Axis

<img src="/assets/img/doc/Tools_23.jpg" width ="700" alt="illustration Media Voyager" />

If we consider that the object is placed in the same orientation as the scene: cuts the object along a Y-axis, representing here the height (up/down).

**Note**: you can reverse the direction of the cut by clicking on the desired axis again.

#### The Z-Axis

<img src="/assets/img/doc/Tools_24.jpg" width ="700" alt="illustration Media Voyager" />

If we consider that the object is placed in the same orientation as the scene: cuts the object along a Z-axis, representing here the depth (front/back).

**Note**: you can reverse the direction of the cut by clicking on the desired axis again.


* [Return to the top of the page](#learn-to-use-dpo-voyager-scene-tools-and-parameters)