# HRMS — Production MongoDB Auth Setup

This directory contains everything you need to bring up a **secure,
authenticated** MongoDB for the HRMS backend in production. It does **not**
touch the running preview environment.

```
deploy/
├── README.md                       ← this file
├── backend.env.example             ← template for backend/.env (prod)
├── mongo/
│   ├── mongod.conf                 ← production mongod config
│   ├── docker-compose.yml          ← single-node Mongo 7.0 with auth
│   ├── init-users.js               ← user provisioning (manual)
│   ├── init-users-prod.js          ← user provisioning (auto, via docker)
│   ├── SECRETS.env.example         ← copy → SECRETS.env, then fill in
│   └── (SECRETS.env)               ← created by you, DO NOT COMMIT
└── scripts/
    ├── rotate-mongo-password.sh    ← rotate a user's password
    └── backup-mongo.sh             ← authenticated daily backup
```

## Generated credentials

Strong random passwords have already been generated and stored in
`mongo/SECRETS.env.example`. **Move this file to `SECRETS.env` and keep it
out of git** — `.gitignore` already excludes any `SECRETS.env`.

| Role | Username | Auth DB | Purpose |
|------|----------|---------|---------|
| Root | `hrmsRoot` | `admin` | Cluster admin, ops only |
| App  | `hrmsApp` | `hrms_prod` | Used by the FastAPI backend |
| Read | `hrmsReadonly` | `hrms_prod` | Backups, BI, analytics |

---

## Path A — Docker / Docker-Compose (recommended)

This is the easiest path. You get an authenticated MongoDB plus all
three users on the very first start.

### 1. Prepare secrets

```bash
cd /app/deploy/mongo
cp SECRETS.env.example SECRETS.env
# (optional) edit SECRETS.env if you want different passwords
```

### 2. Bring up MongoDB

```bash
cd /app/deploy/mongo
docker compose --env-file SECRETS.env up -d
docker compose logs -f mongo   # wait until you see "Waiting for connections"
```

What just happened:

- `mongo:7.0` started with `--auth --bind_ip_all`.
- The official entrypoint created the **root user** from
  `MONGO_INITDB_ROOT_USERNAME / PASSWORD`.
- It then ran `init-users-prod.js`, which created the **app** and
  **readonly** users on the `hrms_prod` database.
- Port 27017 is bound to `127.0.0.1` only on the host — clients on the
  internet cannot reach it. The backend reaches Mongo over the internal
  docker network as host `mongo`.

### 3. Verify

```bash
# As app user (what the backend will use)
docker compose exec mongo mongosh \
  -u hrmsApp -p "$MONGO_APP_PASS" \
  --authenticationDatabase hrms_prod hrms_prod \
  --eval 'db.runCommand({ ping: 1 })'

# Unauthenticated attempts must fail:
docker compose exec mongo mongosh --quiet \
  --eval 'db.getSiblingDB("hrms_prod").users.findOne()'
# → "command find requires authentication"  ✅
```

### 4. Point the HRMS backend at it

```bash
cp /app/deploy/backend.env.example /app/backend/.env       # on the prod host
# Then paste this line from SECRETS.env:
#   MONGO_URL=mongodb://hrmsApp:...@mongo:27017/hrms_prod?authSource=hrms_prod...
```

Restart the backend (`sudo supervisorctl restart backend` or your
compose service). It should boot normally and log
`Database indexes created`.

---

## Path B — Bare-metal / VM (no Docker)

Use this when you install MongoDB directly on a Linux host (apt/yum).

### 1. Install Mongo 7.0

```bash
wget -qO- https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-7.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-7.gpg] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

### 2. Provision users (one-time, BEFORE enabling auth)

Mongo allows a **localhost exception** for the very first user. Use it.

```bash
# A) Put real passwords into the init script
sed -i "s|<<REPLACE_WITH_ROOT_PASS>>|H789mhaK29rbCxngEyWa1z0CyakP9ioW|"  /app/deploy/mongo/init-users.js
sed -i "s|<<REPLACE_WITH_APP_PASS>>|82bFEurwV5Qjl2sgfOG3QTeydC4nSmys|"   /app/deploy/mongo/init-users.js
sed -i "s|<<REPLACE_WITH_READ_PASS>>|ovIoXETUC3lYwo0oHtZpXn9pdnVvrFM0|"  /app/deploy/mongo/init-users.js

# B) Run it against the unauthenticated mongod
mongosh --quiet --file /app/deploy/mongo/init-users.js
```

### 3. Enable authorization & restart

```bash
sudo cp /app/deploy/mongo/mongod.conf /etc/mongod.conf
sudo systemctl restart mongod
```

From now on every connection must authenticate.

### 4. Update the backend

Same as Path A step 4: copy `backend.env.example` to `/app/backend/.env`
and paste the `MONGO_URL` line from `SECRETS.env`. Restart the backend.

---

## Sanity-checks & ops

### Confirm the backend connection string is correct

```bash
python3 - <<'PY'
import os, asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    print(await c.admin.command('ping'))
    print('Collections:', await c[os.environ['DB_DATABASE']].list_collection_names())

asyncio.run(main())
PY
```

### Rotate a password

```bash
/app/deploy/scripts/rotate-mongo-password.sh hrmsApp NewStrongPass123!
```

### Take an authenticated backup

```bash
/app/deploy/scripts/backup-mongo.sh
# → /var/backups/hrms-mongo/<UTC-timestamp>/hrms_prod/*.bson.gz
```

### Restore a backup

```bash
mongorestore \
  --host mongo --port 27017 \
  --username hrmsRoot --password "$MONGO_ROOT_PASS" \
  --authenticationDatabase admin \
  --gzip --drop \
  /path/to/backup-folder
```

---

## Hardening checklist (production)

- [ ] `security.authorization: enabled` in `mongod.conf` ✓ (set by us)
- [ ] `bindIp` restricted to private IPs only (never `0.0.0.0` on a public host)
- [ ] Firewall: allow 27017 ONLY from backend hosts
- [ ] TLS enabled (`net.tls.mode: requireTLS`) with a real certificate
- [ ] Backend connects as **`hrmsApp`**, never as root
- [ ] `SECRETS.env` is `chmod 600`, owned by root, NEVER committed
- [ ] Backups run daily via cron and are stored off-host
- [ ] Rotate passwords at least every 90 days using the rotate script
- [ ] (Replica set) `keyFile` configured, `security.keyFile: /etc/mongo/mongo-keyfile`
- [ ] Monitor `slowOpThresholdMs` logs and adminCommand({ serverStatus: 1 })

---

## Quick reference — connection strings

```
Backend (app):
  mongodb://hrmsApp:<APP_PASS>@<HOST>:27017/hrms_prod?authSource=hrms_prod

Ops / migrations (root):
  mongodb://hrmsRoot:<ROOT_PASS>@<HOST>:27017/admin?authSource=admin

Backups / read-only (reporting):
  mongodb://hrmsReadonly:<READ_PASS>@<HOST>:27017/hrms_prod?authSource=hrms_prod&readPreference=secondaryPreferred
```
