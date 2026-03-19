FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY data ./data

ENV PORT=4000
ENV SQLITE_PATH=/app/data/app.db

EXPOSE 4000

CMD ["node", "server/index.js"]
