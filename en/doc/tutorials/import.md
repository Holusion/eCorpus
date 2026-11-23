---
title: Creating a Scene
rank: 3
---

# Model import and scene creation

## Getting Started with eCorpus

eCorpus is **open-source software** designed to preserve, annotate, and share 3D models. This series of tutorials is intended to help you **explore the features of eCorpus** as a user, editor, and administrator.

* eCorpus uses the 3D viewer <a href="https://smithsonian.github.io/dpo-voyager/">**DPO-Voyager**</a>.

## Exploring an eCorpus Scene

<iframe src="https://pod.univ-lille.fr/video/40131-creer_scenemp4/?is_iframe=true" width="800" height="450" style="padding: 0; margin: 0; border:0" allowfullscreen title="creer_scene.mp4" ></iframe>

### Table of Contents

* [Create an eCorpus Scene](#create-an-ecorpus-scene)
* [Manage Scene Options](#manage-scene-options)
    * [View Your Scene](#the-view-button)
    * [Edit Your Scene](#the-edit-button)
    * [Manage Scene Permissions](#manage-scene-permissions)
* [Scene Setup Essentials](#scene-setup-essentials)
    * [Quick Overview of Voyager Story Interface](#quick-overview-of-voyager-story-interface)
    * [Basic Controls](#basic-controls)
    * [Create a Thumbnail Image](#create-a-thumbnail-picture)
    * [Auto-Center Your Model](#center-your-model-automatically)
* [Sharing Your eCorpus Scene Easily](#sharing-your-ecorpus-scene-easily)
    * [Displaying the Scene on a Web Page](#displaying-the-scene-on-a-web-page)
* [Learn More](#learn-more)

## Preparing an eCorpus Scene

### Create an eCorpus Scene

#### How to Generate and Upload Your 3D Model

To **upload a 3D model** to your eCorpus account, go to the main page of your database. The logo in the top-left corner brings you back there at any time.

<img src="/assets/img/doc/SceneCreation_01_en.png" width="800" alt="eCorpus database home page" />

In the navigation bar, click "**upload**". The page opens: it is used both to create a new scene and to update an existing one.

<img src="/assets/img/doc/SceneCreation_06_en.png" width="100%" alt="scene upload page" />

Drop your files into the area, or click inside it to browse your computer. Three fields then need filling in:

* the **scene name**. It appears in the scene URL, so avoid special characters;
* the scene **default language**;
* the "**Optimize models**" option, which is best left enabled for large files. The conversion then runs as a background task and the scene loads much faster in the viewers.

Click "**create a scene**" to start the import.

* The eCorpus editor uses **.glb** and **.gltf** files, as well as **.obj** files with their materials (.mtl and associated textures). To learn how to export a model as .glb, see [Preparing your 3D model](../advancedUses/models/model.html).
* Database administrators can also drop a **.zip archive** holding one or more complete eCorpus scenes (models, articles, annotations, thumbnails). The "**extract**" button then rebuilds the scenes as they were exported. To produce such an archive, see [Download the scene](#download-the-scene).

### Manage Scene Options

After uploading your 3D model, you can prepare your editing collaborators, your project language, the licence and key metadata such as the author, the place where the work is kept or the creation date.

Once the import is complete, the model appears under "**my scenes**". By default the scene shows a wireframe cube thumbnail until you capture one from the editor.

Each scene card offers two actions.

#### The View Button

<img src="/assets/img/doc/SceneCreation_03_en.png" width="138" alt="View button on a scene card" />

It only **displays** your 3D scene in the DPO-Voyager viewer.

#### The Edit Button

<img src="/assets/img/doc/SceneCreation_04_en.png" width="138" alt="Edit button on a scene card" />

It **edits** your 3D scene, to change and add content. In the editor, the central window called "Explorer" shows the imported model: with your mouse, you can change your view of the object. For more on editing options, see [this section](#scene-setup-essentials).

<a id="manage-scene-permissions"></a>
#### Manage Scene Permissions

<img src="/assets/img/doc/SceneCreation_05_en.png" width="319" alt="scene name inside its card" />

To manage a scene, click its **name** in the list, or open its "**Overview**". You land on the scene sheet, which summarises its thumbnail, metadata and tags.

<img src="/assets/img/doc/AdminSettings_01_en.png" width="100%" alt="scene sheet in the administration interface" />

The left menu of that sheet gives access to every operation: "**Overview**", "**View**", "**Edit**", "**Scene History**", "**tasks**" and "**Settings**".

Access rights, tags, renaming and archiving live under "**Settings**". The page holds three blocks:

* "**Access rights**": the public access level, the default level for signed-in users, then the rights granted to groups or named users;
* "**Edit tags**": the collections the scene belongs to;
* at the bottom of the page, "**Rename**", "**Archive**" and "**Download this scene**".

The details of the visibility levels, public access, default access and groups are explained step by step in [Scene privacy](../explainers/permissions.html).

Permission levels you can grant to a user:

* **none**: the scene cannot be accessed;
* **read**: the user sees the scene in the viewer but cannot change it;
* **write**: the user sees and edits the 3D scene;
* **administration**: the user sees, edits and changes the access rights of that scene. This level only exists for a named user.

Two general rules apply to the whole scene:

* "**Public access**" applies to every visitor, including people who are not signed in. Only two values: "none" or "read". For a scene link to be visible to anyone, set it to "**read**";
* "**Default access**" applies to every member with an account on the database: "none", "read" or "write". It cannot be more restrictive than public access.

To give specific rights to a person, type their exact username, pick the level, then click "**+**". The "**Add group**" button works the same way with a group name.

<img src="/assets/img/doc/AdminSettings_03_en.png" width="100%" alt="adding a user to a scene access rights" />

##### Scene History

The "**Scene History**" entry lists every change made to the scene since its creation. If a wrong version was saved, hover over a step and click "**restore**" to go back to that state.

<img src="/assets/img/doc/AdminSettings_02_en.png" width="90%" alt="scene editing history" />

**Careful: clicking "restore" does not delete changes. New entries are added at the present date to put the scene back in the state it was in at the stated date.**

##### Download the scene

The "**Download this scene**" button, at the bottom of the "**Settings**" page, exports the scene as a .zip archive holding the scene in .json format, the .glb models and the articles, annotations and guided tours present at the time of download.

Downloading an eCorpus scene is useful, for example:

* to get the models of your database for another use (3D printing, model editing, etc.);
* to copy your scene to another eCorpus database, by dropping the archive on the upload page.

##### Add Scene to a Collection

Collections of eCorpus scenes are created and managed with **tags**.

On the "**Settings**" page, the "**Edit tags**" block lists the current tags, and the "**Add a tag**" field creates a new one.

<img src="/assets/img/doc/AdminSettings_04_en.png" width="90%" alt="editing the tags of a scene" />

* To attach the scene to **an existing collection**, start typing its name: tags already in use are suggested as you type;
* To create **a collection that does not exist yet**, type its full name then click "**+**": the tag is created and attached to the scene straight away.

### Scene Setup Essentials

#### Quick Overview of Voyager Story Interface

##### To edit your scene

  <div class="section">
    <ul>
      <li>{% include sv_button.html name="pose" icon="move" %} Position and resize the model.</li>
      <li>{% include sv_button.html name="capture" icon="camera" %} Take screenshots and save the state of the scene.</li>
      <li>{% include sv_button.html name="derivatives" icon="hierarchy" %} Manage derivatives (different levels of detail).</li>
      <li>{% include sv_button.html name="annotations" icon="comment" %} Create and edit annotations.</li>
      <li>{% include sv_button.html name="articles" icon="file" %} Create and edit articles.</li>
      <li>{% include sv_button.html name="visites" icon="globe" %} Create and edit guided tours.</li>
      <li>{% include sv_button.html name="audio" icon="audio" %} Add and organize audio.</li>
      <li>{% include sv_button.html name="parametres" icon="eye" %} Edit scene settings.</li>
    </ul>
  </div>

##### To explore your scene

<div class="section">
    <ul>
    <li>{% include sv_button.html icon="globe" %} Display tours.</li>
    <li>{% include sv_button.html icon="file" %} Display articles.</li>
    <li>{% include sv_button.html icon="comment" %} Display annotations.</li>
    <li>{% include sv_button.html icon="share" %} Share the scene.</li>
    <li>{% include sv_button.html icon="expand" %} Fullscreen mode.</li>
    <li>{% include sv_button.html icon="tools" %} Tools and settings.</li>
    </ul>
</div>
  

#### basic controls

<img src="/assets/img/doc/SceneEdition_01.jpg" width ="800" alt="illustration importation" />


* Hold down left click and move your mouse to rotate the object.

* Hold down the mouse wheel to change the zoom of the object. Moving your mouse forward will cause you to zoom in on the object, moving it back will have the opposite effect.

* Hold down right click and move your mouse to move the object in space.



You will notice that the scene name is displayed at the top left of this window. To change it, you need to go to the window on the far left, in "**Collection**" (the window displays "**Navigator**" by default).


<img src="/assets/img/doc/SceneEdition_02.jpg" width ="800"  alt="illustration importation" />


Here you can change the language of the scene, its title and the introduction which will be displayed in pop-up each time a user opens the scene. Changing the language will add a new language to the scene and will _not_ remove changes made to the original language.


_You can therefore have several languages ​​on the same stage._


<img src="/assets/img/doc/SceneEdition_03.jpg" width ="800" alt="illustration importation" />


**To save your changes** click on the "**Save**" button at the top right.


#### Create a thumbnail picture

To **create a thumbnail** of your 3D scene, go to the "**Capture**" tab, just below the "**Explore**" window.


<img src="/assets/img/doc/SceneEdition_04.jpg" width ="800" alt="illustration importation" />


Once the tab is clicked, you will notice new options at the very bottom left of your screen. In "**Scene State**", click on the "**Capture**" button so that the editor takes a "photo" of the scene in its current state.
<img src="/assets/img/doc/SceneEdition_05.jpg" width ="200" alt="illustration importation" />


 A preview is then updated in the "**Preview**". Do not hesitate to orient your object differently and move it if necessary. You can repeat the capture as many times as necessary.

<img src="/assets/img/doc/SceneEdition_06.jpg" width ="200" alt="illustration importation" />


Once you are satisfied with the image, you can save it by clicking on the "**Save**" button below the "**Capture**" button.

**Be careful, saving the scene without having saved the thumbnail in the Capture tab is not enough, you risk losing your thumbnail image.**

#### Center your model automatically

When importing your 3D model, the model location may not be correct. If you notice that your model is off-center in the scene, or that its center of rotation does not seem correct, you can correct its location via the "**Pose**" tab, at the top of the Explorer.
<img src="/assets/img/doc/SceneEdition_07.jpg" width ="800" alt="illustration importation" />


By clicking on "**Pose**" you will notice a change in the Explorer. The 3D view is now divided into 4 planes, showing a 3/4 view, a top view, a side view, and finally a front view of your scene.

You will also notice the appearance of a virtual grid. This grid only serves as a guide to reposition your model, so it will not appear on your final scene.

The center of this grid corresponds to the center of rotation of the scene. We therefore advise you to reposition your object so that its center of rotation is placed in the center of this grid.

<img src="/assets/img/doc/SceneEdition_08.jpg" width ="300" alt="illustration importation" />


You can easily recenter your model, simply click on the “Center” button, to the far right of the tab.


Auto-recentering may not be enough to resolve placement issues. To reposition your model manually, simply change the values ​​in the Position slots. 

An advanced tutorial on editing your object's pivot point will soon be available on the platform.




## Sharing Your eCorpus Scene Easily

Once your scene has been created and configured to your liking, you can share it. Several options are available:

#### Sharing the Viewer Link

The first solution is also the simplest: go to the viewer of your eCorpus scene (the **"View"** button) and copy the link, to share it afterwards on social media posts (such as LinkedIn).

**Careful: for the scene to be visible to unidentified members of the public, set "Public access" to "read" in the scene "Settings".**

#### Displaying the Scene on a Web Page

This solution allows an eCorpus scene to be displayed on a web page. Every eCorpus scene has a **Share** icon, located on the left of the Explorer, which allows you to copy an "Iframe" code.
[You will find the list of Explorer icons here](#to-explore-your-scene)

Simply copy this code and paste it into your page's code, at the desired location.

**Careful: for the scene to be visible to unidentified members of the public, set "Public access" to "read" in the scene "Settings".**

#### Sharing the Scene with Your Colleagues with Administration Rights

If they have an account on your eCorpus database, it is perfectly possible to share your scene with your colleagues for read-only access. You simply need to change the **access rights** of your scene by adding the username of the person concerned, as [shown in this section](#manage-scene-permissions).

The scene will then appear in that user's list.


## Learn More
If you want to learn more about eCorpus features, you can visit this guide: <a href="annotation">Create Annotations</a>.


* [Return to top page](#getting-started-with-ecorpus)