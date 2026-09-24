# Auth0 owns signup, login, password storage and reset - the API has no password
# handling left in it at all. These resources describe the tenant objects the API
# and SPA depend on; set manage_auth0_tenant = false to configure them by hand.

# The API the SPA requests tokens for. Its identifier becomes the `aud` claim
# that the API Gateway authorizer checks.
resource "auth0_resource_server" "api" {
  count = var.manage_auth0_tenant ? 1 : 0

  name                                            = local.name
  identifier                                      = var.auth0_api_identifier
  signing_alg                                     = "RS256"
  skip_consent_for_verifiable_first_party_clients = true

  # Short-lived access tokens limit the damage from a leaked token; the SPA
  # silently renews via refresh token rotation.
  token_lifetime         = 3600
  token_lifetime_for_web = 3600
  allow_offline_access   = true
}

locals {
  # Every Pages deploy is served from the project's hostname and, for branches,
  # from <branch>.<hostname>. The wildcard matches exactly one label, which is
  # what a branch alias or a deployment hash is.
  preview_origins = var.preview_pages_hostname == "" ? [] : [
    "https://${var.preview_pages_hostname}",
    "https://*.${var.preview_pages_hostname}",
  ]

  spa_origins = concat(var.frontend_urls, local.preview_origins)
}

resource "auth0_client" "spa" {
  count = var.manage_auth0_tenant ? 1 : 0

  name        = "${local.name}-spa"
  description = "Relay Synth single page app"
  app_type    = "spa"

  # The SPA redirects to <origin>/callback after login and Auth0 matches
  # callbacks exactly, so the bare origin alone rejects every login. It stays
  # listed for anything still redirecting there. Logout URLs and web origins
  # are origins only - Auth0 rejects a web origin with a path.
  callbacks           = concat(local.spa_origins, [for origin in local.spa_origins : "${origin}/callback"])
  allowed_logout_urls = local.spa_origins
  web_origins         = local.spa_origins

  # Authorization code with PKCE. A SPA cannot hold a client secret, and the
  # implicit flow returns tokens in the URL fragment where they leak into history.
  grant_types = ["authorization_code", "refresh_token"]

  oidc_conformant = true

  jwt_configuration {
    alg = "RS256"
  }

  refresh_token {
    rotation_type   = "rotating"
    expiration_type = "expiring"
    token_lifetime  = 2592000 # 30 days
    leeway          = 30
  }
}

# Access tokens carry no email by default. This Action adds it under a namespaced
# claim - Auth0 silently drops custom claims that are not namespaced - so the API
# can store a contact address and derive a leaderboard display name without
# having to call /userinfo on every request.
resource "auth0_action" "add_claims" {
  count = var.manage_auth0_tenant && var.manage_auth0_login_flow ? 1 : 0

  name    = "${local.name}-add-claims"
  runtime = "node18"
  deploy  = true

  supported_triggers {
    id      = "post-login"
    version = "v3"
  }

  code = <<-JS
    exports.onExecutePostLogin = async (event, api) => {
      const namespace = '${var.claim_namespace}';
      if (event.authorization) {
        api.accessToken.setCustomClaim(namespace + '/email', event.user.email);
        api.accessToken.setCustomClaim(namespace + '/nickname', event.user.nickname);
      }
    };
  JS
}

# Tenant-wide: this replaces every post-login binding. Dev and prod share a
# tenant, so only prod manages it (dev sets manage_auth0_login_flow = false);
# the Action runs for every login in the tenant, dev's included.
resource "auth0_trigger_actions" "post_login" {
  count = var.manage_auth0_tenant && var.manage_auth0_login_flow ? 1 : 0

  trigger = "post-login"

  actions {
    id           = auth0_action.add_claims[0].id
    display_name = auth0_action.add_claims[0].name
  }
}
