#!/bin/sh
# Publica somente dist já verificado. Não executa build, reload ou restart.
set -eu
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_dir"
test -s apps/web/dist/index.html
test -s apps/client/dist/index.html
release_id=$(date -u +%Y%m%dT%H%M%SZ)
release_dir="$repo_dir/.deploy/releases/$release_id"
mkdir -p "$repo_dir/.deploy/releases"
mkdir "$release_dir"
cp -R apps/web/dist/. "$release_dir/"
mkdir "$release_dir/client"
cp -R apps/client/dist/. "$release_dir/client/"
ln -s "releases/$release_id" "$repo_dir/.deploy/current.next"
mv -Tf "$repo_dir/.deploy/current.next" "$repo_dir/.deploy/current"
printf 'Publicado: %s\n' "$release_dir"
