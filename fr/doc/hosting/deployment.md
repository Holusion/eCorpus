---
title:  Installation rapide
rank: 0
---

## Installation rapide


Création d'une instance minimale à des fins de tests (nécessite [Docker](https://docs.docker.com)):

```bash
docker compose -f oci://ghcr.io/holusion/e-corpus:app up
```

si la gestion des artefacts OCI ne fonctionne pas sur votre système, copiez le fichier [docker-compose.yml](#exemple-de-fichier-compose) ci-dessous.


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

### Exemple de fichier compose

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


### Mise en place d'un proxy inverse

eCorpus ne gère pas les terminaisons SSL. Pour utiliser le service en HTTPS, il est nécessaire de le placer derrière un _reverse proxy_.

Dans la plupart des cas on pourra utiliser la configuration par défaut du service choisi en vérifiant la présence de deux en-têtes: `X-Forwarded-Host` et `X-Forwarded-Proto`, nécessaires au bon fonctionnement d'eCorpus. La configuration `TRUST_PROXY` d'eCorpus doit aussi être activée.

Il est parfois aussi nécessaire d'augmenter la directive `client_max_body_size` (ou équivalent) pour accomoder des téléversements volumineux.

Exemple de configuration NGINX fonctionelle:

```
server {
  listen 80;
  listen [::]:80;
  server_name  your.domain.com;
  
  location / {
    return 301 https:// your.domain.com$request_uri;
  }
}

server {
  server_name your.domain.com;

  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  add_header Content-Security-Policy "upgrade-insecure-requests;";

  # Handle SSL certificates here

  autoindex off;


  client_max_body_size 100M;
  proxy_buffering off;

  
  location = /robots.txt {
    log_not_found off;
    access_log off;
  }

  location / {
    #Proxy settings
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
    proxy_pass http://localhost:8000;
  }
}
```


## Installation sans Docker

eCorpus peut être exécuté en dehors d'un conteneur si les utilitaires nécessaires sont présents et qu'un accès à une base de données `PosgreSQL` est configuré.

### Configuration de la base de données

Une base de données PostgreSQL (`>= 15`) est nécessaire. La connexion à la base de données doit être configurée via la variable d'environnement `DATABASE_URI`, 

Alternativement, l'ensemble `PGHOST`, `PGPORT`, `PGUSER` (par défaut `$USER`), `PGDATABASE` (par défaut `$USER`) et `PGPASSWORD` (par défaut vide) peut être utilisé.

La viariable DATABASE_URI peut inclure toutes les options de connexion à la base de données :

```
postgresql://user:password@localhost:5432/mydatabase
# Authentification par certificats SSL :
postgres://host.docker.internal:5432/mydatabase?user=myuser&sslmode=verify-full&sslrootcert=/path/to/ca.pem&sslcert=/path/to/client-cert.pem&sslkey=/path/to/client-key.pem"
# ou via un socket Unix
socket:///var/run/postgresql/?db=mydatabase
```


### Utiliser la dernière release

Voir la liste des [releases](https://github.com/Holusion/eCorpus/releases/) sur GitHub.

```bash
curl -XGET -L https://github.com/Holusion/eCorpus/releases/download/v0.1.0/eCorpus-v0.1.0.zip
unzip eCorpus.zip
cd eCorpus
npm i --omit=dev
npm start
```

Eventuellement, configurer un service systemd pour exécuter l'application en arrière-plan:

```
[Unit]
Description=Ecorpus instance
After=network.target

[Service]
WorkingDirectory=/path/to/eCorpus
ExecStart=npm start

[Install]
WantedBy=default.target
```

Voir la documentation des [variables d'environnement](/fr/doc/hosting/configuration) pour plus de détails sur la configuration de l'instance.

### Installer depuis la branche de développement

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
