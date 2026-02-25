FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/crypto/package.json packages/crypto/
RUN npm install

COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY packages/crypto/ packages/crypto/
COPY apps/web/ apps/web/

ARG VITE_SERVER_URL=http://localhost:3000
ARG VITE_WS_URL=ws://localhost:3000
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build --workspace=packages/types
RUN npm run build --workspace=packages/crypto
RUN npm run build --workspace=apps/web

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
