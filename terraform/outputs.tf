output "api_endpoint" {
  description = "Base URL of the deployed API. Set this as the frontend's API base."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "dynamodb_table_name" {
  description = "Table name. Pass as TABLE_NAME when running the seed script."
  value       = aws_dynamodb_table.main.name
}

output "lambda_function_names" {
  description = "Deployed function names, keyed by bounded context."
  value       = { for k, v in aws_lambda_function.api : k => v.function_name }
}

output "auth0_domain" {
  description = "Auth0 tenant domain for the SPA's Auth0 client configuration."
  value       = var.auth0_domain
}

output "auth0_audience" {
  description = "Audience the SPA must request so API Gateway accepts the token."
  value       = var.auth0_api_identifier
}

output "auth0_spa_client_id" {
  description = "Client ID for the SPA. Empty when manage_auth0_tenant is false."
  value       = var.manage_auth0_tenant ? auth0_client.spa[0].client_id : ""
}
