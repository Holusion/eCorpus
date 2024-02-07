---
title: Quick Installation
---


## Quick Installation

> This section requires some familiarity with common development tools: [git](https://git-scm.com/){:target="_blank"}, [npm](https://docs.npmjs.com/){:target="_blank"}.

This section provides an example of creating a minimal instance of eCorpus for testing purposes. To do so, follow these steps:

<!-- 1. Clone the eCorpus repository using the following command:
    ```
    git clone --filter=blob:none --recurse-submodules git@github.com:Holusion/eCorpus
    ```
2. Navigate to the eCorpus directory:
    ```
    cd eCorpus
    ```
3. Install the required dependencies:
    ```
    npm i
    (cd source/voyager && npm i --legacy-peer-deps)
    (cd source/server && npm i)
    (cd source/ui && npm i)
    ```
4. Build the user interface and server:
    ```
    npm run build-ui
    npm run build-server
    ```
5. Start the server:
    ```
    npm start
    ``` -->

    git clone --filter=blob:none --recurse-submodules git@github.com:Holusion/eCorpus
    cd eCorpus
    npm i
    (cd source/voyager && npm i --legacy-peer-deps)
    (cd source/server && npm i)
    (cd source/ui && npm i)
    npm run build-ui
    npm run build-server
    npm start
    
> Note: For an alternative installation method using Docker, refer to the installation documentation.

After completing the above steps, open a browser and navigate to [localhost:8000](http://localhost:8000){:target="_blank"} to access the eCorpus instance.

### Creating the first user account

When the application is launched, it is in "open mode", which allows you to create a first user account via the command line. To create an account, follow these steps:

Start your local server.

Open another terminal and run the following command:
    
    curl -XPOST -H "Content-Type: application/json" -d '{"username":"<...>", "password":"<...>", "email":"<...>", "isAdministrator": true}' "http://localhost:8000/api/v1/users"
    
Replace `<...>` with your desired username, password, and email address.
Other accounts can be created via the web interface.

### Going further

After creating your first user account, navigate to [localhost:8000](http://localhost:8000){:target="_blank"} and log in. 

From there, you can [create your first scene](/en/doc/tutorials/voyager/edit) by following the instructions provided in the [Voyager import tutorial](/en/doc/tutorials/voyager/import).

If you want to edit the source code, refer to the [development guide](/en/doc/guides/developpement).

To configure your new instance, consult the [configuration documentation](/en/doc/references/administration/configuration).
