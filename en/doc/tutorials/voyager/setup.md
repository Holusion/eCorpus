---
title: Scene setup manual
description: Learn to setup a scene in dpo-voyager
---


## Scene setup manual

This tutorial will go through the main setup options of a scene in DPO-Voyager.

Everything will happen under the <span class="d-inline-flex"> {% include button.html name="parameters" style="width:150px" icon="eye" %} </span> tab, with the <img style="max-height:1.5rem" src="/assets/img/doc/scene_node.jpg" title="scene node" alt="scene node in voyager's hierarchy"> node selected.


### Navigation

#### Lights Rotation

By default, lights are following the camera rotation, giving the impression of a central object that rotates around itself. Disabling `LightFollowCam` under **Orbit Navigation** > **Navigation** makes the lights fixed.

#### Zoom Lock

Restrict how close the camera can zoom using the **Orbit Navigation** > **Limits** options.

Setting `OrbitNavigation.Limits.Min.Offset.Z` will prevent the camera from zooming too close.
Setting `OrbitNavigation.Limits.Max.Offset.Z` will prevent dezooming too far.

Changing `OrbitNavigation.Limits.<Min/Max>.Orbit.X` might also help for objects that have a bad texture under.

#### Background

Some integrations will look better with a matched background.

Set the **Background** option to change it.


#### Interface

Most interface elements can be removed. Check out **Reader** > **Enabled** or **Viewer** > **Annotations** > **Visible** for example.
