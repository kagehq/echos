FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages
COPY packages ./packages
COPY apps/daemon ./apps/daemon

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build SDK
RUN pnpm --filter @echoshq/sdk build

WORKDIR /app/apps/daemon

EXPOSE 3434

CMD ["pnpm", "dev"]

