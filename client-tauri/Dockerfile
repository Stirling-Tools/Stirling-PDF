# Use an existing image as a base
FROM node:22.2.0-alpine

WORKDIR /app

RUN npm i -g serve

COPY ./dist ./dist

EXPOSE 3000

CMD [ "serve", "-s", "dist" ]