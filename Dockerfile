FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
COPY app ./app
COPY runtime ./runtime
COPY types ./types

RUN mkdir -p /opt/exidus-docs /app/.data/sessions

ENV HOST=0.0.0.0
ENV PORT=3000
ENV EXIDUS_DOCS_ROOT=/opt/exidus-docs
ENV EXIDUS_DATA_ROOT=/app/.data
ENV EXIDUS_PUBLIC_DIR=/app/app/public

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "app/start.ts"]
