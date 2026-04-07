# PLAYWRIGHT_VERSION must match the version in package-lock.json
ARG PLAYWRIGHT_VERSION=1.49.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
COPY ./package*.json /app/
RUN npm ci
COPY . /app

ENTRYPOINT ["npm", "test", "--"]
CMD ["npm", "test"]
