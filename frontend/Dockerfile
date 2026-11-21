# Dashboard: build with Node, serve the static files with Nginx on port 3000.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js ./
COPY src src
RUN npm run build

FROM nginx:1.30-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949
# nginx only serves files: drop curl (and libcurl) instead of patching them; brotli-libs stays (freetype needs it).
# shortcut: these upgrades unpin single packages; remove each once a Dependabot digest bump ships brotli >= 1.2.1 and libexpat >= 2.10.0.
RUN apk del --no-cache curl && apk upgrade --no-cache brotli-libs libexpat
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
