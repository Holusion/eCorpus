---
title:  Installation rapide
rank: 0
---

## Installation rapide


Création d'une instance minimale à des fins de tests (nécessite [Docker](https://docs.docker.com)):

```bash
docker compose -f oci://ghcr.io/holusion/e-corpus:app up
```

Dans un navigateur, chargez [localhost:8000](http://localhost:8000){:target="_blank"}.


### Création du premier compte utilisateur

L'application se lance initialement en "mode ouvert", vous permettant la création d'un premier compte utilisateur en ligne de commande.

Après avoir démarré votre serveur local, ouvrez un autre terminal et exécutez la commande suivante :

```bash
curl -XPOST -H "Content-Type: application/json" -d '{"username":"<...>", "password":"<...>", "email":"<...>", "level": "admin"}' "http://localhost:8000/users"
```

> Remplacez `<...>` par votre nom d'utilisateur, votre mot de passe et votre adresse électronique.

Par la suite, d'autres comptes pourront être créés via l'interface web.

### Aller plus loin

Rendez-vous à l'adresse [localhost:8000](http://localhost:8000){:target="_blank"} et connectez-vous à l'aide de votre nouveau compte.

À partir de là, vous pouvez [créer votre première scène](/fr/doc/tutorials).

Si vous souhaitez éditer le code source, réferez-vous au [guide de développement](/fr/doc/hosting/development).

Pour configurer votre nouvelle instance, consultez la [documentation de configuration](/fr/doc/hosting/configuration).

## Installation avancée

Pour personnaliser l'installation, copier et éditer le fichier `docker-compose.yml` suivant:

```yaml
name: eCorpus
services:
  postgres:
    image: postgres:17
    restart: always
    shm_size: 128mb
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres} #change if it is ever susceptible to be externally accessible
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 1s
      timeout: 5s
      retries: 10
    volumes:
      - postgres_data:/var/lib/postgresql/data/
  app:
    image: ghcr.io/holusion/e-corpus:main
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URI: postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-postgres}
    healthcheck:
      interval: 1s
      timeout: 5s
      retries: 10
    volumes:
      - app_data:/app/files
volumes:
  postgres_data:
  app_data:
```


## Installation sans Docker

eCorpus peut être exécuté en dehors d'un conteneur si les utilitaires nécessaires sont présents et qu'un accès à une base de données `PosgreSQL` est configuré.

```bash
git clone --filter=blob:none --recurse-submodules https://github.com/Holusion/eCorpus
cd eCorpus
npm i #install project-wide dependencies
(cd source/voyager && npm i --legacy-peer-deps) #install DPO-Voyager's dependency
(cd source/server && npm i) #install server build dependencies
(cd source/ui && npm i) #install ui-specific dependencies
npm run build-ui #build the client JS bundle
npm run build-server #Transpile the server down to javascript
npm start #start your new eCorpus instance
```
