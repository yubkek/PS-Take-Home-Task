# Deployment design (AWS)

Sized for one recruiting team: tens of users, a few thousand candidates, and low steady traffic. Region `ap-southeast-2` (Sydney), for low latency to Sydney users and to keep stored candidate data in Australia.

```
Browser
   │  HTTPS
   v
CloudFront ──── /*      ──> S3 (Angular build, private bucket)
   │
   └─────────── /api/*  ──> Application Load Balancer
                                  │
                                  v
                            ECS Fargate (Express container)
                              │              │
                              v              v
                        RDS PostgreSQL   Anthropic API
                                         (key from Secrets Manager)
```

## Components

| Service | Role | Why |
| --- | --- | --- |
| S3 + CloudFront | Hosts the Angular build; routes `/api/*` to the backend | One domain, so no CORS. Private bucket, read through origin access control. |
| ECS Fargate | Runs the API, one 0.25 vCPU / 0.5 GB task, two for availability | A plain container, no servers to patch. Lambda would also work, but summary calls can take many seconds and a container needs no code change. |
| Application Load Balancer | TLS and health checks | Can also enforce sign-in through OIDC, which gives login without changing the app. |
| RDS PostgreSQL (`db.t4g.micro`) | Replaces SQLite | Fargate storage is temporary and SQLite cannot be shared between tasks. Encrypted, with automated backups. |
| Secrets Manager | Anthropic API key and database credentials | Injected into the task at start, never in the image. |
| ECR | Container images | |
| CloudWatch | Logs and alarms on 5xx rate and failed summaries | |
| GitHub Actions | Tests, image build, deploy | Authenticates to AWS with OIDC, so no stored keys. |

## Required changes before this goes live

1. Add authentication. It is out of scope for the exercise, but the app holds personal data. The quickest route is Cognito through the ALB's OIDC action.
2. Replace SQLite with Postgres. The SQL is confined to `server/src/candidates.ts`, with a small schema, and `node:sqlite` would be replaced by a Postgres client.
3. Bind the server to `0.0.0.0` in the container. It listens on loopback today because it has no auth. The security group should accept traffic only from the ALB.
4. Move the summary from Groq to Anthropic. The app uses Groq today, so `server/src/ai/summarizer.ts` and its tests need the Anthropic SDK, `claude-opus-5-5` and `ANTHROPIC_API_KEY`. Re-run the seed resumes afterwards, because model behaviour will differ.
5. Agree data handling for resumes. That means a retention period, a data processing agreement with Anthropic, and checking where Anthropic processes the data. Stored data stays in Sydney, but resume text sent for a summary may leave Australia, which the Australian Privacy Principles on cross-border disclosure would need to cover. Claude on Amazon Bedrock is the alternative if data must stay inside the AWS account, once availability in `ap-southeast-2` is confirmed.

## Rough monthly cost (USD)

AWS figures are estimates from memory, raised because Sydney usually costs more than US regions. Check them in the AWS Pricing Calculator before relying on them. The Anthropic line uses Opus 5.5 at $4 input and $20 output per million tokens, assuming about 2,000 input and 500 output tokens per summary.

| Item | Estimate |
| --- | --- |
| Fargate, 1–2 small tasks | $12–25 |
| Application Load Balancer | $22–30 |
| RDS `db.t4g.micro`, 20 GB, single-AZ | $20–30 |
| S3, CloudFront, ECR | $1–3 |
| Secrets Manager, CloudWatch | $3–5 |
| Anthropic API, about 500 summaries at roughly 2 cents each | About $10 |
| **Total** | **About $70–105** |

**Scaling up.** Multi-AZ RDS roughly doubles the database line and is the first upgrade for production. **Scaling down.** A single small EC2 instance or Lightsail with SQLite on a disk would cost about $10–15, which suits a demo but has no redundancy.
