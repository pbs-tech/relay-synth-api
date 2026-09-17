environment     = "prod"
aws_region      = "eu-west-2"
allowed_origins = ["https://relay-synth.tech", "https://www.relay-synth.tech"]
frontend_urls   = ["https://relay-synth.tech", "https://www.relay-synth.tech"]

# Replace with your tenant domain, e.g. relay-synth.eu.auth0.com
auth0_domain         = "CHANGE-ME.eu.auth0.com"
auth0_api_identifier = "https://api.relay-synth.tech"

log_retention_days = 30
lambda_memory_size = 512
