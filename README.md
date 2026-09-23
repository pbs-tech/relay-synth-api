# relay-synth-api

Serverless backend for [Relay Synth](https://relay-synth.peebles.lol) — an interactive
synthesiser tutorial app.

API Gateway (HTTP API) → Lambda (Node 22, TypeScript) → DynamoDB, provisioned
with Terraform. Authentication is delegated to Auth0.

---

## Architecture

```
Browser ──► API Gateway HTTP API ──► Lambda ──────► DynamoDB
              │  JWT authorizer      ├ tutorials    single table
              │  (Auth0 JWKS)        ├ users        + GSI1 leaderboard
              ▼                      └ leaderboard
           Auth0 tenant
       signup / login / reset
```

Tokens are verified at the edge. API Gateway checks signature, issuer, audience
and expiry against the Auth0 tenant's JWKS before a Lambda is invoked, so invalid
requests never reach — or bill — our code.

### Why these choices

| Decision | Reason |
| --- | --- |
| Three Lambdas, not one | Least-privilege IAM is only meaningful if it is split. The tutorial reader has no write permissions; the leaderboard reader can only touch the index and so cannot read a stored email even if it is compromised. |
| DynamoDB single table | The access patterns are fixed and tiny. All tutorials share one partition key, so the curriculum is one `Query` already in order. Users project onto `GSI1` with the score as a numeric sort key, making the leaderboard one descending `Query` instead of a scan-and-sort. |
| Auth0 | Removes password hashing, reset flows and session handling from this codebase entirely. The tenant is Terraform-managed, so it is reviewable in a plan like everything else. |
| Bundled AWS SDK | The Node 22 runtime ships its own copy, but bundling pins the version so a runtime upgrade cannot silently change SDK behaviour underneath us. |
| arm64 | Cheaper per millisecond and marginally faster for this workload. |

---

## Tutorial content

**The original tutorial data was lost with the database it lived in.** The
replacement content lives in [`data/tutorials.json`](data/tutorials.json), is
version-controlled, and is reconciled into DynamoDB on every deploy. The file —
not the database — is the source of truth, so this cannot happen a second time.

Fourteen tutorials across five categories, 3,200 points total:

| # | Category | Teaches |
| --- | --- | --- |
| 1–4 | Waveforms | sine, square, sawtooth, triangle |
| 5–8 | Amplitude Envelope | attack, release, decay/sustain, full ADSR |
| 9–11 | Filters | low-pass, high-pass, band-pass |
| 12 | Filter Envelope | the filter sweep |
| 13–14 | Sound Design | complete bass and lead patches |

### Authoring tutorials

The frontend grades an answer by **string-comparing** the player's live synth
settings against the tutorial's stored parameters. A tutorial that asks for a
value no control can produce is therefore unsolvable — and fails silently, since
the player simply never scores. `src/lib/validate-tutorials.ts` encodes what the
controls can actually reach, and it runs in CI and before every seed:

| Parameter | Reachable values | Set by |
| --- | --- | --- |
| `oscillator.type` | `sine`, `square`, `sawtooth`, `triangle` | `SynthMixin.setOscillator` |
| `filter.type` | `lowpass`, `highpass`, `bandpass` | `FilterMixin.setFilterType` |
| `filter.frequency` | multiples of 1000, from 1000 to 20000 | `UIMixin.createFilterCutoffSlider` |
| `envelope.attack`, `.sustain` | multiples of 0.05, 0 to 1 | `UIMixin.createEnvelopeSlider` |
| `envelope.decay`, `.release` | as above, but a slider at 0 becomes **0.01** | `EnvelopeMixin` |
| `filterEnvelope.*` | same as `envelope` | `FilterEnvelopeMixin` |

Every tutorial must also declare an `oscillator`. Check your content before
deploying:

```bash
npm run seed -- --dry-run
```

> **Note on two frontend fixes shipped alongside this work.** The cutoff slider
> was never wired up (`createFilterCutoffSlider` and `setFilterCutoffListener`
> both existed but nothing called them), pinning every player's cutoff at 5000Hz.
> And the envelope sliders used a `0.25` step, leaving five reachable values per
> stage. Both are fixed in `relay-synth-app`, which is what widens the table
> above. Tutorials authored against the old 5000Hz limit remain valid, since 5000
> is still a step on the slider.

---

## API

All routes except `GET /` require `Authorization: Bearer <auth0 access token>`.

| Method | Route | Returns |
| --- | --- | --- |
| `GET` | `/` | `{ message }` — unauthenticated health check |
| `GET` | `/tutorials` | Full tutorial list, ordered by number |
| `GET` | `/tutorials/count` | `{ total }` |
| `GET` | `/tutorials/titles` | List-screen projection |
| `GET` | `/tutorials/:id` | One tutorial |
| `GET` | `/tutorials/:id/text` | Header fields only — **excludes the synth answer** |
| `GET` | `/tutorials/:id/synth` | `{ polyphony, type, parameters }` |
| `GET` | `/tutorials/:id/synth/settings` | `{ polyphony, type }` |
| `GET` | `/tutorials/:id/synth/parameters` | `{ parameters }` |
| `GET` | `/tutorials/:id/example` | `{ number, example }` |
| `GET` | `/leaderboard` | `{ users: [...] }`, descending by score |
| `GET` | `/user/profile` | Caller's own profile |
| `POST` | `/user/tutorials/:number/complete` | Marks complete and awards points |

### Breaking changes from v2

The frontend needs updating to match. Each change closes a defect in the old API.

**Signup and login are gone.** `POST /signup` and `POST /login` no longer exist.
Auth0 Universal Login replaces them. The SPA obtains an access token and sends it
as `Authorization: Bearer <token>` — not the old `auth-token` header.

**`PATCH /user/update/score` and `PATCH /user/update/tutorials` are replaced by
`POST /user/tutorials/:number/complete`.** The old pair took both the target
email *and* the score to add from the request body, so any logged-in user could
award themselves an arbitrary score, or edit somebody else's account. The
replacement takes identity from the verified JWT and reads `pointsAvailable` from
the tutorial record on the server. It is also atomic: a single conditional
`UpdateItem` marks the tutorial complete and adds the points, so a double-click
cannot double-award.

**The leaderboard no longer returns email addresses.** It previously published
every player's raw email to anyone who could reach the endpoint. It now returns
`displayName` — the Auth0 nickname, or a masked email such as `al***@example.com`.
Point the leaderboard table's `Email` column at `displayName`.

---

## Runbook

### Prerequisites

- Node 22+, Terraform 1.9+
- An AWS account, and an Auth0 tenant
- An S3 bucket for Terraform state
- A Cloudflare zone for the API's domain (`peebles.lol`)

### One-time bootstrap

1. **State bucket** — create an S3 bucket with versioning enabled. Terraform 1.10
   uses S3 native locking (`use_lockfile`), so no DynamoDB lock table is needed.

2. **Auth0 management credentials** — in the Auth0 dashboard create a Machine to
   Machine application authorised for the Management API with
   `create/read/update` on `actions`, `clients` and `resource_servers`. Export its
   credentials when running Terraform locally:

   ```bash
   export AUTH0_DOMAIN=your-tenant.eu.auth0.com
   export AUTH0_CLIENT_ID=...
   export AUTH0_CLIENT_SECRET=...
   ```

3. **GitHub OIDC** — create two IAM roles trusting
   `token.actions.githubusercontent.com`: one read-only for plans, one with
   deploy permissions. Then set on the repository:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `AWS_DEPLOY_ROLE_ARN` | deploy role ARN |
   | Secret | `AWS_PLAN_ROLE_ARN` | read-only role ARN |
   | Secret | `AUTH0_CLIENT_ID` | M2M client id |
   | Secret | `AUTH0_CLIENT_SECRET` | M2M client secret |
   | Secret | `CLOUDFLARE_API_TOKEN` | DNS token, see below |
   | Variable | `TF_STATE_BUCKET` | state bucket name |
   | Variable | `AWS_REGION` | e.g. `eu-west-2` |

4. **Cloudflare DNS token** — create an API token scoped to `Zone:DNS:Edit` on
   the `peebles.lol` zone and nothing else. Terraform uses it to publish the
   ACM validation record and the API's `CNAME`. Export it when running Terraform
   locally:

   ```bash
   export CLOUDFLARE_API_TOKEN=...
   ```

   To manage those two records by hand instead, set `manage_dns = false` and see
   [Custom domain](#custom-domain).

5. **Fill in the tfvars** — set `auth0_domain` and `cloudflare_zone_id` in
   `terraform/environments/prod.tfvars`. The zone id is on the zone's overview
   page in Cloudflare, and is the id of the apex zone (`peebles.lol`), not of the
   subdomain.

### Custom domain

`api_domain_name` puts the API on a real hostname — `api.relay-synth.peebles.lol`
in prod, `api.dev.relay-synth.peebles.lol` in dev. Setting it to `""` leaves that
environment on its generated `execute-api` URL.

Terraform requests an ACM certificate **in the API's own region**, since a
regional HTTP API custom domain requires the certificate alongside it; the
`us-east-1` requirement people remember applies to edge-optimized REST APIs and
CloudFront. It then writes the DNS validation record, waits for issuance, and
points a `CNAME` at the regional endpoint.

Both records are deliberately **DNS-only** (grey cloud), not proxied:

- Proxying replaces `$context.identity.sourceIp` in the access logs with a
  Cloudflare address, and makes API Gateway's per-IP throttling meaningless.
- Cloudflare's Universal SSL only covers one level of subdomain, so a name as
  deep as `api.relay-synth.peebles.lol` would additionally need Advanced
  Certificate Manager to be proxied.
- ACM cannot validate a proxied validation record at all — Cloudflare answers
  with its own addresses rather than the `CNAME` target.

With `manage_dns = false`, `terraform apply` blocks on certificate validation
until you create the record ACM asks for; `terraform output api_domain_target`
then gives the value for the API's own `CNAME`.

### Frontend hosting (Cloudflare Pages)

`terraform/pages.tf` creates the Cloudflare Pages project that serves
[`relay-synth-app`](https://github.com/pbs-tech/relay-synth-app). It lives here
rather than in the app's repo because the zone the DNS record goes in and the
Auth0 SPA client whose callbacks must match the site's origin are both already
in this state.

The resources are off unless asked for:

| Variable | Effect |
| --- | --- |
| `cloudflare_account_id` | Required for any Pages resource. Pages is account-level, so the zone id is not enough |
| `pages_project_name` | Creates the project. Moves no traffic - the site is reachable at `<name>.pages.dev` and the apex is untouched |
| `frontend_domain_name` | The domain to serve from. Must also be in `frontend_urls` |
| `manage_frontend_dns` | **The cutover.** Attaches the custom domain and points the apex at Pages |

So the safe order is: set the account id and project name, apply, deploy the
app to the project, check it on `terraform output pages_hostname`, and only
then set `manage_frontend_dns = true`. Reverting that variable moves the apex
back.

The `CLOUDFLARE_API_TOKEN` needs **Account > Cloudflare Pages: Edit** on top of
the `Zone > DNS: Edit` the API records already require.

Unlike the API's records, the frontend's `CNAME` is **proxied** (orange cloud).
The reasons the API is DNS-only are all API Gateway's - source IPs in access
logs, per-IP throttling, Universal SSL depth at `api.` - and none of them apply
to a static site that wants the CDN in front of it.

### Deploy

CI/CD handles this on merge to `master`. To deploy by hand:

```bash
npm ci
npm run build            # archive_file zips dist/, so build first

cd terraform
terraform init \
  -backend-config="bucket=relay-synth-tfstate" \
  -backend-config="key=api/prod.tfstate" \
  -backend-config="region=eu-west-2" \
  -backend-config="use_lockfile=true"

terraform apply -var-file=environments/prod.tfvars
```

Then seed the content:

```bash
TABLE_NAME=$(terraform -chdir=terraform output -raw dynamodb_table_name) npm run seed
```

The seed is idempotent — it writes by primary key, so re-running simply
reconciles the table with `data/tutorials.json`.

### Local development

```bash
docker run -d -p 8001:8000 amazon/dynamodb-local
TABLE_NAME=relay-synth-local npm run dev
```

`scripts/dev-server.ts` mounts all three apps on one port and fakes the API
Gateway JWT authorizer context, so routes can be exercised without Auth0.
Override the simulated caller with `DEV_USER_ID` / `DEV_USER_EMAIL`.

### Disaster recovery

The table has point-in-time recovery enabled (35 days, second-level granularity)
and deletion protection on in production.

- **Tutorial content** — never needs restoring. Re-run `npm run seed`.
- **Player progress** — restore via PITR:
  ```bash
  aws dynamodb restore-table-to-point-in-time \
    --source-table-name relay-synth-prod \
    --target-table-name relay-synth-prod-restored \
    --restore-date-time 2026-09-17T10:00:00Z
  ```

---

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local server against DynamoDB Local |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | esbuild bundles into `dist/<function>/` |
| `npm run seed` | Reconcile tutorial content into DynamoDB |
| `npm run seed -- --dry-run` | Validate content without writing |

## CI/CD

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PRs, non-`master` pushes | Typecheck, test, validate content, build, `terraform fmt`/`validate` |
| `plan.yml` | PRs touching `terraform/` or `src/` | `terraform plan` against prod, posted as a PR comment |
| `deploy.yml` | Push to `master`, manual dispatch | Build, apply, seed, smoke test |

Production deploys run against a GitHub Environment — attach required reviewers
there to gate them.
