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
  default     = "https://api.relay-synth.tech"
}

variable "manage_auth0_tenant" {
  description = "Whether Terraform owns the Auth0 API, SPA client and login Action. Set false to configure the tenant by hand while still using it for token validation."
  type        = bool
  default     = true
}

variable "frontend_urls" {
  description = "Origins the Auth0 SPA client may redirect back to after login and logout."
  type        = list(string)
  default     = ["https://relay-synth.tech"]
}

variable "claim_namespace" {
  description = "Namespace for the custom claims the Auth0 Action adds to access tokens. Auth0 silently drops non-namespaced custom claims."
  type        = string
  default     = "https://relay-synth.tech"
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
