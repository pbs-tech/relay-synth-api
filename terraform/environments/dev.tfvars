environment = "dev"
aws_region  = "eu-west-2"
# npm run serve is HTTPS (devServer.https in the app's vue.config.js).
allowed_origins = ["https://localhost:8080"]
frontend_urls   = ["https://localhost:8080"]

# Branch previews from the app's Pages deploy use this stack.
preview_pages_hostname = "relay-synth.pages.dev"

auth0_domain         = "a-peebles.uk.auth0.com"
auth0_api_identifier = "https://api.dev.relay-synth.peebles.lol"

api_domain_name = "api.dev.relay-synth.peebles.lol"

log_retention_days         = 7
lambda_memory_size         = 256
enable_deletion_protection = false
