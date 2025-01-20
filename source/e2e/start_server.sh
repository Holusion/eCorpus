#!/bin/sh
set -e
#clean up previous runs
rm -rf /tmp/ecorpus-test-server.*

TMP="$(mktemp -d /tmp/ecorpus-test-server.XXXXX)"

: "${ROOT_DIR:="$( cd "$( dirname "$0" )/../.." && pwd )"}"
: "${FILES_DIR:="$TMP"}"

export ROOT_DIR
export FILES_DIR

(
  set -e
  cd "$ROOT_DIR"
  npm start
)