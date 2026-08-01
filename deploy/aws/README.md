# EC2 via CloudFormation

Provisions a standalone EC2 box (`ec2-stack.yaml`) for api + redis + web
(Postgres is Supabase, external), separate from the existing
manually-provisioned `server.liveshortly.com` box described in
`../DEPLOY.md`. Access is SSH — reusing the **same `DEPLOY_SSH_KEY` /
`DEPLOY_KNOWN_HOSTS` repo secrets** already used by `deploy.yml` — plus SSM
Session Manager as a free keyless fallback.

Two separate manual (`workflow_dispatch`) GitHub Actions:
- **`deploy-infra.yml`** — creates/updates/deletes the AWS resources
  themselves (instance, security group, IAM role, Elastic IP). Requires
  `AWS_A_KEY` / `AWS_S_A_KEY` repo secrets.
- **`deploy-ec2-app.yml`** — ships app code to that box (rsync + SSH +
  `docker compose`), same mechanism as `deploy.yml` uses for the existing box.
  Requires `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DATABASE_URL`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` repo secrets —
  all of which already exist from the current `deploy.yml` setup except
  `DATABASE_URL` (Supabase pooler string for this box).

No S3 or AWS CodeDeploy involved — deliberately, to avoid extra billed
resources beyond the EC2 box itself.

## One-time setup

1. **Create a dedicated IAM user** for this workflow (don't reuse a personal
   access key). Attach a policy scoped to what the stack actually needs:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "CloudFormationStack",
         "Effect": "Allow",
         "Action": ["cloudformation:*"],
         "Resource": "arn:aws:cloudformation:us-west-1:*:stack/liveshortly-ec2/*"
       },
       {
         "Sid": "EC2Resources",
         "Effect": "Allow",
         "Action": [
           "ec2:RunInstances", "ec2:TerminateInstances", "ec2:DescribeInstances",
           "ec2:CreateTags", "ec2:DescribeVpcs", "ec2:DescribeSubnets",
           "ec2:DescribeImages", "ec2:DescribeSecurityGroups", "ec2:DescribeKeyPairs",
           "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
           "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
           "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
           "ec2:AllocateAddress", "ec2:ReleaseAddress",
           "ec2:AssociateAddress", "ec2:DisassociateAddress", "ec2:DescribeAddresses"
         ],
         "Resource": "*"
       },
       {
         "Sid": "InstanceRoleForSSM",
         "Effect": "Allow",
         "Action": [
           "iam:CreateRole", "iam:DeleteRole", "iam:GetRole",
           "iam:AttachRolePolicy", "iam:DetachRolePolicy",
           "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
           "iam:GetInstanceProfile",
           "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
           "iam:PassRole", "iam:TagRole"
         ],
         "Resource": "*"
       },
       {
         "Sid": "AmiLookup",
         "Effect": "Allow",
         "Action": "ssm:GetParameters",
         "Resource": "arn:aws:ssm:us-west-1::parameter/aws/service/canonical/*"
       }
     ]
   }
   ```

2. **Generate an access key for that user** and add two repo secrets
   (Settings → Secrets and variables → Actions):
   - `AWS_A_KEY` (access key id)
   - `AWS_S_A_KEY` (secret access key)

   > If a key was ever pasted into a chat, ticket, or anywhere outside a
   > secrets manager, rotate it in IAM first — treat it as already leaked.

2. **Confirm the EC2 key pair name** that `DEPLOY_SSH_KEY` is the private
   half of (EC2 console → Key Pairs, or `aws ec2 describe-key-pairs`). You'll
   pass this as `key_pair_name` when running `deploy-infra.yml` — the
   template attaches it to the instance so the existing secret can SSH in.

## Step 1 — provision the box

GitHub → Actions → **Deploy infrastructure (CloudFormation)** → Run workflow.

- `action: deploy` — creates the stack the first time, updates it on
  subsequent runs (change instance size, etc. via `instance_type`).
  Leave `vpc_id` / `subnet_id` blank to use the account's default VPC.
  `key_pair_name` is required (see setup step 2 above).
- `action: delete` — tears the stack down (EC2 instance, security group,
  IAM role, Elastic IP — all released).

After the first deploy, take the `PublicIp` (Elastic IP) from the stack
outputs — you'll need it for step 2 below, and eventually for Cloudflare DNS.
Because it's an Elastic IP, later `deploy` runs that replace the instance
(e.g. instance-type change forcing replacement) keep the same address.

To get a shell without SSH, run the `SsmConnectCommand` from the stack
outputs locally (requires the AWS CLI + Session Manager plugin):

```bash
aws ssm start-session --target <instance-id> --region us-west-1
```

## Step 2 — point nears.io at the box

1. **Cloudflare DNS**: point `nears.io` and `www.nears.io` at the stack's
   `PublicIp` (Elastic IP), proxied (orange cloud). SSL/TLS mode Flexible,
   same as the existing box (see `../DEPLOY.md` step 6) unless you set up an
   origin cert for Full/strict.
2. **nginx**: on the box, install `deploy/nginx/nears.io.conf`:
   ```bash
   sudo cp deploy/nginx/nears.io.conf /etc/nginx/sites-available/
   sudo ln -sf /etc/nginx/sites-available/nears.io.conf /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. **Google OAuth console**: add both
   `https://nears.io/auth/google/callback` and
   `https://www.nears.io/auth/google/callback` as Authorized redirect URIs
   on the OAuth client (`GOOGLE_CLIENT_ID`) — the `deploy-ec2-app.yml` run
   below sets `OAUTH_ALLOWED_HOSTS=nears.io,www.nears.io` so the server
   accepts either, but Google itself also needs the URI registered.

## Step 3 — deploy app code

`.env` here is **not** created manually — the workflow writes it on every
run, from the repo secret `DATABASE_URL` (Supabase pooler connection string,
us-west-1) plus the `domain` input (used to derive `CORS_ORIGINS`,
`NEXT_PUBLIC_API_URL`, and `OAUTH_ALLOWED_HOSTS`, apex + `www.` automatically).

GitHub → Actions → **Deploy app to EC2 (CloudFormation box)** → Run workflow,
with `host` set to the stack's Elastic IP and `domain` set to `nears.io`
(the default). This rsyncs the repo, writes `.env` and `.env.auth` from
secrets, and runs `docker compose -f docker-compose.prod-ec2.yml up -d --build`.

`.env.production-ec2.example` is kept for reference only (what `DATABASE_URL`
should look like), not for manual copying.

## What the workflows handle for you

`cfn-deploy.sh` (used by `deploy-infra.yml`) wraps the raw CloudFormation CRUD
calls to deal with the stack states that otherwise fail a naive script in CI
— see the comment block at the top of the script for the full list (stuck
rollbacks, in-progress operations, the `aws cloudformation deploy` "no
changes" exit code, etc). On any real failure it prints the CloudFormation
stack events that explain *why*, not just the CLI's generic error.

`deploy-infra.yml` only manages AWS resources. `deploy-ec2-app.yml` only ships
app code (rsync + `docker compose`) — same split as the existing
`deploy-infra.yml` / `deploy.yml` pair, just for the new box.
