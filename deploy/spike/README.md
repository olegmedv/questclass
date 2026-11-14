# FEAT-050 — проверка доступа из РФ

**Развёрнуто 14.11.2026** на своём VPS.

## Адрес для проверки

**https://questclass.duckdns.org/**

Страница с кнопками «Скачать 1 / 10 / 100 МБ» и «Проверить перемотку». Открывать **без VPN**, по очереди:
1. дома по Wi-Fi;
2. с мобильного интернета пользователя в РФ.

Результат (скриншот страницы) вписать в таблицу ниже. Если 100 МБ не скачиваются целиком или перемотка не работает, видео через этот сервер отдавать нельзя: нужен прокси в РФ, плеер (FEAT-031) и деплой (FEAT-046) не начинаются.

| Где | Сеть | 1 МБ | 10 МБ | 100 МБ | Перемотка | Дата |
|---|---|---|---|---|---|---|
| ПК в Канаде (контроль) | проводная | — | — | ✅ 100 МБ, ~190 Мбит/с | ✅ 206 | 14.11.2026 |
| РФ | домашний Wi-Fi | | | | | |
| РФ | мобильный | | | | | |

## Что сделано на сервере
- `/opt/questclass/spike/`: `docker-compose.yml` (отсюда) + `www/` (`index.html` и случайные `test-{1,10,100}mb.bin`).
- Контейнер `questclass`: образ `caddy:2-alpine` в режиме `file-server`, сеть `shared_web`, `mem_limit: 64m`, около 32 МБ RAM.
- `/opt/caddy/Caddyfile`: в конец дописан блок `questclass.duckdns.org { reverse_proxy questclass:8080 }`.
  - Дописан через `>>`, inode сохранён, поэтому bind-mount в контейнер Caddy видит изменения.
  - Бэкап: `/opt/caddy/Caddyfile.bak-2026-11-14-questclass`.
  - `caddy validate` → OK, `caddy reload` без остановки.
  - Сертификат Let's Encrypt выпущен автоматически.

## Остальные сайты до и после (HTTPS, код ответа)
| Домен | До | После |
|---|---|---|
| site-a.example.org | 200 | 200 |
| landing.site-a.example.org | 200 | 200 |
| mcp.site-a.example.org | 400 | 400 |
| site-b.example.org | 200 | 200 |
| site-c.example.org | 502 | 502 (контейнера codex нет и до правки) |

## Наблюдения
- `shared_web` = `172.21.0.0/16`, входит в `DEFAULT_TRUSTED_PROXIES` (FEAT-002/005).
- **Диск: свободно 23 ГБ из 77** (занято 72%). Из них 43 ГБ — `другие данные сервера`. На видео с удалением через 30 дней нужно 10–20 ГБ, это впритык; освобождать место решает владелец сервера.
- RAM: доступно около 1 ГБ (free + cache).

## Откат
```
cd /opt/caddy && cat Caddyfile.bak-2026-11-14-questclass > Caddyfile && docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
cd /opt/questclass/spike && docker compose down
```
