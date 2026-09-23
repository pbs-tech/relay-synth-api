locals {
  # Route -> integration mapping. Keeping this explicit in Terraform (rather than
  # a single $default catch-all) means the deployed surface is reviewable in the
  # plan, and each path is bound to exactly one function.
  routes = {
    "GET /"                   = { function = "tutorials", authorized = false }
    "GET /tutorials"          = { function = "tutorials", authorized = true }
    "GET /tutorials/{proxy+}" = { function = "tutorials", authorized = true }
    "GET /leaderboard"        = { function = "leaderboard", authorized = true }
    "GET /user/{proxy+}"      = { function = "users", authorized = true }
    "POST /user/{proxy+}"     = { function = "users", authorized = true }
  }
}

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  description   = "Relay Synth API"
  protocol_type = "HTTP"

  cors_configuration {
    # HTTP API CORS takes exact origins, "*" or "https://*"; it cannot match
    # *.project.pages.dev, so allowing previews means allowing "https://*".
    # Scoped to environments that set preview_pages_hostname (dev), and CORS
    # is not the control that protects the data: every route but the health
    # check needs a bearer token for this audience, which Auth0 only issues to
    # the SPA client's allowed origins.
    allow_origins = concat(var.allowed_origins, var.preview_pages_hostname == "" ? [] : ["https://*"])
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    # Tokens travel in the Authorization header, not cookies, so credentialed
    # requests are unnecessary and would forbid a wildcard origin anyway.
    allow_credentials = false
    max_age           = 3600
  }
}

# API Gateway validates the Auth0 token - signature, issuer, audience and expiry -
# against the tenant's JWKS before any Lambda is invoked. Invalid tokens are
# rejected at the edge and never reach (or bill) our code.
resource "aws_apigatewayv2_authorizer" "auth0" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "auth0"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer = "https://${var.auth0_domain}/"
    # Rejects a token minted for a different API in the same tenant.
    audience = [var.auth0_api_identifier]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.functions

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api[each.key].invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = var.lambda_timeout * 1000
}

resource "aws_apigatewayv2_route" "main" {
  for_each = local.routes

  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.lambda[each.value.function].id}"

  authorization_type = each.value.authorized ? "JWT" : "NONE"
  authorizer_id      = each.value.authorized ? aws_apigatewayv2_authorizer.auth0.id : null
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      httpMethod     = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      responseTime   = "$context.responseLatency"
      integrationErr = "$context.integrationErrorMessage"
      # Who made the call, for tracing a report back to an account without
      # logging the token itself.
      principalId = "$context.authorizer.claims.sub"
      sourceIp    = "$context.identity.sourceIp"
      userAgent   = "$context.identity.userAgent"
    })
  }

  default_route_settings {
    throttling_burst_limit   = var.throttling_burst_limit
    throttling_rate_limit    = var.throttling_rate_limit
    detailed_metrics_enabled = true
  }
}
