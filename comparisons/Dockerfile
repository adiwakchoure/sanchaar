FROM node:16
WORKDIR /app
COPY server.js package.json ./
RUN npm install
HEALTHCHECK --interval=10s --timeout=5s --retries=3   CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
