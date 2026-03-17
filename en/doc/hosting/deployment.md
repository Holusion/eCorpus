---
title: Quick Installation
rank: 0
---


## Quick Installation

Creating a test instance of eCorpus using docker can be done by running this command: 

```bash
docker compose -f oci://ghcr.io/holusion/e-corpus:app up
```

Open a browser and navigate to [localhost:8000](http://localhost:8000){:target="_blank"} to access the eCorpus instance.

### Creating the first user account

When the application is launched, it is in "open mode", which allows you to create a first user account via the command line. To create an account, open another terminal and run the following command:

```bash
curl -XPOST -H "Content-Type: application/json" \
-d '{
  "username":"<...>", 
  "password":"<...>",
  "email":"<...>",
  "level": "admin"
}' "http://localhost:8000/users"
```

 > Replace `<...>` with your desired username, password, and email address.

Other accounts can then be created via the web interface.

### Going further

After creating your first user account, navigate to [http://localhost:8000](http://localhost:8000){:target="_blank"} and log in. 

From there, you can [create your first scene](/en/doc/tutorials/).

If you want to edit the source code, refer to the [development guide](/en/doc/hosting/development). Or configure your instance by tuning the [environment variables](/en/doc/hosting/configuration).

To use your instance in production, you might want to set up email forwarding (allows account recovery and invite links), automated backups and an HTTPS reverse-proxy. You may also contact [Holusion](https://holusion.com) to buy a full-featured managed **eCorpus** instance.


## Advanced installation

Copy and edit this base compose file:

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

## Install without Docker

eCorpus can just as easily run outside docker by connecting to an external `PostgreSQL` database.
eCorpus can be executed outside a container if the required utilities are present and you have access to a `PostgreSQL` database.

### Database configuration

A PostgreSQL database (`>= 15`) is required. The database connection must be configured via the `DATABASE_URI` environment variable.

Alternatively, the set `PGHOST`, `PGPORT`, `PGUSER` (defaults to `$USER`), `PGDATABASE` (defaults to `$USER`) and `PGPASSWORD` (defaults to empty) can be used.

The `DATABASE_URI` variable may include all connection options, for example:

```
postgresql://user:password@localhost:5432/mydatabase
# SSL certificate authentication example:
postgres://host.docker.internal:5432/mydatabase?user=myuser&sslmode=verify-full&sslrootcert=/path/to/ca.pem&sslcert=/path/to/client-cert.pem&sslkey=/path/to/client-key.pem
# or via a Unix socket
socket:///var/run/postgresql/?db=mydatabase
```

### Use the latest release

See the list of [releases](https://github.com/Holusion/eCorpus/releases/) on GitHub.

```bash
curl -XGET -L https://github.com/Holusion/eCorpus/releases/download/v0.1.0/eCorpus-v0.1.0.zip
unzip eCorpus.zip
cd eCorpus
npm i --omit=dev
npm start
```

Optionally, configure a `systemd` service to run the application in the background:

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

See the documentation of [environment variables](/en/doc/hosting/configuration) for more details on instance configuration.

### Install from the development branch

```bash
git clone --filter=blob:none --recurse-submodules https://github.com/Holusion/eCorpus
cd eCorpus
npm i # install project-wide dependencies
(cd source/voyager && npm i --legacy-peer-deps) # install DPO-Voyager's dependency
(cd source/server && npm i) # install server build dependencies
(cd source/ui && npm i) # install ui-specific dependencies
npm run build-ui # build the client JS bundle
npm run build-server # Transpile the server down to javascript
npm start # start your new eCorpus instance
```
