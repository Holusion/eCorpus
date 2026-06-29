


# Initialization

## Create the first user

As long as no user exist, the application launches in "open" mode. An unauthenticated request can be used to create the first user : 

```
curl -XPOST -H "Content-Type: application/json" -d '{"username":"<...>", "password":"<...>", "email":"<...>", "level": "admin"}' "http://<hostname>:<port>/users"
```

Then restart the application to enable permissions management

## Authenticating requests

An API request resolves its identity, in order, from:

1. `Authorization: Bearer ecorpus_…` — a revocable, optionally scoped API token
   (create one under *User settings → tokens*, or `POST /auth/tokens`). Preferred
   for services and long-lived integrations.
2. `Authorization: Basic <user:password>` — the user's own password. Convenient
   for ad-hoc scripts and `curl`:

   ```
   curl -u "<username>:<password>" "http://<hostname>:<port>/auth/"
   ```

   Basic auth is a stateless re-login: it grants the user's full authority, mints
   no session cookie, and is verified on every request. Password verification is
   aggressively per-IP rate-limited (like `POST /auth/login`), so prefer a token
   for high-volume or automated use.
3. the `session` cookie minted by `POST /auth/login` — used by the web UI.

## Deployment

Local (testing): *from the project's root*

    npm run build-server
    npm start

Deployment: 

    docker buid . -t ethesaurus
    docker run --rm -it --port 8000:8000 --volume "$(pwd)/files:/app/files" --name ethesaurus ethesaurus
