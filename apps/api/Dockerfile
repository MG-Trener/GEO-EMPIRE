FROM node:24-alpine AS build
WORKDIR /app

COPY apps/api/package.json ./package.json
RUN npm install

COPY apps/api/tsconfig.json ./tsconfig.json
COPY apps/api/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY apps/api/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]
