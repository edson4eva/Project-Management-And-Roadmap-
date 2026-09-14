FROM node:22-alpine

WORKDIR /app

# Dependencies first, so a client-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js db.js ./
COPY public ./public

# Cloud Run requires the container to listen on 8080 and bind 0.0.0.0.
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
