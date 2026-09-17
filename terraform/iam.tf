data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Tutorial content is immutable at runtime - it only changes via the seed script,
# which runs in CI under its own role. So this function gets no write actions.
data "aws_iam_policy_document" "tutorials" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [aws_dynamodb_table.main.arn]
  }
}

# Reads the leaderboard index only - not the base table, so a bug here cannot
# read a player's stored email.
data "aws_iam_policy_document" "leaderboard" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:Query"]
    resources = ["${aws_dynamodb_table.main.arn}/index/GSI1"]
  }
}

# The only function that writes. It reads tutorials too, because it resolves a
# tutorial's own pointsAvailable rather than trusting the client's figure.
data "aws_iam_policy_document" "users" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.main.arn]
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.functions

  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "lambda" {
  for_each = local.functions

  name   = "dynamodb-access"
  role   = aws_iam_role.lambda[each.key].id
  policy = each.value.policy
}

# Scoped to this function's own log group rather than the managed
# AWSLambdaBasicExecutionRole, which grants logs:* across the account.
data "aws_iam_policy_document" "logging" {
  for_each = local.functions

  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda[each.key].arn}:*"]
  }
}

resource "aws_iam_role_policy" "logging" {
  for_each = local.functions

  name   = "cloudwatch-logs"
  role   = aws_iam_role.lambda[each.key].id
  policy = data.aws_iam_policy_document.logging[each.key].json
}
