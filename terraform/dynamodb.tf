# Single-table design.
#
#   Tutorials  PK = "TUTORIAL"         SK = "TUTORIAL#0007"
#   Users      PK = "USER#<auth0 sub>" SK = "PROFILE"
#
# Tutorials share one partition key so the whole curriculum is a single Query.
# Users project onto GSI1 with the score as a numeric sort key, making the
# leaderboard a descending Query rather than a scan-and-sort.
resource "aws_dynamodb_table" "main" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST"

  key_schema {
    attribute_name = "PK"
    key_type       = "HASH"
  }

  key_schema {
    attribute_name = "SK"
    key_type       = "RANGE"
  }

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "N"
  }

  global_secondary_index {
    name = "GSI1"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }

    projection_type = "INCLUDE"
    # Only what the leaderboard renders, so the index stays small and the query
    # never has to fetch back to the base table.
    non_key_attributes = ["displayName", "totalScore", "tutorialsCompleted"]
  }

  # The previous database was lost with its credentials. Point-in-time recovery
  # gives 35 days of second-level restore, and deletion protection means losing
  # this one has to be a deliberate act rather than a stray destroy.
  point_in_time_recovery {
    enabled = true
  }

  # Variable-driven rather than a `lifecycle { prevent_destroy = true }` block,
  # which cannot be made conditional and would leave dev environments impossible
  # to tear down.
  deletion_protection_enabled = var.enable_deletion_protection

  server_side_encryption {
    enabled = true
  }
}
