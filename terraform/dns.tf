# Custom domain for the API, fronted by DNS records in Cloudflare.
#
# The certificate lives in the API's own region on purpose: a regional HTTP API
# custom domain requires the certificate in the same region. The us-east-1 rule
# people remember applies to edge-optimized REST APIs and CloudFront, not here.

locals {
  # An empty api_domain_name leaves the API on its execute-api URL, which is how
  # an environment opts out of having a custom domain at all.
  custom_domain_enabled = var.api_domain_name != ""
  dns_managed           = local.custom_domain_enabled && var.manage_dns
}

resource "aws_acm_certificate" "api" {
  count = local.custom_domain_enabled ? 1 : 0

  domain_name       = var.api_domain_name
  validation_method = "DNS"

  # Issue and attach the replacement before destroying the old certificate, so
  # renaming the domain cannot blackhole the API partway through an apply.
  lifecycle {
    create_before_destroy = true
  }
}

# ACM publishes one validation record per name on the certificate. Keying the
# map by domain_name keeps for_each stable, and the keys are known at plan time
# because the certificate's domain comes from a variable rather than a resource.
resource "cloudflare_dns_record" "cert_validation" {
  for_each = local.dns_managed ? {
    for option in aws_acm_certificate.api[0].domain_validation_options :
    option.domain_name => option
  } : {}

  zone_id = var.cloudflare_zone_id
  # ACM hands these back fully qualified with a trailing dot, which Cloudflare
  # would treat as part of the label.
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 60

  # A proxied validation record never validates: Cloudflare answers with its own
  # addresses instead of the CNAME target, so ACM never sees the value it wrote.
  proxied = false
}

# Blocks until ACM reports the certificate ISSUED, so the domain below is never
# created against a certificate that is still PENDING_VALIDATION.
#
# With manage_dns = false this list is empty and the resource simply polls, which
# is the window in which the validation record has to be created by hand.
resource "aws_acm_certificate_validation" "api" {
  count = local.custom_domain_enabled ? 1 : 0

  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [for record in cloudflare_dns_record.cert_validation : record.name]
}

resource "aws_apigatewayv2_domain_name" "api" {
  count = local.custom_domain_enabled ? 1 : 0

  domain_name = var.api_domain_name

  domain_name_configuration {
    # Referencing the validation rather than the certificate is what orders this
    # after issuance.
    certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# Binds the domain to the $default stage. Without a mapping the domain resolves
# and serves TLS but returns 404 for every path.
resource "aws_apigatewayv2_api_mapping" "api" {
  count = local.custom_domain_enabled ? 1 : 0

  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "cloudflare_dns_record" "api" {
  count = local.dns_managed ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.api_domain_name
  type    = "CNAME"
  content = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
  ttl     = 300

  # DNS-only, deliberately. Proxying would replace $context.identity.sourceIp in
  # the access logs with a Cloudflare address and make the per-IP throttling in
  # apigateway.tf meaningless. Universal SSL also stops at one subdomain level,
  # so proxying a name this deep would additionally need Advanced Certificate
  # Manager.
  proxied = false
}
