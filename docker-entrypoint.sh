#!/bin/sh
# Bind mount ile gelen veri klasörü genelde root'a aittir. Root olarak başlatıldıysak
# klasörü node kullanıcısına verip yetkiyi düşürürüz; uygulama hiçbir zaman root çalışmaz.
set -eu

data_dir=$(dirname "${DB_PATH:-/data/rafta.db}")

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir"
  if [ "$(stat -c %u "$data_dir")" != "$(id -u node)" ]; then
    chown node:node "$data_dir"
  fi
  # Önceki sürümlerden kalan dosyalar da okunabilir/yazılabilir olsun.
  find "$data_dir" -maxdepth 1 \( -name 'rafta.db*' -o -name 'secret.key' \) ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
