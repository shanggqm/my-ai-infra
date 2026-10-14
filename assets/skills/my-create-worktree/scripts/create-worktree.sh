#!/usr/bin/env bash
set -euo pipefail

# Git-only worktree creation. No environment sharing or project setup commands.
fail() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }
conflict() { printf '[CONFLICT] %s\n' "$1" >&2; exit 2; }
usage() {
  printf '%s\n' \
    'Usage: bash create-worktree.sh --branch <name> [--dir <sibling-name>] [--base <ref>] [--reuse-existing]' \
    'Default base: HEAD of the calling worktree.' \
    '--reuse-existing: use an existing branch only after the user explicitly chooses it.' \
    'Exit 2: conflict; ask the user to choose before retrying.'
}

BRANCH=''
DIR_NAME=''
BASE_REF=''
REUSE_EXISTING=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch|--dir|--base)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "Missing value for $1"
      case "$1" in
        --branch) BRANCH="$2" ;;
        --dir) DIR_NAME="$2" ;;
        --base) BASE_REF="$2" ;;
      esac
      shift 2
      ;;
    --reuse-existing) REUSE_EXISTING=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[[ -n "$BRANCH" ]] || fail '--branch is required'
[[ "$BRANCH" != -* ]] || fail "Invalid branch name: $BRANCH"
git check-ref-format "refs/heads/$BRANCH" >/dev/null 2>&1 || fail "Invalid branch name: $BRANCH"
CALLER_ROOT=$(git rev-parse --show-toplevel) || fail 'Run from a Git working tree'
CALLER_HEAD=$(git -C "$CALLER_ROOT" rev-parse --verify 'HEAD^{commit}') || fail 'The calling worktree has no committed HEAD'

# NUL-delimited porcelain retains spaces and avoids parsing display columns.
WORKTREE_PATHS=()
IN_USE=''
RECORD_PATH=''
while IFS= read -r -d '' field; do
  case "$field" in
    'worktree '*)
      RECORD_PATH="${field#worktree }"
      WORKTREE_PATHS+=("$RECORD_PATH")
      ;;
    'branch '*)
      if [[ "$field" == "branch refs/heads/$BRANCH" ]]; then IN_USE="$RECORD_PATH"; fi
      ;;
  esac
done < <(git -C "$CALLER_ROOT" worktree list --porcelain -z)
[[ ${#WORKTREE_PATHS[@]} -gt 0 ]] || fail 'Cannot read Git worktree inventory; requires git worktree list --porcelain -z'
MAIN_REPO="${WORKTREE_PATHS[0]}"
REPO_NAME=$(basename "$MAIN_REPO")
REPO_PARENT=$(dirname "$MAIN_REPO")
if [[ -z "$DIR_NAME" ]]; then DIR_NAME="${REPO_NAME}-worktree-${BRANCH##*/}"; fi
case "$DIR_NAME" in
  .|..|*/*|*$'\n'*|*$'\r'*|*$'\t'*) fail '--dir must be one sibling directory name without control characters' ;;
esac
WORKTREE_PATH="${REPO_PARENT}/${DIR_NAME}"

if [[ -e "$WORKTREE_PATH" || -L "$WORKTREE_PATH" ]]; then
  conflict "Target already exists: $WORKTREE_PATH. Ask the user to choose another directory or use the existing workspace; nothing was overwritten."
fi
for registered in "${WORKTREE_PATHS[@]}"; do
  if [[ "$registered" == "$WORKTREE_PATH" ]]; then
    conflict "Target is already registered with Git: $WORKTREE_PATH. Ask the user to choose another directory or repair the registration; do not prune automatically."
  fi
done

BRANCH_EXISTS=false
if git -C "$CALLER_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then BRANCH_EXISTS=true; fi
if [[ "$BRANCH_EXISTS" == true ]]; then
  [[ -z "$IN_USE" ]] || conflict "Branch '$BRANCH' is checked out at $IN_USE. Ask the user to use that workspace or choose another branch."
  [[ "$REUSE_EXISTING" == true ]] || conflict "Branch '$BRANCH' already exists. Ask the user to choose another name or explicitly reuse it with --reuse-existing."
  BASE_COMMIT=$(git -C "$CALLER_ROOT" rev-parse --verify "refs/heads/$BRANCH^{commit}")
  if [[ -n "$BASE_REF" ]]; then
    REQUESTED_COMMIT=$(git -C "$CALLER_ROOT" rev-parse --verify --end-of-options "${BASE_REF}^{commit}") || fail "Invalid base: $BASE_REF"
    [[ "$BASE_COMMIT" == "$REQUESTED_COMMIT" ]] || conflict "Existing branch and --base resolve to different commits. Ask the user to reuse the branch as it is or create a new branch from the requested base."
  fi
else
  [[ "$REUSE_EXISTING" == false ]] || fail '--reuse-existing requires an existing branch'
  BASE_COMMIT="$CALLER_HEAD"
  if [[ -n "$BASE_REF" ]]; then
    BASE_COMMIT=$(git -C "$CALLER_ROOT" rev-parse --verify --end-of-options "${BASE_REF}^{commit}") || fail "Invalid base: $BASE_REF"
  fi
fi

printf '[INFO] Caller: %s\n[INFO] Base commit: %s\n' "$CALLER_ROOT" "$BASE_COMMIT"
if [[ "$BRANCH_EXISTS" == true ]]; then
  git -C "$CALLER_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH"
else
  git -C "$CALLER_ROOT" worktree add -b "$BRANCH" "$WORKTREE_PATH" "$BASE_COMMIT"
fi
printf '[OK] Worktree created\nPath: %s\nBranch: %s\nBase commit: %s\n' "$WORKTREE_PATH" "$BRANCH" "$BASE_COMMIT"
