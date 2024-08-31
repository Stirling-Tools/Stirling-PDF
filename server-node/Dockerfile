# Use an existing image as a base
FROM node:22.2.0-alpine

RUN apk add --no-cache git

WORKDIR /app

ENV NODE_ENV production

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY ./dist ./dist

RUN apk del git

EXPOSE 8000

CMD [ "node", "./dist/index.js" ]