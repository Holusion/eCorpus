---
title: Quick Installation
rank: 0
---


## Quick Installation

> This section requires some familiarity with some common development tools like [git](https://git-scm.com/){:target="_blank"}, [npm](https://docs.npmjs.com/){:target="_blank"} or [curl](https://curl.se/){:target="_blank"}.

In this guide, we will walk you through the creation of a barebones instance of eCorpus for testing purposes.

Start by cloning the repository. It can be a bit large so a [partial clone](https://git-scm.com/docs/git-clone#Documentation/git-clone.txt-code--filterltfilter-specgtcode) might speed things up if supported by your git version:
```bash
git clone --filter=blob:none --recurse-submodules https://github.com/Holusion/eCorpus
```

then go into the created `eCorpus` folder and run the following commands:
```bash
npm i #install project-wide dependencies
(cd source/voyager && npm i --legacy-peer-deps) #install DPO-Voyager's dependency
(cd source/server && npm i) #install server build dependencies
(cd source/ui && npm i) #install ui-specific dependencies
npm run build-ui #build the client JS bundle
npm run build-server #Transpile the server down to javascript
npm start #start your new eCorpus instance
```

> Note: A Docker container is also available _via_ the [github container registry](https://github.com/Holusion/eCorpus/pkgs/container/e-corpus)

After completing the above steps, open a browser and navigate to [localhost:8000](http://localhost:8000){:target="_blank"} to access the eCorpus instance.

### Creating the first user account

When the application is launched, it is in "open mode", which allows you to create a first user account via the command line. To create an account, open another terminal and run the following command:

```bash
curl -XPOST -H "Content-Type: application/json" \
-d '{
    "username":"<...>", 
    "password":"<...>",
    "email":"<...>",
    "isAdministrator": true
}' "http://localhost:8000/users"
```

 > Replace `<...>` with your desired username, password, and email address.

Other accounts can then be created via the web interface in [http://localhost:8000/ui/admin/users](http://localhost:8000/ui/admin/users){:target="_blank"}.

### Going further

After creating your first user account, navigate to [http://localhost:8000](http://localhost:8000){:target="_blank"} and log in. 

From there, you can [create your first scene](/en/doc/tutorials/).

If you want to edit the source code, refer to the [development guide](/en/doc/hosting/development). Or configure your instance by tuning the [environment variables](/en/doc/hosting/configuration).

To use your instance in production, you might want to setup email forwarding (allows account recovery and invite links), automated backups an HTTPS reverse-proxy. You may also contact [Holusion](https://holusion.com) to buy a full-featured managed **eCorpus** instance.
