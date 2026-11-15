# Развернуть КвестКласс с нуля

КвестКласс — один процесс Node. Он отдаёт API, собранное веб-приложение и медиа, а данные хранит в одной папке: база SQLite, ключ шифрования и файлы. HTTPS обеспечивает обратный прокси (Caddy, nginx).

Ниже — установка на чистый сервер через Docker. Как устроен деплой на сервере автора (общий Caddy для нескольких проектов, скрипт с откатом) — в [deploy/README.md](../deploy/README.md).

## Что нужно

- Сервер или ПК с Docker и Docker Compose. Приложению хватает 256 МБ памяти, образ — до 250 МБ.
- Домен, который указывает на сервер, и открытые порты 80 и 443. Без домена можно попробовать локально (см. ниже).
- Для видеоуроков — компьютер админа с Node 22 и ffmpeg. Сервер видео не перекодирует.

## 1. Собрать и запустить

```sh
git clone https://github.com/olegmedv/questclass.git
cd questclass
DOMAIN=quest.example.com docker compose -f deploy/docker-compose.example.yml up -d --build
```

[deploy/docker-compose.example.yml](../deploy/docker-compose.example.yml) собирает образ из [deploy/Dockerfile](../deploy/Dockerfile) и запускает рядом Caddy. Caddy сам получает сертификат Let's Encrypt для `DOMAIN`. Данные лежат в томе `questclass-data`.

Попробовать без домена:

```sh
docker build -f deploy/Dockerfile -t questclass .
docker run -d --name questclass -p 8080:8080 -v questclass-data:/data questclass
```

Откройте **http://localhost:8080** на этом же компьютере. Cookie входа помечены `Secure`. Браузеры принимают их по HTTPS и на `localhost`, а по `http://<IP>` вход не сохранится — для доступа с других устройств нужен HTTPS.

Свой прокси вместо Caddy из примера: проксируйте всё на порт 8080 контейнера и **сохраняйте заголовок `Host`**. Запросы на изменение принимаются только с того же адреса, с которого открыт сайт. Caddy сохраняет `Host` сам, в nginx нужно `proxy_set_header Host $host;`. `X-Forwarded-For` приложение читает только от адресов из настройки «Доверенные прокси»; по умолчанию это частные сети 10/8, 172.16/12 и 192.168/16.

## 2. Первый вход

Пока в системе нет админа, при каждом старте приложение печатает в лог одноразовый код установки:

```sh
docker compose -f deploy/docker-compose.example.yml logs questclass | grep "setup token"
```

Откройте `https://<домен>/setup`, введите код и создайте первого админа (родителя). После этого код больше не выдаётся.

## 3. Настроить

Переменные окружения нужны только для запуска: `PORT` (8080), `DATA_DIR` (`/data`), `NODE_ENV` (`production`). В образе они уже заданы. Всё остальное настраивается в кабинете:

- **Настройки** — часовой пояс (по умолчанию Europe/Kaliningrad), сессии, тесты, видео, экономика, серия занятий; ключи API (хранятся зашифрованными); токены импорта уроков.
- **Пользователи** — ученики с PIN-кодом и другие админы. Ученик входит только с «детского» устройства: админ входит на нём в кабинет и нажимает «Сделать устройство детским».
- **Предметы, Задания, Магазин, Награды** — содержимое. При первом запуске уже созданы предметы, каталог магазина (герои, комнаты, билеты) и причины наград.
- **Оформление** — логотип, праздник за серию, звуки. Картинки товаров меняются в карточке товара, значки — в «Предметах».

## 4. Уроки

Видео в репозитории нет, свежая установка начинается без уроков. Видеоурок готовится на компьютере админа инструментом [tools/lesson-prep](../tools/lesson-prep/README.md): он делает HLS из MP4 и загружает урок с вопросами через API импорта. Токен для него создаётся в «Настройки → Импорт уроков». Задания «тест» и «дело» создаются прямо в кабинете.

## База данных

- SQLite (режим WAL) в `DATA_DIR/questclass.db`.
- Схема описана в `apps/api/src/db/schema/*.ts` (Drizzle). Изменения — SQL-миграции в [apps/api/src/db/migrations](../apps/api/src/db/migrations).
- Миграции применяются автоматически при старте, до приёма запросов. Перед применением приложение сохраняет копию базы в `DATA_DIR/snapshots/pre-migrate-*.db`.
- Миграции только расширяющие (новые таблицы и колонки), поэтому предыдущая версия образа работает на новой схеме.
- Что в какой таблице — [docs/DATABASE.md](DATABASE.md).

## Данные и бэкап

Папка данных (`/data` в контейнере):

| Путь | Что это |
|---|---|
| `questclass.db` (+ `-wal`, `-shm`) | база |
| `master.key` | ключ, которым зашифрованы ключи API в настройках. **Без него их не расшифровать** — сохраните копию отдельно от бэкапов |
| `media/` | видео уроков (HLS), картинки вопросов, загрузки кабинета, замены из «Оформления» |
| `snapshots/` | копии базы перед миграциями |

Согласованная копия базы без остановки:

```sh
docker compose -f deploy/docker-compose.example.yml exec questclass node dist/cli.js backup /data/backups
```

К бэкапу добавьте папку `media/`. Восстановление: остановить контейнер, положить `questclass.db` и `media/` в папку данных (владелец — uid 1000), запустить.

## Обновление

```sh
git pull
DOMAIN=quest.example.com docker compose -f deploy/docker-compose.example.yml up -d --build
```

Новые миграции применятся при старте. Чтобы откатиться, достаточно собрать предыдущий коммит: данные он не испортит.

## Забыли пароль админа

```sh
docker compose -f deploy/docker-compose.example.yml exec -T questclass node dist/cli.js reset-password <логин> < /dev/null
```

Команда сгенерирует новый пароль и напечатает его. Чтобы задать свой пароль, передайте его первой строкой stdin вместо `/dev/null`. Все сессии этого админа завершаются.

## Без Docker

Нужны Node 22 и corepack:

```sh
corepack pnpm install
corepack pnpm build
NODE_ENV=production PORT=8080 DATA_DIR=/var/lib/questclass node apps/api/dist/index.js
```

Собранное веб-приложение (`apps/web/dist`) сервер находит сам, рядом со своей сборкой.

## Разработка

```sh
corepack pnpm install
corepack pnpm dev        # API (tsx watch) и Vite; данные — в apps/api/.data
corepack pnpm test       # Vitest: unit и API на временной SQLite
corepack pnpm lint && corepack pnpm typecheck
```

Правила кода и архитектуры — в [CLAUDE.md](../CLAUDE.md). E2E-тесты (Playwright) и их эталонные скриншоты запускаются только в Linux-контейнере: `node e2e/docker.mjs`.
