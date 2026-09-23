variable "project_name" {
  description = "Name prefix applied to every resource."
  type        = string
  default     = "relay-synth"
}

variable "environment" {
  description = "Deployment environment; part of every resource name."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

variable "allowed_origins" {
  description = "Browser origins permitted by the API's CORS configuration."
  type        = list(string)
}

variable "auth0_domain" {
  description = "Auth0 tenant domain, e.g. relay-synth.eu.auth0.com."
  type        = string
}

variable "auth0_api_identifier" {
  description = "Auth0 API identifier (audience). Must match the aud claim the SPA requests."
  type        = string
  default     = "https://api.relay-synth.peebles.lol"
}

variable "manage_auth0_tenant" {
  description = "Whether Terraform owns the Auth0 API, SPA client and login Action. Set false to configure the tenant by hand while still using it for token validation."
  type        = bool
  default     = true
}

variable "frontend_urls" {
  description = "Origins the Auth0 SPA client may redirect back to after login and logout."
  type        = list(string)
  default     = ["https://relay-synth.peebles.lol"]
}

variable "manage_auth0_login_flow" {
  description = "Whether this stack owns the tenant's post-login trigger binding. The binding is tenant-wide, so only one environment sharing a tenant may manage it; the others get the same claims from it, since the Action runs for every login."
  type        = bool
  default     = true
}

variable "preview_pages_hostname" {
  description = "Pages hostname whose deploys (<branch>.<hostname>) may sign in and call this API, e.g. relay-synth.pages.dev. Adds a wildcard to the Auth0 SPA client and, because HTTP API CORS cannot match a subdomain wildcard, allows any https origin in CORS. Meant for dev only. Empty disables it."
  type        = string
  default     = ""
}

variable "claim_namespace" {
  description = "Namespace for the custom claims the Auth0 Action adds to access tokens. Auth0 silently drops non-namespaced custom claims."
  type        = string
  default     = "https://relay-synth.peebles.lol"
}

variable "lambda_memory_size" {
  description = "Memory (MB) for each function. CPU scales with memory, so this also sets cold start speed."
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Timeout (seconds) for each function. These are simple DynamoDB reads; a long timeout only delays failure."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Logs never expired by default, which quietly accrues cost forever."
  type        = number
  default     = 30
}

variable "throttling_burst_limit" {
  description = "API Gateway burst limit across all routes."
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "API Gateway steady-state requests per second across all routes."
  type        = number
  default     = 50
}

variable "enable_deletion_protection" {
  description = "Blocks `terraform destroy` from dropping the DynamoDB table. The previous database was lost; this makes losing the next one deliberate."
  type        = bool
  default     = true
}

variable "api_domain_name" {
  description = "Custom domain to serve the API on, e.g. api.relay-synth.peebles.lol. Empty leaves the API on its generated execute-api URL."
  type        = string
  default     = ""
}

variable "manage_dns" {
  description = "Whether Terraform owns the Cloudflare records for api_domain_name. Set false to create the certificate validation CNAME and the API CNAME by hand, in which case the apply blocks on certificate validation until they exist."
  type        = bool
  default     = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone containing api_domain_name - the apex zone (peebles.lol), not the subdomain. Shown on the zone's overview page. Only read when manage_dns is true."
  type        = string
  default     = ""

  validation {
    condition     = !var.manage_dns || var.api_domain_name == "" || var.cloudflare_zone_id != ""
    error_message = "cloudflare_zone_id is required when manage_dns is true and api_domain_name is set."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the Pages project. Empty disables the Pages resources entirely. The zone id is not enough: Pages is an account-level product."
  type        = string
  default     = ""
}

variable "pages_project_name" {
  description = "Name of the Cloudflare Pages project serving the frontend, and the label in its pages.dev hostname. Empty disables the Pages resources entirely."
  type        = string
  default     = ""
}

variable "pages_production_branch" {
  description = "Branch Pages treats as production. A deploy from any other branch is published as a preview instead."
  type        = string
  default     = "master"
}

variable "frontend_domain_name" {
  description = "Domain the frontend is served from. Only used when manage_frontend_dns is true; it must also appear in frontend_urls, which is what Auth0 allows redirects to."
  type        = string
  default     = ""
}

variable "manage_frontend_dns" {
  description = "Point frontend_domain_name at the Pages project. This is the cutover away from the current host and the one change here that moves live traffic, so it is off until deliberately turned on."
  type        = bool
  default     = false
}
