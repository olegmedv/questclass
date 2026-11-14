# Деплой КвестКласс 2 на VPS (FEAT-046)

Приложение работает одним контейнером `questclass` за общим Caddy своего VPS.
Адрес: **https://questclass.duckdns.org**.

## Что лежит на сервере

| Путь | Что это |
|---|---|
| `/opt/questclass/docker-compose.yml` | копия `deploy/docker-compose.yml` |
| `/opt/questclass/deploy.sh` | копия `deploy/deploy.sh` |
| `/opt/questclass/current-tag`, `previous-tag` | какой образ запущен и на какой откатываться (пишет `deploy.sh`) |
| `/opt/questclass/data/` | том приложения, владелец uid 1000, права 700: `questclass.db`, `master.key`, `media/`, `snapshots/` |
| `/opt/questclass/spike/` | остановленная проверка FEAT-050 (можно удалить) |

Блок в `/opt/caddy/Caddyfile` (другой проект, правится только с бэкапом, через `cat … > Caddyfile`, чтобы сохранить inode, затем `caddy validate` и `caddy reload`):

```
questclass.duckdns.org {
    encode zstd gzip
    reverse_proxy questclass:8080
}
```

Контейнер: сеть `shared_web` (172.21.0.0/16, входит в доверенные прокси по умолчанию — настройка `http.trustedProxies`), `mem_limit: 256m`, логи json-file 10m × 3, `restart: unless-stopped`.

## Обновление

Образ собирает GitHub Actions (`release.yml`) при push в `main`: `ghcr.io/olegmedv/questclass:<sha>` и `:latest`, пакет приватный.

```
ssh root@<сервер>
cd /opt/questclass
./deploy.sh up <sha>      # скачает образ, перезапустит, дождётся /api/health через Caddy
./deploy.sh status
```

Если новый образ не стал здоровым за 90 с, `deploy.sh` сам возвращает предыдущий тег.

Скачивание из GHCR требует входа один раз: `docker login ghcr.io -u olegmedv` с classic-токеном, у которого **только** `read:packages`.

Пока входа нет, образ можно отправить с ПК напрямую (тег на сервере тот же):

```
docker build -f deploy/Dockerfile -t ghcr.io/olegmedv/questclass:<tag> .
docker save ghcr.io/olegmedv/questclass:<tag> | gzip -1 | ssh root@<сервер> 'gunzip | docker load'
ssh root@<сервер> /opt/questclass/deploy.sh up <tag>
```

## Откат

```
./deploy.sh rollback
```

Данные не трогаются: миграции только расширяющие, поэтому предыдущий образ работает на новой схеме.

Крайний случай — миграция испортила данные. Перед каждой миграцией приложение делает снимок в `data/snapshots/pre-migrate-*.db`:

```
ls /opt/questclass/data/snapshots
./deploy.sh restore-snapshot pre-migrate-<…>.db --yes
```

База заменяется снимком, старые файлы остаются рядом как `*.before-restore-<время>`, запускается **предыдущий** тег. Всё, что записано после снимка, теряется.

## Первый запуск (14.11.2026)

1. `docker compose -f /opt/questclass/spike/docker-compose.yml down` — проверочный контейнер FEAT-050 освобождает имя `questclass`; блок Caddy при этом не меняется.
2. `./deploy.sh up <tag>`.
3. Setup-токен — из `docker logs questclass`; по нему создан первый админ (пароль у владельца).
4. `master.key` из `data/` владелец сохраняет офлайн: без него не расшифровать ключи API в настройках (бэкапы — FEAT-047, после MVP).

## Служебные команды

```
docker exec questclass node dist/cli.js reset-password <login>
docker exec questclass node dist/cli.js backup /data/backups
./deploy.sh logs 200
```

## Проверка после деплоя

- `https://questclass.duckdns.org/api/health` → 200.
- Остальные домены сервера отвечают тем же кодом, что до деплоя (`site-a…` 200, `landing.site-a…` 200, `mcp.site-a…` 400, `site-b…` 200, `site-c…` 502 — контейнера нет и до деплоя).
