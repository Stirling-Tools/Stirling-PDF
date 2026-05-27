# AWS deployment - Stirling-PDF clustered

Three paths, ordered by ease-of-use:

| Path | Best for | Time-to-live | Monthly cost (us-east-1) | Scales? |
|---|---|---|---|---|
| **1. CloudFormation one-click** | Enterprise self-host, no Kubernetes | ~15 min | ~$120-160 | Yes (ECS autoscaling) |
| **2. Terraform module** | Your SaaS, env-promotable, GitOps | ~20 min first time | ~$120-160 | Yes (ECS autoscaling) |
| **3. EC2 + Docker Compose** | ≤25 concurrent users, single VM, dead simple | ~5 min | ~$25-40 | No (one VM) |

Already have a Kubernetes cluster (EKS)? Use the existing
[`deploy/helm/stirling-pdf/`](../helm/stirling-pdf/) chart instead of any of
these.

## What each deploys

All three deliver the same logical topology: **N Stirling app instances behind
a load balancer, sharing a Valkey backplane and a Postgres database**, with
`/internal/*` blocked at the LB.

```
            Internet
                │
                ▼
       ┌────────────────┐
       │  ALB / nginx   │  ←── blocks /internal/*
       └────────────────┘
            │       │
            ▼       ▼
       ┌────────────────┐
       │  app-1   app-2 │  ←── CLUSTER_ENABLED=true
       └────────────────┘       CLUSTER_BACKPLANE=valkey
         │            │
         ▼            ▼
     Valkey       Postgres
   (ElastiCache)    (RDS)
```

### Sticky sessions are required

Every LB config in this repo (`ip_hash` in nginx, `lb_cookie` on the ALB,
`affinity: cookie` on the k8s ingress) is pinning sessions deliberately, not as
an optimisation. Result PDFs are written to the local disk of whichever node
ran the job; without affinity a download has a ~50% chance of landing on a
non-owner node and getting a 410 Gone. Cookie / IP affinity pins a returning
client back to the owner pod. If you fork an LB config, keep the stickiness.

**Heads-up on `ip_hash` (nginx Docker Compose path only):** `ip_hash` collapses
every client sharing a source IP onto the same backend. Behind a corporate VPN,
CGNAT, or a single egress NAT this means all of those users hammer one app
container while the others sit idle. The Compose path is fine for small
deployments (the doc above caps it at 25 concurrent users on one VM), but for
diverse client populations move to cookie-based affinity (nginx-plus or the
openresty sticky-cookie module) or use one of the managed LB paths above
- the ALB / k8s Ingress configs in this directory already use cookie stickiness
for exactly this reason.

The only thing that changes between paths is **who manages Valkey and Postgres**:

| Path | App tasks | Valkey | Postgres | LB |
|---|---|---|---|---|
| CloudFormation | ECS Fargate | ElastiCache for Valkey | RDS PostgreSQL | ALB |
| Terraform | ECS Fargate | ElastiCache for Valkey | RDS PostgreSQL | ALB |
| EC2 Compose | Docker on one EC2 | Docker container | Docker container | nginx (Docker) |

## Path 1 - CloudFormation (recommended for enterprises)

The template no longer accepts plaintext passwords as parameters - that pattern leaked
secrets into the rendered stack template, CloudTrail events, and the template S3 bucket
even with `NoEcho`. Operators pre-create the password secrets and pass their ARNs:

```bash
DB_SECRET_ARN=$(aws secretsmanager create-secret \
  --name stirling/db-password \
  --secret-string "$(openssl rand -base64 24)" \
  --query ARN --output text)

VALKEY_SECRET_ARN=$(aws secretsmanager create-secret \
  --name stirling/valkey-auth \
  --secret-string "$(openssl rand -hex 32)" \
  --query ARN --output text)

aws cloudformation deploy \
  --stack-name stirling-pdf \
  --template-file cloudformation/stirling-pdf-aws.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      DbSecretArn=$DB_SECRET_ARN \
      ValkeyAuthSecretArn=$VALKEY_SECRET_ARN
```

The X-Engine-Auth token is generated *inside* Secrets Manager by CloudFormation - the
operator never sees or supplies it. After deploy it can be retrieved with
`aws secretsmanager get-secret-value --secret-id <stack-name>-engine-secret`.

Or click-deploy via the AWS console: **Console → CloudFormation → Create stack
→ Upload `cloudformation/stirling-pdf-aws.yaml` → fill the 2 ARN params**.

The stack output `AppUrl` gives you the URL.

**Knobs you can change in the parameters:**

| Param | Default | Notes |
|---|---|---|
| `AppCount` | 2 | Initial Fargate task count; autoscaling can grow to 10 |
| `AppCpu` | 1024 (1 vCPU) | Per task |
| `AppMemory` | 4096 MiB | Per task |
| `EnableAiEngine` | false | Turn on if using AI features |
| `AppImage` | `stirlingtools/stirling-pdf:2.11.0` | Pinned to release. Swap for your own ECR URI or newer tag |
| `EngineImage` | `stirlingtools/stirling-pdf-ai-engine:2.11.0` | Same |
| `DbSecretArn` | (required) | ARN of pre-created Secrets Manager secret holding the Postgres password |
| `ValkeyAuthSecretArn` | (required) | ARN of pre-created Secrets Manager secret holding the Valkey AUTH token |

**Tear-down:** `aws cloudformation delete-stack --stack-name stirling-pdf`. RDS
keeps a final snapshot for safety.

## Path 2 - Terraform (recommended for your SaaS)

```bash
cd terraform
cat > terraform.tfvars <<EOF
name                 = "stirling-prod"
region               = "us-east-1"
app_count            = 3
db_password          = "$(openssl rand -base64 24)"
engine_shared_secret = "$(openssl rand -hex 32)"
valkey_auth_token    = "$(openssl rand -hex 32)"
EOF
terraform init
terraform apply
```

The ElastiCache replication group runs with TLS in flight (`rediss://`) and AUTH enabled.
`valkey_auth_token` is required - the application connects with `REDIS_PASSWORD` populated
from Secrets Manager so a compromised pod cannot sweep the keyspace.

Tearing down: `terraform destroy`.

The Terraform module is intentionally a **single file** to keep it easy to
fork. For real production you'd split into `modules/{vpc,ecs,rds,elasticache,alb}`
and have a separate `envs/{dev,staging,prod}/main.tf` referencing them. Both
shapes work; the single file is the starting point.

## Path 3 - EC2 + Docker Compose

See [`quickstart/ec2-compose.md`](quickstart/ec2-compose.md).

## EKS + Helm (for k8s shops)

The Phase 1 implementation already ships a Helm chart:

```bash
# Assumes you already have an EKS cluster
helm install stirling deploy/helm/stirling-pdf/ \
  --set cluster.engineSharedSecret=$(openssl rand -hex 32) \
  --set image.repository=<your-ecr-uri>/stirling-pdf
```

The chart includes a Valkey StatefulSet by default. To use ElastiCache instead:

```bash
helm install stirling deploy/helm/stirling-pdf/ \
  --set cluster.valkey.bundled=false \
  --set cluster.valkey.externalUrl=redis://your-elasticache:6379 \
  ...
```

## Required AWS permissions (for whoever runs the deploy)

Minimum set to apply the CloudFormation/Terraform:

- `ec2:*`, `elasticloadbalancing:*` (VPC + ALB)
- `ecs:*`, `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:PutRolePolicy`,
  `iam:PassRole`
- `elasticache:*`
- `rds:*`
- `secretsmanager:*`
- `logs:CreateLogGroup`, `logs:PutRetentionPolicy`
- `application-autoscaling:*`
- `cloudformation:*` (CFN only)

Easiest: run as a user with `PowerUserAccess` for the initial bootstrap, then
narrow down with IAM Access Analyzer after the stack is up.

## Sizing rules of thumb

| Concurrent users | App tasks | App size | Valkey | Postgres |
|---|---|---|---|---|
| ≤25 | 2 | 1 vCPU / 4 GB | cache.t4g.small | db.t4g.micro |
| 25-100 | 3 | 2 vCPU / 4 GB | cache.t4g.small | db.t4g.small |
| 100-500 | 4-6 | 2 vCPU / 8 GB | cache.t4g.medium | db.t4g.medium |
| 500+ | 6+ (autoscale) | 2 vCPU / 8 GB | cache.r7g.large + replica | db.t4g.large + read replica |

The defaults in the templates suit ≤25 users; bump `AppCount` /
`InstanceClass` to grow.

## What you still need to set up yourself

These are not in the templates because they're customer-specific:

- **Custom domain + HTTPS.** ALB listener on port 443 with an ACM cert (5-min
  console wizard) + a Route 53 A-record alias to the ALB.
- **Email (SES) for password reset / invitations.**
- **OAuth/SAML identity provider.** Stirling supports Keycloak, Okta, Azure
  AD, Google - config goes in `settings.yml`.
- **Backups for Valkey.** Optional - ElastiCache supports daily snapshots; turn
  on `SnapshotRetentionLimit` in the template if you want. Phase 1 state in
  Valkey is short-TTL so most operators skip it.
- **Frontend CDN.** Not required; the app serves static assets fine. If you
  want CloudFront, point it at the ALB and cache `/static/*`.

## Common questions

**Why ECS Fargate, not EKS?** Fargate has zero cluster management - no
control plane to maintain. EKS gets cheaper at scale but adds k8s ops. For
most enterprises Fargate is the right default.

**Why ElastiCache for Valkey and not just Redis?** Valkey is the Linux
Foundation's BSD-licensed Redis fork; AWS ElastiCache has supported it natively
since 2024. Same wire protocol. Stirling's `LettuceConnectionFactory` doesn't
care which one - pick whichever your security team is happier with.

**Why RDS Postgres and not Aurora?** Aurora costs ~3× more for the same TPS in
this workload (mostly cold reads for user/team tables). Switch to Aurora if
you need read replicas + DR; t4g.micro covers the small-tenant case.

**What if I want to use my company's existing Postgres / Redis?** Run only
the ECS part of the CloudFormation by setting `SPRING_DATASOURCE_URL` and
`CLUSTER_VALKEY_URL` in the task definition to point at your
existing endpoints. The template doesn't currently expose those as parameters
- easy fork.

**My ops team wants Pulumi / CDK / Crossplane.** All three speak the same
underlying APIs the CloudFormation template uses. Translate from the YAML -
the resource graph is identical.
