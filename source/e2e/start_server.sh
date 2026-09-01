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
# Lift the POST /auth/login rate limit (10/min per IP). The suite logs in far
# more often than that from one address, so without this it starts answering
# 429 partway through. Set here rather than in the npm script so it only
# applies to a server we start ourselves -- against an external TEST_TARGET it
# would be inert anyway, since the limit is enforced in the server's env.
: "${TEST:=1}"

export ROOT_DIR
export FILES_DIR
export MAIL_FAKE
export TEST

# Run the *server's* start script, never the workspace root's. The root one
# hardcodes EXPERIMENTAL=1, which makes config.ts mark `experimental` as
# env-locked, and the admin config page then renders that row without its
# edit button -- config.spec.ts can't toggle it. CI never sees this: the
# packed tarball moves server/* to its root, so `npm start` there is already
# the server's script. Two layouts, one entry point.
if [ -f "$ROOT_DIR/source/server/package.json" ]; then
  # Development checkout.
  npm --prefix "$ROOT_DIR/source/server" start
else
  # Packed tarball or container image: the server is the root package.
  (
    set -e
    cd "$ROOT_DIR"
    npm start
  )
fi
