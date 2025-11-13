

################### 
# Build source
###################
FROM node:22-slim AS build
RUN mkdir -p /app/dist /app/source
WORKDIR /app

COPY source/server/package*.json /app/source/server/
RUN (cd /app/source/server && npm ci)

COPY source/voyager/package*.json /app/source/voyager/
RUN (cd /app/source/voyager && npm ci --legacy-peer-deps)

COPY source/ui/package*.json /app/source/ui/
RUN (cd /app/source/ui && npm ci)

COPY ./package*.json /app/
RUN npm ci


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
LABEL org.opencontainers.image.licenses=Apache

ARG PORT
ARG PUBLIC
ARG BUILD_REF

ENV PUBLIC=${PUBLIC:-false}
ENV PORT=${PORT:-8000}
ENV BUILD_REF=${BUILD_REF}

ENV NODE_ENV=production

#Install dependencies
RUN apt -qqy update && apt -qqy install  --no-install-recommends \
  ocl-icd-libopencl1 \
  xz-utils \
  ca-certificates \
  curl &&\
  ln -s libOpenCL.so.1 /usr/lib/x86_64-linux-gnu/libOpenCL.so &&\
  rm -rf /var/lib/apt/lists/* /var/tmp/*

#Install blender
RUN curl -fsSL -o "/tmp/blender.tar.xz" "https://download.blender.org/release/Blender4.5/blender-4.5.4-linux-x64.tar.xz" &&\
    mkdir -p /usr/local/lib/blender /usr/local/bin &&\
    tar -xf "/tmp/blender.tar.xz" -C /usr/local/lib/blender --strip-components=1 &&\
    ln -s /usr/local/lib/blender/blender /usr/local/bin/blender &&\
    rm -rf /tmp/*

#Instal ktx-software
RUN curl -fsSL -o "/tmp/ktx-software.deb" "https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.deb" &&\
  dpkg -i /tmp/ktx-software.deb &&\
  rm -rf /tmp/*

WORKDIR /app
COPY source/server/package*.json /app/
#might occasionally fail if the prebuilt version can't be downloaded, 
# because it can't rebuild it locally
RUN npm ci --omit=dev

COPY ./source/server/migrations /app/migrations
COPY ./source/server/templates /app/templates


COPY --from=build /app/dist /app/dist
COPY --from=build /app/source/server/dist /app/server

VOLUME [ "/app/files" ]
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD [ "node", "server/healthcheck.js" ]

CMD [ "node", "--disable-proto=delete", "server/index.js" ]
