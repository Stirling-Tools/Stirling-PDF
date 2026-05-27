# Single-EC2 Quickstart - "just give me Docker on a VM"

The fastest possible AWS deployment when you don't want managed services. **Good
for ≤25 concurrent users on a single beefy VM**. Past that, jump to the
CloudFormation or Terraform option which scales horizontally.

## What you get

- One EC2 instance running 2 Stirling app containers, 1 Valkey, 1 Postgres,
  1 nginx LB - exactly the validated `validation/compose.test.yml` topology
- ~$25-40/month for a `t3.large`
- 5-minute deploy

## Steps

### 1. Launch an EC2 instance

- AMI: Amazon Linux 2023 (or Ubuntu 22.04 LTS)
- Instance type: `t3.large` (2 vCPU, 8 GB RAM) minimum
- Storage: 30 GB gp3
- Security group: open `80/tcp` (and `22/tcp` for SSH)
- IAM role: none needed

### 2. SSH in and install Docker

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# new shell so the group takes effect
exit
```

(On Ubuntu: `sudo apt install -y docker.io docker-compose-plugin git`.)

### 3. Pull the compose stack

```bash
git clone https://github.com/Stirling-Tools/Stirling-PDF.git
cd Stirling-PDF
git checkout v2.11.0
```

### 4. Set secrets and start

```bash
export CLUSTER_ENGINE_SHAREDSECRET=$(openssl rand -hex 16)
export STIRLING_VALKEY_PASSWORD=$(openssl rand -hex 16)
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
docker compose -f docker/compose/docker-compose-cluster.yml up -d --build
```

Wait ~2 min for the apps to come up:

```bash
until curl -fsS http://localhost:8080/api/v1/info/status | grep -q UP; do sleep 5; done
echo OK
```

### 5. Open it

`http://<EC2 public IP>/`

### 6. (Optional) HTTPS

Slap Caddy or Traefik in front, or use AWS ALB pointing at the EC2 instance.
Easiest is Caddy:

```bash
docker run -d --name caddy --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v caddy_data:/data \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  caddy
```

with a tiny `Caddyfile`:

```
stirling.yourdomain.com {
  reverse_proxy host.docker.internal:8080
}
```

Caddy fetches a Let's Encrypt cert automatically.

## Backups

- **Postgres**: `docker exec stirling-postgres pg_dump -U stirling stirling > backup-$(date +%F).sql`
  Cron this and ship to S3 with `aws s3 cp`.
- **Valkey**: state is short-TTL (job status, rate-limit counters); no backup
  needed - losing it on restart just means in-flight async jobs need re-running.

## Tear-down

`docker compose -f docker/compose/docker-compose-cluster.yml down -v` then
terminate the EC2 instance.

## Limits of this path

- Single point of failure (one VM)
- Manual scaling: edit `app-3`/`app-4` services into the compose file, restart
- No autoscaling
- No managed-service backups for Valkey
- nginx LB runs on the same VM as the apps

If any of these matter, use the CloudFormation or Terraform option in this
directory instead.
