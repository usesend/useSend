#!/bin/sh

set -x

echo "Deploying prisma migrations"

./node_modules/.bin/prisma migrate deploy --schema ./apps/web/prisma/schema.prisma

echo "Starting web server"

node apps/web/server.js
