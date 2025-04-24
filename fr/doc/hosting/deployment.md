---
title:  Installation rapide
rank: 0
---

## Installation rapide

 > Cette section requiers une certaine familiarité avec des outils de développement usuels : [git](https://git-scm.com/){:target="_blank"}, [npm](https://docs.npmjs.com/){:target="_blank"}.

Exemple de création d'une instance minimale à des fins de tests :


```bash
git clone --filter=blob:none --recurse-submodules https://github.com/Holusion/eCorpus
cd eCorpus
npm i
(cd source/voyager && npm i --legacy-peer-deps)
(cd source/server && npm i)
(cd source/ui && npm i)
npm run build-ui
npm run build-server
npm start
```
 > Voir aussi : installation via docker

Dans un navigateur, chargez [localhost:8000](http://localhost:8000){:target="_blank"}.


### Création du premier compte utilisateur

L'application se lance initialement en "mode ouvert", vous permettant la création d'un premier compte utilisateur en ligne de commande.

Après avoir démarré votre serveur local, ouvrez un autre terminal et exécutez la commande suivante :

```bash
curl -XPOST -H "Content-Type: application/json" -d '{"username":"<...>", "password":"<...>", "email":"<...>", "isAdministrator": true}' "http://localhost:8000/users"
```

> Remplacez <...> par votre nom d'utilisateur, votre mot de passe et votre adresse électronique.

Par la suite, d'autres comptes pourront être créés via l'interface web.

### Aller plus loin

Rendez-vous à l'adresse [localhost:8000](http://localhost:8000){:target="_blank"} et connectez-vous à l'aide de votre nouveau compte.

À partir de là, vous pouvez [créer votre première scène](/fr/doc/tutorials).

Si vous souhaitez éditer le code source, réferez-vous au [guide de développement](/fr/doc/hosting/development).

Pour configurer votre nouvelle instance, consultez la [documentation de configuration](/fr/doc/hosting/configuration).
