# Stage 1: Build the Vite React Application
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies (leverage layer cache)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source code and build production assets
COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Stage 2: Serve static bundle with unprivileged Nginx (UID 10001)
FROM nginx:alpine

# Create non-root unprivileged service user and group (UID 10001)
RUN addgroup -g 10001 appgroup && \
    adduser -u 10001 -G appgroup -s /bin/sh -D appuser

# Replace default Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy compiled SPA bundle from build stage
COPY --from=build --chown=appuser:appgroup /app/dist /usr/share/nginx/html

# Prepare temporary directories and logs with permissions for non-root execution
RUN mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp && \
    chown -R appuser:appgroup /tmp /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    chmod -R 770 /tmp

USER 10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
