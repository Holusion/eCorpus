---
title:  User administration
description: Managing your users
rank: 6
---

# Managing your users

When logged in as administrator, an **administration** tab appears in the navigation bar. If the tab doesn't appear, ask another administrator to check that your role is "administrator".

Find the user management tool in the <span>
    <svg width=24 xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960"><path d="m667 936-10-66q-17-5-34.5-14.5T593 834l-55 12-25-42 47-44q-2-9-2-25t2-25l-47-44 25-42 55 12q12-12 29.5-21.5T657 600l10-66h54l10 66q17 5 34.5 14.5T795 636l55-12 25 42-47 44q2 9 2 25t-2 25l47 44-25 42-55-12q-12 12-29.5 21.5T731 870l-10 66h-54ZM80 892v-94q0-35 17.5-63t50.5-43q72-32 133.5-46T400 632h23q-21 51-19 134.5T438 892H80Zm614-77q36 0 58-22t22-58q0-36-22-58t-58-22q-36 0-58 22t-22 58q0 36 22 58t58 22ZM400 571q-66 0-108-42t-42-108q0-66 42-108t108-42q66 0 108 42t42 108q0 66-42 108t-108 42Z"></path></svg>Users tab</span> of your administration interface. It lets you create, modify and delete users.

- To **add a new user**, use the "Create" button at the top right of the page. 

- To **generate quick login links**  use the  <svg width="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960"><path d="M280 640.614q-26.846 0-45.73-18.884-18.884-18.884-18.884-45.73 0-26.846 18.884-45.73 18.884-18.884 45.73-18.884 26.846 0 45.73 18.884 18.884 18.884 18.884 45.73 0 26.846-18.884 45.73-18.884 18.884-45.73 18.884Zm0 155.385q-91.538 0-155.768-64.231-64.23-64.23-64.23-155.768t64.23-155.768q64.23-64.231 155.768-64.231 64.307 0 116.307 33.193 52 33.192 79.384 86.807h360.078L935.767 576 781.923 729.075l-74.23-55.769-76.154 56.538-78.076-53.845h-77.772q-27.384 53.23-79.384 86.615T280 795.999ZM280 736q57.539 0 99.654-34.769 42.115-34.77 54.961-85.231h137.694l57.615 39.846 78.154-57.153L776 650.615 850.616 576l-40-40H434.615q-12.846-50.461-54.961-85.231Q337.539 416 280 416q-66 0-113 47t-47 113q0 66 47 113t113 47Z"></path></svg> button on the right of each user. The quick login link for this user is copied in the clipboard.

- To **modify the role**  of a user, use the dropdown on the corresponding line. See the [summary tables](#summary-tables) below for the details of permissions granted by each role (user, creator, manager, administrator).

- To **delete users**, use the <svg xmlns="http://www.w3.org/2000/svg" width="24" viewBox="0 0 448 512"><path d="M192 188v216c0 6.627-5.373 12-12 12h-24c-6.627 0-12-5.373-12-12V188c0-6.627 5.373-12 12-12h24c6.627 0 12 5.373 12 12zm100-12h-24c-6.627 0-12 5.373-12 12v216c0 6.627 5.373 12 12 12h24c6.627 0 12-5.373 12-12V188c0-6.627-5.373-12-12-12zm132-96c13.255 0 24 10.745 24 24v12c0 6.627-5.373 12-12 12h-20v336c0 26.51-21.49 48-48 48H80c-26.51 0-48-21.49-48-48V128H12c-6.627 0-12-5.373-12-12v-12c0-13.255 10.745-24 24-24h74.411l34.018-56.696A48 48 0 0 1 173.589 0h100.823a48 48 0 0 1 41.16 23.304L349.589 80H424zm-269.611 0h139.223L276.16 50.913A6 6 0 0 0 271.015 48h-94.028a6 6 0 0 0-5.145 2.913L154.389 80zM368 128H80v330a6 6 0 0 0 6 6h276a6 6 0 0 0 6-6V128z"></path></svg> button of the corresponding line. 

<img src="/assets/img/doc/UserManagement_en.jpg" width ="900" alt="user management interface" />


## User permissions according to their roles

### Scene rights
For an authenticated user, the rights on a scene can be (from lowest to highest) :
- none
- read
- write
- administration

The effective rights of a user is the highest among :
* Default access (for connected users) of a scene,
* Individual user rights on a scene,
* Group rights on a scene, if the user is a member of a group.
  
See the scene page and the [scene permissions](../tutorials/import#manage-scene-permissions) documentation to edit those rights.

### Summary tables
#### Permissions on scenes

| **User role :** 	               | Anonymous 	| User 	| Creator 	| Editor 	| Administrator 	|
|------------------------------------------|:-------:	|:-----------:	|:------:	 |:--------: | :-------------: |
| See scene page / View in voyager / Download scene  /| According to public access of the scene	| According to **read** scene rights 	| According to **read** scene rights 	| According to **read** scene rights 	| ✅ 	 	|
| See scene rights 	| ❌ 	| According to **read** scene rights 	| According to **read** scene rights 	| According to **read** scene rights 	| ✅ 		|
| Edit in voyager	| ❌ 	| According to **write** scene rights 	| According to **write** scene rights 	| According to **write** scene rights 	| ✅ 		|
| Add and remove Tags	| ❌ 	| According to **write** scene rights 	| According to **write** scene rights 	| According to **write** scene rights 	| ✅ 		|
| Upload files in existing scene | ❌ 	| According to **write** scene rights 	| According to **write** scene rights 	| According to **write** scene rights 	| ✅ 	|
| Rename a scene	| ❌ 	| According to **administration** scene rights 	| According to **administration** scene rights 	| According to **administration** scene rights 	| ✅ 		|
| Access scene history and revert changes	| ❌ 	| According to **administration** scene rights 	| According to **administration** scene rights 	| According to **administration** scene rights 	| ✅ 	|
| Edit scene access rights 	| ❌ 	| According to **administration** scene rights 	| According to **administration** scene rights 	| According to **administration** scene rights 	| ✅ 		|
| Archive a scene 	| ❌ 	| According to **administration** scene rights 	| According to **administration** scene rights 	| According to **administration** scene rights 	| ✅ 	|
| Restore / Delete archived scene	| ❌ 	| ❌ 	| ❌ 	| ❌ 	| ✅ 	|
| Create a scene	| ❌ 	| Non 	| ✅ 	| ✅ 	| ✅ 	|
| Upload files in a new scene	| ❌ 	| Non 	| ✅ 	| ✅ 	| ✅ 	|
| See tag collection (*) | Filtered according to public access | Filtered according to **read** scene rights | Filtered according to **read** scene rights | Filtered according to **read** scene rights 	| ✅ |

(*) Collection are visible if at least one of their scenes is visible.

#### Permissions on user and groups                    

| **User role :**                                                            	| Anonymous 	| User 	| Creator  	| Editor 	| Administrator                          	|
|-------------------------------------------------------------------------------------	|:--------: |:------------: | :-------: | :--------:	|:----------------------------------------:	|
| List Users                                                             	| ❌       	| ❌           	| ❌         	| ✅       	| ✅                                       	|
| Create / Edit / Delete / Connection Link Users 	| ❌       	| ❌           	| ❌         	| ❌       	| ✅* (restricted on its own account) 	|
| See a group                                                                    	| ❌       	| If group member	| If group member 	| ✅       	| ✅                                       	|
| List / Create / Add and remove members to Groups               	| ❌       	| ❌           	| ❌         	| ✅       	| ✅                                       	|
| Delete Groups                                                               	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|
| Get stats and config                                      	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|
| Send tests emails / connection email                                 	| ❌       	| ❌           	| ❌         	| ❌       	| ✅                                       	|