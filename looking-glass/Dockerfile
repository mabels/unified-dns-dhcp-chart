# Multi-stage Dockerfile for Looking Glass
# Stage 1: Build frontend with Node.js 22
# Stage 2: Runtime with Deno serving both API and static files

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Update npm to version 11
RUN npm install -g npm@11

# Copy frontend package files
COPY frontend/package.json ./

# Install dependencies (generates lockfile with npm 11)
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Runtime with Deno
FROM denoland/deno:latest

WORKDIR /app

# Copy backend source
COPY backend/ ./backend/

# Cache all Deno dependencies (including native libraries like sqlite3)
# This prevents runtime downloads and significantly speeds up container startup
RUN deno cache --reload backend/main.ts

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data

# Create a simple server that serves both API and static files
RUN echo '#!/bin/sh\nexec deno run --allow-all backend/main.ts' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV DB_PATH=/data/leases.db

# Run the server
CMD ["/app/entrypoint.sh"]
