FROM node:18-alpine

WORKDIR /app

RUN apk update
RUN apk add bind-tools

COPY ./package*.json ./

RUN npm install

COPY ./src .

