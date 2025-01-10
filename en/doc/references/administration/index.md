---
title:  Instance administration
description: Get to grips with administration tools
---


## Administration of an instance

### The administration interface

When logged in as administrator, an **administration** tab appears in the navigation bar.

If the tab doesn't appear, ask another administrator to check your permissions.

### Administration tools

#### User management

The user management tool lets you create, modify and delete users.

<p>
  Find it in the 
  <span>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960"><path d="m667 936-10-66q-17-5-34.5-14.5T593 834l-55 12-25-42 47-44q-2-9-2-25t2-25l-47-44 25-42 55 12q12-12 29.5-21.5T657 600l10-66h54l10 66q17 5 34.5 14.5T795 636l55-12 25 42-47 44q2 9 2 25t-2 25l47 44-25 42-55-12q-12 12-29.5 21.5T731 870l-10 66h-54ZM80 892v-94q0-35 17.5-63t50.5-43q72-32 133.5-46T400 632h23q-21 51-19 134.5T438 892H80Zm614-77q36 0 58-22t22-58q0-36-22-58t-58-22q-36 0-58 22t-22 58q0 36 22 58t58 22ZM400 571q-66 0-108-42t-42-108q0-66 42-108t108-42q66 0 108 42t42 108q0 66-42 108t-108 42Z"></path></svg>Users tab</span> your administration interface.
</p>

This page is mainly used to add new users, using the button at the top of the page.

It is also possible to generate quick login links for existing users using the icon <svg width="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960"><path d="M280 640.614q-26.846 0-45.73-18.884-18.884-18.884-18.884-45.73 0-26.846 18.884-45.73 18.884-18.884 45.73-18.884 26.846 0 45.73 18.884 18.884 18.884 18.884 45.73 0 26.846-18.884 45.73-18.884 18.884-45.73 18.884Zm0 155.385q-91.538 0-155.768-64.231-64.23-64.23-64.23-155.768t64.23-155.768q64.23-64.231 155.768-64.231 64.307 0 116.307 33.193 52 33.192 79.384 86.807h360.078L935.767 576 781.923 729.075l-74.23-55.769-76.154 56.538-78.076-53.845h-77.772q-27.384 53.23-79.384 86.615T280 795.999ZM280 736q57.539 0 99.654-34.769 42.115-34.77 54.961-85.231h137.694l57.615 39.846 78.154-57.153L776 650.615 850.616 576l-40-40H434.615q-12.846-50.461-54.961-85.231Q337.539 416 280 416q-66 0-113 47t-47 113q0 66 47 113t113 47Z"></path></svg> to the right of each user.

#### Data export

The administration interface allows you to export all eCorpus instance data.

 > This feature should only be used for very small instances.
 > Do not attempt to export large quantities of data from the interface!

<p>
  In the 
  <span>
    <svg style="padding-bottom:1px;" width="17" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M501.1 395.7L384 278.6c-23.1-23.1-57.6-27.6-85.4-13.9L192 158.1V96L64 0 0 64l96 128h62.1l106.6 106.6c-13.6 27.8-9.2 62.3 13.9 85.4l117.1 117.1c14.6 14.6 38.2 14.6 52.7 0l52.7-52.7c14.5-14.6 14.5-38.2 0-52.7zM331.7 225c28.3 0 54.9 11 74.9 31l19.4 19.4c15.8-6.9 30.8-16.5 43.8-29.5 37.1-37.1 49.7-89.3 37.9-136.7-2.2-9-13.5-12.1-20.1-5.5l-74.4 74.4-67.9-11.3L334 98.9l74.4-74.4c6.6-6.6 3.4-17.9-5.7-20.2-47.4-11.7-99.6.9-136.6 37.9-28.5 28.5-41.9 66.1-41.2 103.6l82.1 82.1c8.1-1.9 16.5-2.9 24.7-2.9zm-103.9 82l-56.7-56.7L18.7 402.8c-25 25-25 65.5 0 90.5s65.5 25 90.5 0l123.6-123.6c-7.6-19.9-9.9-41.6-5-62.7zM64 472c-13.2 0-24-10.8-24-24 0-13.3 10.7-24 24-24s24 10.7 24 24c0 13.2-10.7 24-24 24z"></path></svg> Home tab</span> of the administration interface:
</p>

Click on `Download all scenes`.

The download should take a few seconds.

The exported Zip file has the following structure:

```
scenes/
├── scene1/
│   ├── scene.svx.json
│   ├── models/
│   │   ├── scene1.glb
│   ├── articles/
│   │   ├── article1-fr.html
│   │   ├── article1-en.html
│   ├── scene-image-high.jpg
│   ├── scene-image-low.jpg
│   ├── scene-image-medium.jpg
│   ├── scene-image-thumb.jpg
├── scene2/
  [...]
```


### See also

[Configuration options](configuration)