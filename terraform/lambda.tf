# Each handler is bundled into its own directory by `npm run build`, so one
# function's code changing does not invalidate the others' deployment packages.
data "archive_file" "lambda" {
  for_each = local.functions

  type        = "zip"
  source_dir  = "${path.module}/../dist/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

# Created explicitly rather than letting Lambda auto-create them, so retention is
# managed and logs do not accumulate indefinitely.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.functions

  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  for_each = local.functions

  function_name = "${local.name}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda[each.key].arn

  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256

  handler = "index.handler"
  runtime = "nodejs22.x"
  # Graviton: cheaper per millisecond and slightly faster for this workload.
  architectures = ["arm64"]

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.main.name
      LOG_LEVEL      = var.environment == "prod" ? "info" : "debug"
      EMAIL_CLAIM    = "${var.claim_namespace}/email"
      NICKNAME_CLAIM = "${var.claim_namespace}/nickname"
      # Maps minified stack traces back to the TypeScript sources via the
      # .map files esbuild emits alongside each bundle.
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  depends_on = [
    aws_iam_role_policy.logging,
    aws_cloudwatch_log_group.lambda,
  ]
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = local.functions

  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  # Scoped to this API so no other API in the account can invoke these functions.
  source_arn = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
