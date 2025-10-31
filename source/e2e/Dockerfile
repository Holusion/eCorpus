FROM node:22-slim

WORKDIR /app

COPY ./package*.json /app/
RUN npm ci
RUN npx playwright install  --with-deps

COPY . /app

ENTRYPOINT ["npm", "test", "--"]
CMD ["npm", "test"]