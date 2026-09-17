# Partial backend configuration. State location is supplied at init time so the
# same code initialises against a different bucket per environment:
#
#   terraform init \
#     -backend-config="bucket=relay-synth-tfstate" \
#     -backend-config="key=api/prod.tfstate" \
#     -backend-config="region=eu-west-2" \
#     -backend-config="use_lockfile=true"
terraform {
  backend "s3" {}
}
