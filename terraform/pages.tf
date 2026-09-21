# Cloudflare Pages project for the frontend (relay-synth-app).
#
# It lives in this repo rather than the app's because everything it has to
# agree with is already here: the zone the DNS record goes in, and the Auth0
# SPA client whose callback URLs have to match wherever the app is served
# from. Splitting those across two states is how they drift.
#
# Creating the project moves no traffic. The project is reachable at its own
# pages.dev hostname and nothing else changes; the apex keeps resolving to
# whatever it resolves to now. The cutover is manage_frontend_dns, and it is a
# DNS change on its own, revertible by setting it back.

locals {
  pages_enabled = var.pages_project_name != "" && var.cloudflare_account_id != ""

  # The custom domain and the DNS record are one step: binding the domain to
  # the project without pointing DNS at it leaves Pages waiting on a
  # verification that cannot happen.
  frontend_dns_managed = local.pages_enabled && var.manage_frontend_dns && var.frontend_domain_name != ""

  pages_hostname = local.pages_enabled ? "${var.pages_project_name}.pages.dev" : ""
}

# Direct upload, not a git integration: CI builds the bundle, runs the tests
# against it and uploads that exact directory. A git integration would put the
# build back on the host, which is the thing this moves away from.
resource "cloudflare_pages_project" "app" {
  count = local.pages_enabled ? 1 : 0

  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.pages_production_branch
}

resource "cloudflare_pages_domain" "app" {
  count = local.frontend_dns_managed ? 1 : 0

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.app[0].name
  name         = var.frontend_domain_name
}

# Proxied, unlike the API record. The reasons that record is DNS-only - source
# IPs in access logs, per-IP throttling, Universal SSL depth - are all about
# API Gateway. A Pages site wants the CDN in front of it, and Pages only serves
# a custom domain through Cloudflare anyway.
resource "cloudflare_dns_record" "app" {
  count = local.frontend_dns_managed ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.frontend_domain_name
  type    = "CNAME"
  content = local.pages_hostname

  # Cloudflare requires ttl = 1 ("automatic") on a proxied record and rejects
  # anything else.
  ttl     = 1
  proxied = true

  # The domain has to be attached to the project before the name resolves to
  # it, or the first requests after the cutover reach a Pages account that does
  # not claim this hostname.
  depends_on = [cloudflare_pages_domain.app]
}
