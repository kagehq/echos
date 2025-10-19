FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages
COPY packages ./packages
COPY apps/dashboard ./apps/dashboard

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build dashboard
WORKDIR /app/apps/dashboard
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]

