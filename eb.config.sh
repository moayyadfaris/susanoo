#!/bin/sh
FILE=".elasticbeanstalk/config.yml"
mkdir .elasticbeanstalk
/bin/cat << EOM >$FILE
branch-defaults:
  $BITBUCKET_BRANCH:
    environment: $EB_ENV_NAME
global:
  application_name: $EB_APP_NAME
  default_region: $EB_REGION
  include_git_submodules: true
  instance_profile: null
  platform_name: null
  platform_version: null
  repository: $BITBUCKET_GIT_SSH_ORIGIN
  sc: git
  workspace_type: Application
