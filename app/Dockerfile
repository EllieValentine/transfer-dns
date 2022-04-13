FROM node:14-alpine

WORKDIR /app

RUN apk update
RUN apk add bind-tools

COPY ./package*.json ./

RUN npm install

COPY ./src .

