# The API. The same image runs the migrations as a one-off:
#   docker compose run --rm api node db/migrate.js
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Never root inside the container. The official image ships this user.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
