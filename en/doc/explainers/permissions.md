---
title: Scene privacy
description: Access rights, public or private visibility, and user groups
rank: 1
---

# Scene privacy

An eCorpus scene is not necessarily visible to everyone. Depending on the settings you choose, it can be open to all visitors, reserved for people who have an account on the database, or on the contrary invisible except for the few people you explicitly authorise.

This guide answers three questions, in this order:

* **Who can open the scene?** That is the visibility question: public, restricted to connected users, or private.
* **Who can modify it?** That is the rights question: read, write, administration.
* **How do I authorise one particular person?** By adding their account directly to the scene, or by going through a group of users.

The settings described here are available to anyone holding the **administration** right on the scene. Creating groups and managing accounts depend on your role on the eCorpus instance (see [user administration](../advancedUses/userAdministration.html)).

### Table of contents

* [Changing a scene's privacy settings](#changing-a-scenes-privacy-settings)
* [The three levels of visibility](#the-three-levels-of-visibility)
* [The four user rights](#the-four-user-rights)
* [Granting access to a specific user](#granting-access-to-a-specific-user)
* [Using groups](#using-groups)
* [The effective right is the highest one](#the-effective-right-is-the-highest-one)
* [Errors and frequently asked questions](#errors-and-frequently-asked-questions)

## Changing a scene's privacy settings

The settings live on the scene **Settings** page.

<img src="/assets/img/doc/Confidentialite_01_en.png" width="100%" alt="Settings page of a scene, access rights section" />

1. Open the scene from your list of scenes.
2. Click **Settings** in the scene toolbar, or click the scene name. The page address ends with `/settings`.
3. Look for the **Access rights** section: it is the table shown below.

<img src="/assets/img/doc/Confidentialite_02_en.png" width="100%" alt="Access rights table: public access, default access, groups, users" />

The table reads from top to bottom:

* two general settings rows, **Public access** and **Default access**;
* the **groups** holding a specific right on this scene, with the **Add group** form;
* the **users** holding a specific right on this scene, with the **Add user** form.

If you only have the *read* or *write* right on the scene, the section is displayed read-only: values are visible, but without selectors. That is expected: the *administration* right is required to change rights.

Two of these settings depend on each other: **default access** cannot be more restrictive than **public access**. If public access is set to *read*, the *none* option is greyed out for default access; and if default access is set to *none*, it is the *read* option that is greyed out for public access. In that case, change the blocking row first, then come back to the other one.

## The three levels of visibility

| Visibility | Public access | Default access | Who can open the scene? |
|---|---|---|---|
| **Public** | read | none, read or write | everyone, without an account |
| **Connected users** | none | read or write | anyone connected to the database |
| **Private** | none | none | only specific rights (users and groups) |

### A public scene

**Public access** is set to **read**.

The scene opens for anyone, without an account and without signing in.

This is the setting to use once the scene is ready to be published, for instance in a collection reachable from the home page.

The scene can then also be embedded in a web page through the [oEmbed](../tutorials/embed.html) protocol, or reused by a third-party application through its [API](../hosting/api.html).

Public access can never go beyond read: anonymous visitors cannot be allowed to modify a scene.

<img src="/assets/img/doc/Confidentialite_03_en.png" width="450" alt="Public badge and open padlock on a scene open to everyone" />

The **Public** badge means public access is open: the scene is visible without an account. The **open** padlock means connected users can at least view it.

### A scene restricted to connected users

**Public access** is set to **none** and **default access** to **read** (or **write**).

A visitor who is not signed in sees nothing: the link leads to a 404 error. On the other hand, anyone holding an account on the eCorpus database can see the scene once signed in, if they wish to.

This is the right setting for internal databases, for teaching projects where every student has an account, or for scenes you want to show to a whole institution without publishing them on the internet. Be careful: "every account" means every account, including accounts created for other projects on the same database.

It is also the right choice when a server is dedicated to one team and there is no confidentiality issue between the collaborators.

<img src="/assets/img/doc/Confidentialite_04_en.png" width="450" alt="Private badge and open padlock on a scene restricted to connected users" />

Here the **Private** badge means public access is closed: a visitor who is not signed in sees nothing. The padlock stays **open** because connected users can view the scene. This is the "restricted to connected users" case.

### A private scene

**Public access** is set to **none** and **default access** to **none**.

Nobody can see the scene, except the users and groups you have granted a specific right to.

This is the right setting for a scene being prepared, and the only one that guarantees a scene stays invisible until you decide otherwise, even for the other users of the server.

<img src="/assets/img/doc/Confidentialite_05_en.png" width="450" alt="Private badge and closed padlock on a fully private scene" />

The **closed** padlock means that even connected users have no default right: only specific rights open the scene. This is the truly private case.

In short: the badge is about access **without an account**, the padlock is about access **with an account**.

## The four user rights

Rights granted to a user or a group run from the weakest to the strongest:

| Right | View the scene | Modify its content | Manage rights, tags and history |
|---|:---:|:---:|:---:|
| **none** | no | no | no |
| **read** | yes | no | no |
| **write** | yes | yes | no |
| **administration** | yes | yes | yes |

A few useful details:

* **read** gives access to the scene page, the Voyager viewer, articles, annotations, guided tours, and downloading the scene.
* **write** adds everything that concerns content: editing models, annotations, articles, tours, adding or removing tags, uploading files.
* **administration** adds management of the scene itself: renaming, archiving, viewing and restoring its history, and above all changing access rights. Someone with administration on a scene can therefore open that scene to others, or close it again.

The full breakdown, right by right and role by role, is in the [summary tables](../advancedUses/userAdministration.html#summary-tables) of the user administration page.

The same rights are available differently depending on the setting:

| Setting | Possible values | Applies to |
|---|---|---|
| **Public access** | none, read | visitors without an account |
| **Default access** | none, read, write | every person connected to the database |
| **A user's right** | none, read, write, administration | one named account |
| **A group's right** | none, read, write, administration | every member of the group |

Two asymmetries are worth remembering:

* **public access** only offers *none* and *read*: an anonymous visitor can never write;
* **default access** does not offer *administration*: opening rights management to every account on the database would be dangerous; that responsibility is therefore only given to identified people or groups.

## Granting access to a specific user

Adding a specific right serves two purposes: **opening** a private scene to someone, or **raising** their rights beyond the default (for instance giving write access to a single person in a database where everyone else only reads).

### Adding a user

1. In the **Access rights** section, scroll down to the **Add user** form.
2. Type the person's **username** in the field provided.
3. Pick the right to grant in the neighbouring dropdown: **read**, **write** or **administration**.
4. Click the **+** button.

### Changing or removing an individual right

For each listed user, the dropdown on their row changes the right: *read*, *write* or *administration*. The change applies at once.

To remove a specific right entirely, choose **remove specific access** in that same dropdown.

## Using groups

### Why use a group

A group grants a right once to a set of accounts, and then lets you change the composition of that set without revisiting every scene.

A group therefore ties two things together: **members** (accounts) and **scenes**, sharing one access level.

### Creating a group

<img src="/assets/img/doc/Confidentialite_06_en.png" width="100%" alt="Group management in the administration interface" />

1. Open **Administration**, then **Groups**.
2. Type the new group's name in the field at the top right, next to the **+** button.
3. Click **+**.

To delete a group, use the bin icon on its row. Deleting removes the group and its rights on scenes.

### Adding members to the group

<img src="/assets/img/doc/Confidentialite_07_en.png" width="100%" alt="A group page: members and authorised scenes" />

1. Click the group name in the list.
2. In the **Group Members** section, type the username in the field, then click **+**.
3. Repeat for each person. The bin icon on a row removes the member from the group.

### Attaching scenes to the group

Still on the group page, the **Access rights** section lists the scenes the group is attached to, with the corresponding right.

1. Type the scene name in the field provided for that purpose, then choose the right (*read*, *write* or *administration*).
2. Validate: the scene is added to the list.
3. To change the right of a scene already listed, use the dropdown on its row.
4. To detach a scene, choose **remove specific access**.

Every member of the group then gets that right on the scene, with no action on their part.

### Attaching a group from the scene

The reverse operation exists:

1. Open the scene **Settings**, **Access rights** section.
2. In the **Add group** form, type the name of an existing group and choose the right.
3. Click **+**.

The group then appears in the scene's groups table. The group must already exist: if the name matches no group, the addition fails. There is no way to create a group on the fly from this screen.

Both paths write exactly the same information: attaching a scene from the group page, or attaching a group from the scene page, comes down to the same thing.

## The effective right is the highest one

One user can accumulate several sources of rights on the same scene:

* **public access**, when they browse the scene without being signed in;
* **default access**, because they hold an account;
* the rights of the **groups** they belong to;
* a possible **individual right**.

The **highest right** is therefore the one retained, whatever the number of sources.

## Errors and frequently asked questions

**The scene returns a 404 error although it exists.** The scene probably exists, but the visitor has no right on it: eCorpus does not distinguish a forbidden scene from an absent one. Check public access, default access, and any individual or group right that person may have.

**I added a user, but the + button does nothing.** The username is probably rejected, because it matches no account or is not spelled as in the database (upper case and accents do not count). Check under **Administration** then **Users**.

**The read option is greyed out in public access.** Default access is set to *none*. Set it to *read* first, then come back to public access.

**The none option is greyed out in default access.** Public access is set to *read*. Set public access back to *none* first.

**I gave someone administration; can they remove my rights?** Yes: administration of a scene includes managing that scene's rights, including yours. Only grant this level to trusted people, and keep at least one active administrator on every important scene.

**I do not see the Access rights section, or it is read-only.** You do not have the *administration* right on the scene. A scene administrator must grant it to you.

**Does a private scene appear in collections and search?** No, not for visitors without access. Collections and search results are filtered according to the rights of the person browsing: a private scene only appears for those who can open it.

**Does deleting a user remove their rights?** Yes, their individual rights and their group memberships disappear with the account. However, removing a member from a group does not delete their account, and deleting a group does not delete the accounts of its members.
