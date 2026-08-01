#!/usr/bin/env bash
# CloudFormation create/update/delete wrapper for deploy/aws/ec2-stack.yaml,
# called by .github/workflows/deploy-infra.yml. Exists because the raw AWS CLI
# leaves several stack states that a naive `create-stack` / `update-stack` /
# `delete-stack` call handles badly in CI:
#
#   - ROLLBACK_COMPLETE / CREATE_FAILED  -> stack can NEVER be updated from
#     here; AWS requires delete-then-recreate. A plain `deploy` call just
#     fails forever until someone deletes it by hand.
#   - UPDATE_ROLLBACK_FAILED             -> stuck; needs an explicit
#     continue-update-rollback before anything else will work.
#   - *_IN_PROGRESS                      -> a concurrent operation is running;
#     starting another one races it. Fail fast instead.
#   - "No changes to deploy"             -> `aws cloudformation deploy` exits
#     255 in this case (a well-known CLI wart), which would otherwise look
#     like a failure under `set -e` and fail the Action on a no-op run.
#   - Any *_FAILED outcome               -> dump the stack events that
#     actually explain why, since the CLI's own error message rarely does.
#
# Usage: cfn-deploy.sh <deploy|delete>
# Required env: STACK_NAME, TEMPLATE_FILE, AWS_REGION
# Optional env: PARAM_OVERRIDES (space-separated Key=Value, deploy only)

set -euo pipefail

ACTION="${1:?usage: cfn-deploy.sh <deploy|delete>}"
: "${STACK_NAME:?STACK_NAME required}"
: "${TEMPLATE_FILE:?TEMPLATE_FILE required}"
: "${AWS_REGION:?AWS_REGION required}"
PARAM_OVERRIDES="${PARAM_OVERRIDES:-}"

get_status() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "STACK_NOT_FOUND"
}

print_failure_events() {
  echo "---- stack events (FAILED) ----"
  aws cloudformation describe-stack-events \
    --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query "StackEvents[?contains(ResourceStatus, 'FAILED')].[Timestamp,LogicalResourceId,ResourceStatusReason]" \
    --output table || true
}

wait_for() { # $1 = create|update|delete
  echo "waiting for stack $1 to finish..."
  if ! aws cloudformation wait "stack-$1-complete" --stack-name "$STACK_NAME" --region "$AWS_REGION"; then
    echo "::error::stack $1 did not complete successfully"
    print_failure_events
    return 1
  fi
}

delete_and_wait() {
  echo "deleting stack..."
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION"
  wait_for delete
}

deploy() {
  local status
  status="$(get_status)"
  echo "current stack status: $status"

  case "$status" in
    ROLLBACK_COMPLETE|CREATE_FAILED)
      echo "stack is in an unrecoverable state ($status) - AWS requires delete-then-recreate here, so deleting first"
      delete_and_wait
      ;;
    UPDATE_ROLLBACK_FAILED)
      echo "stack is stuck in UPDATE_ROLLBACK_FAILED - attempting continue-update-rollback"
      aws cloudformation continue-update-rollback --stack-name "$STACK_NAME" --region "$AWS_REGION"
      wait_for update
      ;;
    REVIEW_IN_PROGRESS)
      echo "::error::stack is in REVIEW_IN_PROGRESS - a change set exists but was never executed/deleted. Resolve it in the AWS console before re-running."
      exit 1
      ;;
    *_IN_PROGRESS)
      echo "::error::a stack operation is already in progress ($status). Re-run once it finishes, or check the console for a stuck operation."
      exit 1
      ;;
  esac

  echo "deploying stack..."
  set +e
  # shellcheck disable=SC2086
  DEPLOY_OUT=$(aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides $PARAM_OVERRIDES \
    --region "$AWS_REGION" 2>&1)
  RC=$?
  set -e
  echo "$DEPLOY_OUT"

  if [ $RC -ne 0 ]; then
    if echo "$DEPLOY_OUT" | grep -qi "No changes to deploy"; then
      echo "no changes to deploy - stack is already up to date"
      exit 0
    fi
    echo "::error::cloudformation deploy failed"
    print_failure_events
    exit 1
  fi
}

destroy() {
  local status
  status="$(get_status)"
  echo "current stack status: $status"

  case "$status" in
    STACK_NOT_FOUND)
      echo "stack already absent - nothing to do"
      exit 0
      ;;
    DELETE_IN_PROGRESS)
      echo "delete already in progress - waiting for it to finish"
      wait_for delete
      exit 0
      ;;
    *_IN_PROGRESS)
      echo "::error::a stack operation is in progress ($status) - cannot delete right now"
      exit 1
      ;;
  esac

  delete_and_wait
}

case "$ACTION" in
  deploy) deploy ;;
  delete) destroy ;;
  *) echo "::error::unknown action '$ACTION' (expected deploy|delete)"; exit 1 ;;
esac
