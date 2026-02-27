FROM node:22-slim AS build
# Build artifacts from sources
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

FROM node:22-slim AS utilities
# Fetch utilities that needs to be included

#Install dependencies
RUN apt-get -qqy update && apt-get -qqy install  --no-install-recommends \
  xz-utils lbzip2 \
  ca-certificates \
  curl \
  && rm -rf /var/lib/apt/lists/* /var/tmp/*

#Install ktx
RUN curl -fsSL -o "/tmp/KTX-Software-Linux-x86_64.tar.bz2" "https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2"\
  && tar -xf "/tmp/KTX-Software-Linux-x86_64.tar.bz2" -C /usr/local/ --strip-components=1 \
  && rm -rf /tmp/*

FROM node:22-slim
# Build the distributed container
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

#Install additional runtime dependencies
RUN apt-get -qqy update && apt-get -qqy install  --no-install-recommends \
  ocl-icd-libopencl1 \
  && ln -s libOpenCL.so.1 /usr/lib/x86_64-linux-gnu/libOpenCL.so\
  && rm -rf /var/lib/apt/lists/* /var/tmp/*

COPY --from=utilities /usr/local/lib /usr/local/lib
COPY --from=utilities /usr/local/bin /usr/local/bin


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
