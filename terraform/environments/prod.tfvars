environment     = "prod"
aws_region      = "eu-west-2"
allowed_origins = ["https://relay-synth.peebles.lol"]
frontend_urls   = ["https://relay-synth.peebles.lol"]

# Replace with your tenant domain, e.g. relay-synth.eu.auth0.com
auth0_domain = "a-peebles.eu.auth0.com"
# An opaque identifier, not a URL Auth0 resolves. It only has to match the
# audience the SPA requests and the authorizer's configured audience.
auth0_api_identifier = "https://api.relay-synth.peebles.lol"

api_domain_name = "api.relay-synth.peebles.lol"

log_retention_days = 30
lambda_memory_size = 512

manage_frontend_dns = true
pages_project_name  = "relay-synth"

frontend_domain_name = "relay-synth.peebles.lol"
