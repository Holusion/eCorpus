
FROM node:16-alpine as build
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
FROM node:16-alpine
LABEL org.opencontainers.image.source=https://github.com/Holusion/e-thesaurus
LABEL org.opencontainers.image.description="eCorpus base image"
LABEL org.opencontainers.image.licenses=Apache

ARG PORT=8000

ENV PUBLIC=false
ENV PORT=${PORT}
ENV NODE_ENV=production

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

CMD node server/index.js
