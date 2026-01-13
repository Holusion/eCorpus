

################### 
# Build source
###################
FROM node:22-slim AS build
RUN mkdir -p /app/dist /app/source
WORKDIR /app

COPY source/server/package*.json /app/source/server/
RUN (cd /app/source/server && npm ci  --no-fund --no-audit )

COPY source/voyager/package*.json /app/source/voyager/
RUN (cd /app/source/voyager && npm ci --legacy-peer-deps  --no-fund --no-audit )

COPY source/ui/package*.json /app/source/ui/
RUN (cd /app/source/ui && npm ci  --no-fund --no-audit )

COPY ./package*.json /app/
RUN npm ci --no-fund --no-audit 


COPY source/server /app/source/server
RUN npm run build-server
# outputs files in /app/source/server/dist

COPY source/voyager /app/source/voyager
COPY source/ui /app/source/ui
RUN npm run build-ui
# outputs files in /app/dist



################### 
# The actual container to be published
###################
FROM node:22-slim
LABEL org.opencontainers.image.source=https://github.com/Holusion/eCorpus
LABEL org.opencontainers.image.description="eCorpus base image"
LABEL org.opencontainers.image.documentation="https://ecorpus.eu"
LABEL org.opencontainers.image.vendor="Holusion SAS"
LABEL org.opencontainers.image.licenses="Apache-2.0"

ARG PORT
ARG PUBLIC
ARG BUILD_REF

ENV PUBLIC=${PUBLIC:-false}
ENV PORT=${PORT:-8000}
ENV BUILD_REF=${BUILD_REF}

ENV NODE_ENV=production


WORKDIR /app
COPY source/server/package*.json /app/
#might occasionally fail if the prebuilt version can't be downloaded, 
# because it can't rebuild it locally
RUN npm ci --omit=dev --no-fund --no-audit 

COPY ./source/server/migrations /app/migrations
COPY ./source/server/templates /app/templates


COPY --from=build /app/dist /app/dist
COPY --from=build /app/source/server/dist /app/server

VOLUME [ "/app/files" ]
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD [ "node", "server/healthcheck.js" ]

CMD [ "node", "--disable-proto=delete", "server/index.js" ]
