# Self-Hosting Echos

Deploy Echos to production using Docker, VPS, or cloud platforms.

**Components:**
- **Dashboard** - Nuxt.js frontend
- **Daemon** - Node.js policy engine
- **Database** - Supabase (PostgreSQL + Auth)

**Prerequisites:** Node.js 18+ or Docker, Supabase account, domain (optional)

---

## Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  daemon:
    build: ./apps/daemon
    ports: ["3434:3434"]
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - ECHOS_CORS_ORIGIN=${CORS_ORIGIN}
    restart: unless-stopped

  dashboard:
    build: ./apps/dashboard
    ports: ["3000:3000"]
    environment:
      - NUXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NUXT_PUBLIC_SUPABASE_KEY=${SUPABASE_ANON_KEY}
      - DAEMON_URL=http://daemon:3434
    depends_on: [daemon]
    restart: unless-stopped
```

Create `.env`:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key
CORS_ORIGIN=https://yourdomain.com
```

Deploy:

```bash
docker-compose up -d
```

<details>
<summary>Dockerfiles (expand)</summary>

`apps/daemon/Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm --filter @echos/sdk build
WORKDIR /app/apps/daemon
EXPOSE 3434
CMD ["pnpm", "dev"]
```

`apps/dashboard/Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm --filter @echos/dashboard build
WORKDIR /app/apps/dashboard
EXPOSE 3000
CMD ["pnpm", "start"]
```

</details>

---

## VPS Deployment

**1. Install & Build:**

```bash
cd apps/daemon && pnpm install
cd ../../packages/sdk && pnpm build
cd ../../apps/daemon && cp env.example .env
# Edit .env with production values

npm install -g pm2
pm2 start "pnpm dev" --name echos-daemon
pm2 save && pm2 startup
```

**2. Dashboard:**

```bash
cd apps/dashboard && pnpm install
cp env.example .env && pnpm build
pm2 start "pnpm start" --name echos-dashboard
pm2 save
```

**3. Nginx + HTTPS:**

```nginx
# /etc/nginx/sites-available/echos
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://localhost:3434;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/echos /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## Cloud Platforms

**Railway / Render / Fly.io:**

Deploy as two separate services:

- **Daemon**: Build: `pnpm install && pnpm --filter @echoshq/sdk build`, Start: `pnpm --filter @echos/daemon dev`
- **Dashboard**: Build: `pnpm install && pnpm --filter @echos/dashboard build`, Start: `pnpm --filter @echos/dashboard start`

**Vercel** (Dashboard only):
```bash
cd apps/dashboard && vercel
```
Deploy daemon separately.

---

## Environment Variables

**Daemon:**
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
ECHOS_CORS_ORIGIN=https://yourdomain.com
```

**Dashboard:**
```bash
NUXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=your-anon-key  # NOT service key
DAEMON_URL=https://api.yourdomain.com
```

---

## Database

**Supabase Cloud:**
1. Create project at [supabase.com](https://supabase.com)
2. SQL Editor → Run `supabase/migrations/20241019000000_consolidated_schema.sql`
3. Copy keys from Settings → API

**Self-hosted:**
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker && cp .env.example .env
docker-compose up -d
```

---

## Security

**Essential:**
- [ ] Use HTTPS (Let's Encrypt/Cloudflare)
- [ ] Set `ECHOS_CORS_ORIGIN` to your domain (not `*`)
- [ ] Use **anon key** in dashboard, **service key** in daemon
- [ ] Never commit `.env` files

**Firewall:**
```bash
sudo ufw allow 22/tcp 80/tcp 443/tcp && sudo ufw enable
```

---

## Maintenance

**Updates:**
```bash
git pull && pnpm install && pnpm build
pm2 restart all  # or: docker-compose up -d
```

**Logs:**
```bash
pm2 logs echos-daemon           # PM2
docker-compose logs -f daemon   # Docker
tail -f /var/log/nginx/error.log
```

**Database migrations:** Run new files from `supabase/migrations/` in SQL Editor

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dashboard can't connect | Check `DAEMON_URL`, CORS, firewall. Test: `curl https://api.yourdomain.com/scopes` |
| WebSocket fails | Ensure nginx/proxy supports upgrade headers |
| RLS errors | Use **anon key** in dashboard, verify policies enabled |

[Discord Support](https://discord.gg/KqdBcqRk5E) • [GitHub Issues](https://github.com/kagehq/echos/issues)

