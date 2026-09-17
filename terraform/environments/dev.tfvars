environment     = "dev"
aws_region      = "eu-west-2"
allowed_origins = ["http://localhost:8080"]
frontend_urls   = ["http://localhost:8080"]

auth0_domain         = "CHANGE-ME.eu.auth0.com"
auth0_api_identifier = "https://api.dev.relay-synth.peebles.lol"

api_domain_name = "api.dev.relay-synth.peebles.lol"
# Zone ID for peebles.lol, from the zone's overview page in Cloudflare.
cloudflare_zone_id = "CHANGE-ME"

log_retention_days         = 7
lambda_memory_size         = 256
enable_deletion_protection = false
