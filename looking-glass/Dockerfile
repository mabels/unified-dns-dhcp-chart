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

# Stage 2: Build backend with Node.js
FROM node:22-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Stage 3: Runtime with Node.js
FROM node:22-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN cd backend && npm ci --only=production

# Copy backend compiled code
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Copy Drizzle migrations
COPY --from=backend-builder /app/backend/drizzle ./backend/drizzle

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory
RUN mkdir -p /data

# Set environment variables
ENV PORT=3000
ENV DB_PATH=/data/leases.db
ENV STATIC_DIR=./frontend/dist
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Run the server
CMD ["node", "backend/dist/index.js"]
