FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts ./

EXPOSE 1883 8080

CMD ["bun", "run", "server.ts"]
