# Stage 1: Build stage
FROM node:22-alpine AS builder

# Install pnpm (package manager) globally
RUN npm install -g pnpm@11.11.0

# Set working directory for the application
WORKDIR /app

# Copy configuration files first
COPY package.json pnpm-workspace.yaml tsconfig.json tsup.config.ts ./

# Install dependencies (including devDependencies)
RUN pnpm install

# Copy the source code
COPY src/ ./src/

# Build the application
RUN pnpm run build


# Remove development dependencies to reduce size
RUN pnpm prune --prod

# Stage 2: Production stage
FROM node:22-alpine AS production

# Set working directory in the final image
WORKDIR /app

# Copy necessary files from the builder stage: production node_modules, build output, and package definition
COPY --from=builder /app/node_modules ./node_modules

# Copy only the necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json


# Expose SMTP ports (standard SMTP, SMTPS, and alternative ports)
EXPOSE 25 465 587 2465 2587


# Run the SMTP server
CMD ["node", "dist/server.js"]
