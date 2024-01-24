---
title:  Installation rapide
---

# Déploiement d'une instance eCorpus

 > cette section requiers une certaine familiarité avec des outils de développement usuels : [git](https://git-scm.com/), [npm](https://docs.npmjs.com/).

### Installation rapide

Exemple de création d'une instance minimale à des fins de tests:

    git clone --filter=blob:none --recurse-submodules git@github.com:Holusion/eCorpus
    cd eCorpus
    npm i
    (cd source/voyager && npm i --legacy-peer-deps)
    (cd source/server && npm i)
    (cd source/ui && npm i)
    npm run build-ui
    npm run build-server
    npm start

 > Voir aussi: installation via docker

Dans un navigateur, chargez [localhost:8000](http://localhost:8000).


### Création du premier compte utilisateur

L'application se lance initialement en "mode ouvert", vous permettant la création d'un premier compte utilisateur en ligne de commande.

Après avoir démarré votre serveur local, ouvrez un autre terminal et exécutez la commande suivante:

    curl -XPOST -H "Content-Type: application/json" -d '{"username":"<...>", "password":"<...>", "email":"<...>", "isAdministrator": true}' "http://localhost:8000/api/v1/users"

Par la suite, d'autres comptes pourront être créés via l'interface web.

### Aller plus loin

Rendez-vous à l'adresse [localhost:8000](http://localhost:8000) et connectez-vous à l'aide de votre nouveau compte.

Vous pouvez maintenant [créer votre première scène](/fr/doc/tutorials/voyager/import).

Si vous souhaitez éditer le code source, réferez-vous au [guide de développement](/fr/doc/guides/development).

Pour configurer votre nouvelle instance, consultez la [documentation de configuration](/fr/doc/references/administration/configuration).
