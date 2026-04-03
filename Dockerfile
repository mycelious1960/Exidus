FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
COPY app ./app
COPY runtime ./runtime
COPY types ./types

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "app/start.ts"]
