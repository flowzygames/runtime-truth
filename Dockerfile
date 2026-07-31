FROM node:22-alpine AS runtime

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["check", "."]
