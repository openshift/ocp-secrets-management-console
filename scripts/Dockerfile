# Dockerfile for running CRD type generation scripts
# Uses minimal dependencies - no Cypress or other heavy packages
FROM node:24-alpine

WORKDIR /app

# Install only the dependencies needed for scripts
RUN npm install -g ts-node typescript && \
    npm install js-yaml @types/js-yaml @types/node

# Create non-root user (default in image). When running, use -u $$(id -u):$$(id -g)
# so the process runs as the host user and written files are owned by you.
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy scripts and config
COPY scripts/*.ts ./scripts/
COPY crd-sources.json ./
COPY scripts/tsconfig.json ./

# Create output directories and set ownership
RUN mkdir -p crds src/generated/crds && \
    chown -R appuser:appgroup /app

USER appuser

# Default command
CMD ["sh", "-c", "echo 'Use: fetch-crds, generate-types, or update-types'"]
