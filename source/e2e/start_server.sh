#!/bin/sh
set -e

TMP="$(mktemp -d /tmp/ecorpus-test-server.XXXXX)"
# Clean up only this run's working dir on exit, so concurrent runs are safe.
trap 'rm -rf "$TMP"' EXIT INT TERM

: "${ROOT_DIR:="$( cd "$( dirname "$0" )/../.." && pwd )"}"
: "${FILES_DIR:="$TMP"}"

export ROOT_DIR
export FILES_DIR

(
  set -e
  cd "$ROOT_DIR"
  npm start
)