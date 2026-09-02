#!/bin/sh
set -eu
mkdir -p /data /objects
if [ "$(id -u)" = "0" ]; then
  chown node:node /data /objects || true
  exec runuser -u node -- node dist/app/main.js
fi
exec node dist/app/main.js
