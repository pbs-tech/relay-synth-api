locals {
  name = "${var.project_name}-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "pbs-tech/relay-synth-api"
  }

  # One Lambda per bounded context. Splitting them keeps IAM least-privilege
  # meaningful: the tutorial reader cannot write, and the leaderboard reader can
  # only touch the index.
  functions = {
    tutorials = {
      description = "Read-only tutorial content"
      policy      = data.aws_iam_policy_document.tutorials.json
    }
    users = {
      description = "Player profile and tutorial completion"
      policy      = data.aws_iam_policy_document.users.json
    }
    leaderboard = {
      description = "Ranked player scores"
      policy      = data.aws_iam_policy_document.leaderboard.json
    }
  }
}

data "aws_caller_identity" "current" {}
