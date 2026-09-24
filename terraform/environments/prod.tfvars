environment     = "prod"
aws_region      = "eu-west-2"
allowed_origins = ["https://relay-synth.peebles.lol"]
frontend_urls   = ["https://relay-synth.peebles.lol"]

# Shared with dev; each environment has its own Management API application
# (the AUTH0_* secrets on its GitHub Environment) and its own API and SPA
# client, named relay-synth-<environment>.
auth0_domain = "a-peebles.uk.auth0.com"
# An opaque identifier, not a URL Auth0 resolves. It only has to match the
# audience the SPA requests and the authorizer's configured audience.
auth0_api_identifier = "https://api.relay-synth.peebles.lol"

api_domain_name = "api.relay-synth.peebles.lol"

log_retention_days = 30
lambda_memory_size = 512

manage_frontend_dns = true
pages_project_name  = "relay-synth"

frontend_domain_name = "relay-synth.peebles.lol"
