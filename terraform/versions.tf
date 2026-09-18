terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.64"
    }
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.10"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# Credentials come from AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET so
# the management API secret never lands in a tfvars file.
provider "auth0" {
  domain = var.auth0_domain
}

# Token comes from CLOUDFLARE_API_TOKEN so the DNS credential never lands in a
# tfvars file. It only needs Zone:DNS:Edit on the zone holding api_domain_name.
provider "cloudflare" {}
