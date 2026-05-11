#!/bin/sh
set -e

TMP="$(mktemp -d /tmp/ecorpus-test-server.XXXXX)"
# Clean up only this run's working dir on exit, so concurrent runs are safe.
trap 'rm -rf "$TMP"' EXIT INT TERM

: "${ROOT_DIR:="$( cd "$( dirname "$0" )/../.." && pwd )"}"
: "${FILES_DIR:="$TMP"}"
# Swallow every email into the nodemailer json transport so e2e never
# attempts a real SMTP connection. send.ts checks for this var.
: "${MAIL_FAKE:=1}"

export ROOT_DIR
export FILES_DIR
export MAIL_FAKE

(
  set -e
  cd "$ROOT_DIR"
  npm start
)