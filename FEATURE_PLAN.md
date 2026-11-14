# Feature Plan

Generated: 2026-11-14. Description: "MVP (Этап 1) КвестКласс 2 по docs/SPEC.md §9 с учётом §1–§8; поведение — docs/spec/01 и 02 (только пункты MVP); визуал — docs/reference-screens/. Репозиторий пустой — план с нуля: каркас, дизайн-система, auth, задания с плагинами типов, импорт видео, плеер, прогресс с ручным управлением админом, экономика, магазин, герой, админка, настройки с секретами, сид 5 уроков, деплой на общий Caddy немецкого VPS. Ограничение: ≤200 МБ RAM." Source CLAUDE.md: `CLAUDE.md`.

## Summary
- Total items: 56
- Pending: 15 | Done: 40 (FEAT-001–FEAT-031, FEAT-035, FEAT-038, FEAT-048–FEAT-054; FEAT-050 условно) | Blocked: 1 (FEAT-047 отложен до после MVP) | Superseded: 0
- Items requiring user decision: 3 — FEAT-050 и FEAT-046: SSH разрешён пользователем 14.11.2026; FEAT-047 отложен до после MVP
- Critic iterations: 3 (+ патч после вердикта)
- Critic verdict: halted at max iterations; HIGH и MED третьего круга закрыты патчем после вердикта (повторно не критиковались), 11 LOW — известные риски

## Discovery (2026-11-14)

Discovery выполнен вручную, без Explore-агента: в репозитории нет кода, сканировать нечего. Источники — документы и оригинал, только чтение.

- Related code found:
  - Кода приложения нет. В репо: `CLAUDE.md`, `README.md`, `docs/SPEC.md`, `docs/spec/01–04`, `docs/research/*`, `docs/reference-screens/*` (39 desktop / 38 mobile).
  - `docs/SPEC.md` §9 «Этап 1 — MVP»: 12 пунктов; §8 — черновик модели данных; §3 — дизайн-система (5 шаблонов, ~20 компонентов); §4 — видео HLS/MP4; §5 — `lesson-prep import`.
  - `docs/spec/01-learning-core.md` — 106 пунктов чеклиста (уроки, плеер, тесты, автооткрытие, серия, PIN, отчёты, сброс).
  - `docs/spec/02-game-economy.md` — 110 пунктов (баланс, награды, магазин, билетики, герой, комнаты; коллекции, искры и ачивки — этап 2).
  - Оригинал (`QuestClass-Source/`, только чтение):
    - токены темы `--q-*` — в `app/focus-theme.css`;
    - каталоги — `lib/game.ts` (магазин, персонаж), `lib/room-assets.ts` (`builtinRooms`, `roomCategories`), `lib/live-set-assets.ts`, `lib/economy-settings.ts` (числа экономики);
    - контент сида — `lib/subtitle-lesson-pack.json` (61 урок; для 5 сид-уроков нужно 53 картинки из `public/quiz/visual/`).
  - Ассеты MVP в `QuestClass-Source/public/` (≈60 МБ):
    - игровая графика — `game/characters` 20 МБ, `game/rooms` 22 МБ, `game/fitting-room` 4 МБ, `game/menu`;
    - звуки — `game/ui-audio`;
    - прочее — `icons` 5,5 МБ, `rewards` 2 МБ, `celebrations` 4 МБ, `fonts` 1,5 МБ, часть `quiz` (из 18 МБ).
  - `D:\User\repos\YTsubsdownloader\ytsubs.py` — выгрузка субтитров. В MVP не используется, понадобится на этапе 2.
- Related items in existing plans:
  - `FEATURE_PLAN.md` и `REFACTOR_PLAN.md` отсутствуют.
- Probable conflicts or extensions:
  - Расхождения оригинала, которые ТЗ правит намеренно:
    - тест засчитывается при ≥1 верном ответе, поэтому пересдача с разрешения родителя на деле не работает (`spec/01` §итог);
    - автооткрытие уроков включается миграцией при чтении.
  - Сервер: 0,8 ГБ свободной RAM, общий Caddy `/opt/caddy/Caddyfile` (правка только с бэкапом + `caddy validate` + `reload`), сеть `shared_web`.
- No related code found for: каркас монорепо, БД и миграции, auth, настройки и секреты, дизайн-система, типы заданий, импорт, плеер, прогресс, ledger, магазин, герой, админка, деплой.

## Clarification (2026-11-14)

- Q: «Картинки и звуки оригинала для MVP (~60 МБ) — где хранить?»
  Discovery context: ассеты в `QuestClass-Source/public/` (персонажи 20 МБ, комнаты 22 МБ, анимации 14 МБ, иконки, награды, звуки).
  Options offered: в git, пережатые / Git LFS / вне git.
  User answer: **в git, пережатые** (только нужное для MVP).

- Q: «Где собирать Docker-образ? На сервере свободно ~0,8 ГБ RAM.»
  Discovery context: общий VPS (Caddy и другие проекты), сборка Vite на нём рискованна.
  Options offered: GitHub Actions → GHCR / на ПК / на сервере.
  User answer: **GitHub Actions → GHCR**.

- Q: «Анимации героев и комнат (живые герои, анимированные комнаты, движения в примерочной) — в MVP или позже?»
  Discovery context: `spec/02` §2.8 — живые герои (анимированный WebP, одна анимация одновременно), 9 экшен-анимаций, ambient-темы комнат, «Ночной отель» (слои + случайные события + звуки), эффект переодевания 260/380 мс.
  Options offered: статика в MVP, анимации позже / всё в MVP.
  User answer: **всё в MVP**.

- Q: «Когда тест считается пройденным? В оригинале хватало 1 верного из 3.»
  Discovery context: `spec/01` — порог ≥1 делает пересдачу «с разрешения родителя» мёртвой.
  Options offered: порог в настройках / как в оригинале / только полный зачёт.
  User answer: **порог в настройках**: по умолчанию 2 из 3, 1 автоматическая пересдача, дальше — по разрешению админа; награда пропорциональна доле верных.

- Решения планировщика (технические, в рамках CLAUDE.md):
  - Node раздаёт API, SPA и медиа (Range); Caddy — только `reverse_proxy` (не трогаем тома чужого Caddy). Внесено в CLAUDE.md.
  - Auth своя: scrypt (node:crypto) + таблица сессий; без внешних auth-библиотек ради RAM и простоты.
  - В MVP нижнее меню ученика: «Учёба · Герой · Магазин» + «Награды» в шапке. «Набор» (коллекции), «Игры» и «Стар» — этапы 2–3, в MVP их нет (не заглушки).

## Items

<!-- Итерация 2. Порядок в файле = порядок выполнения (ID стабильны, поэтому не по возрастанию).
     Фазы: A — основа и безопасность, B — домен и API, C — web ученика, D — админка, E — деплой.
     Общие требования ко всем пунктам с таблицами: индексы и UNIQUE указаны в схеме; каждый пункт с маршрутами
     добавляет свои строки в матрицу доступа FEAT-049; каждый пункт с настройками добавляет свой файл
     ключей в `packages/shared/src/settings/keys/`. -->

**Общие точки регистрации.** Каждый пункт может только *добавлять строки* в эти файлы, даже если они не перечислены в его Scope (Iteration 3, Critique 2 HIGH#4):
- `apps/api/src/app.ts` (монтирование маршрутов), `apps/api/src/startup.ts` (хуки старта: миграции, сиды, планировщик), `apps/api/src/cli/index.ts`;
- `apps/api/src/task-types/registry.ts`, `packages/shared/src/tasks/registry.ts`, `packages/shared/src/settings/keys/*.ts` + `registry.ts`;
- `apps/api/src/db/schema/index.ts`, `apps/api/test/access-matrix.test.ts`;
- `apps/web/src/app/router.tsx`, `apps/web/src/task-types/registry.ts`, `packages/ui/src/index.ts`, `apps/web/src/screens/dev/UiGallery.tsx`;
- `docs/PARITY.md`, `docs/PLACEHOLDERS.md`, `scripts/assets/mvp-assets.txt`.

### Фаза A — основа и безопасность

### FEAT-001 — Каркас монорепо
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Вместо `vitest.workspace.ts` — корневой `vitest.config.ts` с `test.projects` (файл workspace удалён в Vitest 4+, стоит Vitest 5).
  - TypeScript 6.0.x: TS 7 пока не поддерживается typescript-eslint (`<6.1`).
  - Вместе с `package.json` пакетов добавлены их `tsconfig.json`, `build.mjs` (esbuild-бандл api и lesson-prep, shared инлайнится), `apps/web/{index.html,vite.config.ts}`; в `.gitignore` — `dist/`, `coverage/`, `/data/`, `/.claude/worktrees/`.
  - Корневые скрипты вызывают `corepack pnpm` (pnpm не обязан быть в PATH); `packageManager` = pnpm 10.34.9.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §7; CLAUDE.md «Стек», «Структура», «Команды».
- **Rule**: CLAUDE.md «Стек», «Структура», 14
- **Scope**:
  - `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.gitattributes` (+ `*.ogg *.mp3 *.woff2 *.ttf *.mp4 binary`), `tsconfig.base.json`, `eslint.config.mjs`, `.stylelintrc.json`, `.prettierrc`, `vitest.workspace.ts`
  - `apps/{api,web}/package.json` + минимальные `src/`, `packages/{shared,ui}/package.json` + `src/index.ts`, `tools/lesson-prep/package.json` + `src/cli.ts`
- **Depends on**: none
- **DoD**:
  - `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` — зелёные (`vitest --passWithNoTests`, без тестов-заглушек).
  - stylelint настроен: цвета (`color-no-hex` и именованные) разрешены только в `packages/ui/src/tokens.css`.

### FEAT-051 — Сортировка чеклистов паритета (PARITY.md)
- **Status**: done — docs/PARITY.md, scripts/parity-check.mjs (--strict зелёный), решения пользователя 14.11.2026 внесены
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §11 «все пункты модулей… отмечены, или перенесены в „не переносить“, или отложены с причиной»; Critique 1 HIGH#10.
- **Rule**: —
- **Scope**:
  - `docs/PARITY.md`, `scripts/parity-check.mjs`, `FEATURE_PLAN.md` (дописать пункты из «MVP-пункты без FEAT»)
- **Depends on**: none
- **DoD**:
  - Каждая строка чеклистов `docs/spec/01` и `docs/spec/02` получает метку и колонку «Нужно решение пользователя (Y/N)» в таблице:
    - `MVP → FEAT-NNN`;
    - `Этап 2`;
    - `Покрыто иначе → FEAT-NNN (как)`;
    - `Не переносить (причина)`.
  - Строк без метки 0; проверяет скрипт `scripts/parity-check.mjs` (считает строки `- [ ]` в спеках и в PARITY.md).
  - Отдельный список «MVP-пункты без FEAT». Если он не пуст, пункты дописываются в план до старта фазы C.
  - Уже решено в этой итерации (вносится в таблицу):
    - «Пройти с мамой» → FEAT-009 (переоткрыть задание);
    - ротация предметов и полный сброс → FEAT-009;
    - режимы просмотра → FEAT-013;
    - разминка и обучение ребёнка → Этап 2.

### FEAT-050 — Проверка доступа из РФ (спайк на сервере)
- **Status**: done — развёрнуто 14.11.2026 (deploy/spike/README.md). Со слов пользователя, другие его сайты на этом IP открываются из РФ. **Открытый риск:** замер скачивания 100 МБ из КГД не сделан, повторить перед FEAT-046.
- **Risk**: HIGH
- **Requires decision**: Y — разрешение на SSH и правку общего Caddyfile в момент выполнения
- **Spec reference**: SPEC §2 «Проверка до запуска видео: тестовый файл 50–100 МБ без VPN»; Critique 1 HIGH#9.
- **Rule**: аудит сервера «Что НЕ трогать»; CLAUDE.md 13
- **Scope**:
  - `deploy/spike/{docker-compose.yml,README.md,index.html}`
  - на сервере: `/opt/questclass/spike/**`, один новый блок `questclass.duckdns.org { reverse_proxy questclass:8080 }` в `/opt/caddy/Caddyfile` (бэкап `Caddyfile.bak-<дата>`)
- **Depends on**: none
- **DoD**:
  - Временный контейнер `questclass` (статический сервер, ≤20 МБ RAM) в сети `shared_web` отдаёт страницу и тестовые файлы 1, 10 и 100 МБ с поддержкой Range.
  - `caddy validate` и `caddy reload` без остановки. Все остальные домены сервера отвечают тем же кодом, что до правки (снимок `curl -o /dev/null -w %{http_code}` до и после — в README).
  - Пользователь скачал 100 МБ из РФ без VPN (домашний и мобильный интернет) и записал скорость в README.
  - Если не скачалось — архитектура доставки пересматривается (прокси в РФ). От этого пункта зависят FEAT-031 (плеер) и FEAT-046 (деплой), так что видео без проверки не дойдёт до пользователя.
  - Пункт выполняется **первым**, как только пользователь даст доступ по SSH.

### FEAT-002 — Скелет API
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Вне перечня Scope, но требуется DoD: `packages/shared/src/net.ts` (`DEFAULT_TRUSTED_PROXIES`), зависимости в `apps/api/package.json` (hono, @hono/node-server, zod), `.gitignore` (`.data/` — дефолтный DATA_DIR в dev).
  - Реестр маршрутов: `createApp(ctx).routes`; `buildApp(ctx, routes, {middlewares})` — для тестов HTTP-слоя и подключения auth (FEAT-004).
  - SIGTERM проверяется в процессе (инъекция источника сигналов): на Windows сигнал дочернему процессу не перехватывается. Закрытие БД добавит FEAT-003 (closer в `startup.ts`).
  - `node scripts/measure-rss.mjs` (после `pnpm build`): RSS в простое 61 МиБ (Windows, prod-бандл).
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: CLAUDE.md 3, 7, 11, 13; Critique 1 MED#15, LOW (SIGTERM).
- **Rule**: CLAUDE.md 3, 7, 11, 13
- **Scope**:
  - `apps/api/src/{index.ts,app.ts,startup.ts,config.ts,shutdown.ts}`, `apps/api/src/http/{errors.ts,validate.ts,route.ts,bodyLimit.ts,origin.ts,clientIp.ts}`, `apps/api/src/modules/health/routes.ts`
  - `apps/api/test/{health,http}.test.ts`, `scripts/measure-rss.mjs`
- **Depends on**: FEAT-001
- **DoD**:
  - Маршрут регистрируется только через `route({method, path, roles: Role[], handler})`, где `Role = 'public'|'admin'|'learner'|'import'`; реестр маршрутов доступен для тестов.
  - `clientIp(req)`: `X-Forwarded-For` учитывается только если запрос пришёл от доверенного прокси. Список по умолчанию — общая константа `DEFAULT_TRUSTED_PROXIES` в `packages/shared/src/net.ts` (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`); FEAT-005 подключает ключ `http.trustedProxies` с тем же дефолтом. Тесты: подделанный XFF от недоверенного адреса игнорируется.
  - `GET /api/health` (public) → 200. Ошибки отдаются единым JSON `{error:{code,message}}`, zod → 400 (тесты).
  - Лимит тела запроса 1 МБ по умолчанию (413). Изменяющие запросы с чужим `Origin` или `Sec-Fetch-Site: cross-site` → 403 (тесты).
  - Env: только `PORT`, `DATA_DIR`, `NODE_ENV` (тест). На SIGTERM закрываются HTTP и БД (тест).
  - RSS в простое < 80 МБ (`measure-rss`).

### FEAT-003 — БД, миграции, dayKey/weekKey
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Своих таблиц пока нет, поэтому папки `migrations/` в git ещё нет (первую миграцию создаст FEAT-006 через `pnpm db:generate`); отсутствие журнала = «миграций нет». Механизм проверен тестами на фикстурных миграциях: новый БД без снимка, снимок перед новой миграцией, хранится 5, откат упавшей миграции.
  - Снимок делается только если в БД уже есть применённые миграции (новой пустой БД защищать нечего).
  - `weekKey` = ISO-неделя `YYYY-Www` (с понедельника), чтобы ключ недели не совпадал с форматом `dayKey`.
  - Вне Scope (необходимо): `apps/api/build.mjs` копирует миграции в `dist/migrations`; `apps/api/package.json` (better-sqlite3 ~13.1.1, drizzle-orm, drizzle-kit, `db:generate`); `pnpm-workspace.yaml` — better-sqlite3 в `ignoredBuiltDependencies`: v13 содержит N-API prebuilds (в т.ч. linux-x64/musl), компиляция не нужна. `AppContext` получил `db`, поэтому тесты FEAT-002 (`health`, `http`) переведены на временный DATA_DIR через `test/helpers/db.ts` (проверки не ослаблены); `buildApp` принимает только `HttpContext`.
  - Закрытие БД по SIGTERM проверено в `db.test.ts` (closer из `startup.ts`).
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §1 «SQLite (WAL)… миграции явные»; CLAUDE.md 2, 12; Critique 1 LOW (weekKey), MED#19 (снимок перед миграцией).
- **Rule**: CLAUDE.md 2, 12
- **Scope**:
  - `apps/api/src/db/{client.ts,migrate.ts,snapshot.ts,schema/index.ts}`, `apps/api/drizzle.config.ts`, `apps/api/src/db/migrations/**`
  - `packages/shared/src/time/{dayKey.ts,weekKey.ts}`, `apps/api/test/helpers/db.ts`, `apps/api/test/db.test.ts`, `packages/shared/test/time.test.ts`
- **Depends on**: FEAT-002
- **DoD**:
  - WAL, `foreign_keys=ON`, `busy_timeout`. Миграции применяются до `listen`. Если есть неприменённые миграции, сначала снимок `db.backup()` в `DATA_DIR/snapshots/` (храним 5) (тесты).
  - `dayKey(ts,tz)` и `weekKey(ts,tz)` (неделя с понедельника) верны на границах суток и недели для Europe/Kaliningrad (тесты).

### FEAT-006 — Журнал действий (audit) — ядро
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Действие объявляется модулем: `defineAuditAction(name, zodSchema)`; `auditPayload(action, data)` оставляет только поля схемы и маскирует (по словам в имени поля: password, passcode, pin, token, value, secret, hash; булевы и null сохраняются). `record()` принимает только payload, собранный для того же действия; 6-й аргумент `{learnerId}`.
  - `actor_id`/`learner_id` без FK: таблицы `users` ещё нет (FEAT-004 идёт позже), а добавить FK к существующей колонке в SQLite можно только пересборкой таблицы (не expand-only). Пользователи не удаляются, поэтому ссылки не повиснут.
  - Пагинация по курсору `<at>_<id>`, новые сверху; `from` включительно, `to` исключительно (ISO 8601 с offset или epoch ms).
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §8 «audit_log»; Critique 1 MED#1, MED#17.
- **Rule**: CLAUDE.md 1
- **Scope**:
  - `apps/api/src/db/schema/audit.ts` + миграция, `apps/api/src/modules/audit/{service.ts,redact.ts,routes.ts}`, `apps/api/test/audit.test.ts`
- **Depends on**: FEAT-003
- **DoD**:
  - `audit.record(actorId, action, entity, entityId, payload)` — одна строка. Payload строится вызывающим кодом через `auditPayload(action, data)` со схемой разрешённых полей на каждое действие. Для секретов пишется только `{key, isSet}`, значение — никогда. Дополнительно маскируются поля `password|pin|token|value` (тесты: в БД после смены секрета и пароля нет их значений).
  - Сервис и `GET /api/admin/audit?learnerId&action&from&to&cursor` (роль admin; HTTP-тест маршрута — в FEAT-049). Колонка `learner_id NULL` для фильтра по ученику. Индексы `(at)`, `(entity, entity_id)`, `(learner_id, at)`.

### FEAT-005 — Настройки и секреты — ядро (без HTTP)
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Вне перечня Scope: `packages/shared/src/settings/define.ts` (`defineSetting`, `combineKeys` — вынесены, чтобы `keys/*.ts` не импортировали `registry.ts` по кругу), zod в `packages/shared/package.json`, регистрация в `schema/index.ts`, `app.ts`, `startup.ts`.
  - Модуль подключается двумя строками в `registry.ts` (`combineKeys(coreSettings, …)` для настроек и секретов); повтор ключа — ошибка при загрузке.
  - Секреты: в ядре реестр секретов пуст (ключи ИИ, Telegram, почты — этапы 2–3), механизм проверен тестовым секретом через инъекцию реестра. Ключ шифрования выводится HKDF из master.key (`keyring.derive('secrets/v1')`), имя секрета — AAD. Наружу только `{key,isSet,updatedAt}`; расшифровка — `useSecret()` для серверного кода.
  - Сервис пишет audit сам (`setting.updated {key,before,after}`, `secret.updated {key,isSet}`) в одной транзакции с изменением. Чтение кэшируется в памяти процесса и сбрасывается при `set`.
  - RSS в простое 69,8 МиБ (было 64,6).
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §1 «Конфигурация… секреты зашифрованы мастер-ключом»; Critique 1 MED#1, LOW (passRatio → целое, ключи по модулям).
- **Rule**: CLAUDE.md 6, 7
- **Scope**:
  - `apps/api/src/db/schema/{settings.ts,secrets.ts}` + миграция, `apps/api/src/modules/settings/{service.ts,masterKey.ts,crypto.ts}`, `apps/api/src/http/clientIp.ts` (подключение ключа)
  - `packages/shared/src/settings/{registry.ts,keys/core.ts}`, `apps/api/test/settings.test.ts`
- **Depends on**: FEAT-003, FEAT-006
- **DoD**:
  - Реестр собирается из файлов `keys/*.ts` (каждый модуль добавляет свой). В `core.ts`: `timezone`=Europe/Kaliningrad, `session.adminIdleMinutes`=30, `session.adminMaxHours`=12, `session.learnerDays`=180, `http.trustedProxies`=`DEFAULT_TRUSTED_PROXIES`. `clientIp()` читает ключ (тест: при настройках по умолчанию XFF от `172.18.0.2` учитывается).
  - Значения валидируются zod; неизвестный ключ — ошибка (тест). Чтение без строки возвращает дефолт и ничего не пишет (тест).
  - `DATA_DIR/master.key` (0600) создаётся при первом старте; AES-256-GCM для `secrets` (тест roundtrip). Секрет наружу никогда не отдаётся, есть только `isSet/updatedAt` (тест сервиса).

### FEAT-004 — Auth: первый админ, сессии, доверенные устройства, роли
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `GET/POST /api/setup`, `POST /api/auth/{login,learner-login,logout}`, `GET /api/auth/me`, `GET /api/auth/profiles` (public + cookie устройства), `GET/POST /api/auth/devices`, `DELETE /api/auth/devices/:id` (отзыв, строка остаётся), `GET/POST /api/admin/users`, `GET/PATCH /api/admin/users/:id` (деактивация — `PATCH {active:false}`, DELETE нет).
  - Cookies: `qc_session` (токен; в БД sha256), `qc_act` (`<ms>.<HMAC>` для idle админа, ключ `keyring.derive('session-activity/v1')`, перевыпускается на каждом запросе без записи в БД), `qc_device` (400 дней, обновляется при показе профилей). HttpOnly, SameSite=Lax, Secure в production.
  - scrypt N=2^14, r=8, p=5 (OWASP-эквивалент, 16 МиБ на хэш) и не более одного хэша одновременно — ради бюджета RAM. Для несуществующего логина считается фиктивный хэш (одинаковое время ответа).
  - Throttle: пара (аккаунт, IP) — 3 попытки без задержки, затем 1 с, 2 с, 4 с… до 15 мин; IP — 20 без задержки, затем 5 с с удвоением; ответ 429 + `Retry-After` и `details.retryAfterSec`; счётчики забываются через сутки без ошибок.
  - Setup-токен выпускается заново при каждом старте, пока админов нет (в файле только хэш, сам токен — только в логе); файл удаляется после создания первого админа.
  - `startup.ts` разделён: `openRuntime()` (ресурсы, контекст, миграции) — для сервера и CLI; `startup()` добавляет серверные хуки (выпуск setup-токена). CLI: `apps/api/src/cli/index.ts` (+ entry `cli` в `apps/api/build.mjs` → `dist/cli.js`); пароль берётся из stdin, а при запуске в терминале генерируется и печатается.
  - Вне перечня Scope: `apps/api/test/helpers/client.ts` (cookie-jar клиент и фикстуры для тестов), `apps/api/build.mjs`.
  - RSS в простое 72,3 МиБ.
- **Risk**: HIGH
- **Requires decision**: N
- **Spec reference**: SPEC §1 «Роли», §7 «Auth»; Critique 1 HIGH#3, HIGH#4, MED#16, MED#21.
- **Rule**: CLAUDE.md 11
- **Scope**:
  - `apps/api/src/db/schema/{users.ts,sessions.ts,trustedDevices.ts,loginThrottle.ts}` + миграция
  - `apps/api/src/modules/auth/{routes.ts,service.ts,setupToken.ts,throttle.ts,crypto.ts}`, `apps/api/src/modules/users/{routes.ts,service.ts}`, `apps/api/src/cli/{index.ts,resetPassword.ts}`
  - `packages/shared/src/auth/*.ts`, `apps/api/test/{auth,users,throttle}.test.ts`
- **Depends on**: FEAT-005, FEAT-006
- **DoD**:
  - **Первый запуск.** Пока админов нет, генерируется одноразовый setup-токен: пишется в лог контейнера, хэш хранится в `DATA_DIR/setup-token`. `POST /api/setup {token, login, password}` работает только с ним и только один раз (тесты).
  - **Админ.** Вход по логину и паролю (scrypt). Сессия: idle `session.adminIdleMinutes` ведётся подписанной cookie активности (HMAC от ключа, выведенного из master.key), **без записи в БД**; максимум `session.adminMaxHours`; `POST /api/auth/logout` (роли admin и learner) (тесты: GET не пишет в БД).
  - **Смена роли в браузере.** Вход ученика на устройстве завершает админ-сессию в этом браузере, и наоборот: одновременно в браузере живёт одна сессия (тест).
  - **Доверенные устройства.** Админ на устройстве нажимает «Сделать устройство детским» → `trusted_devices` (токен хранится как sha256) + долгоживущая cookie. `GET /api/auth/profiles` и вход ученика по PIN работают только с такой cookie, иначе 403 (тест). Админ может отозвать устройство.
  - **Защита от перебора.** IP берётся через `clientIp()`. Задержка растёт экспоненциально по паре (аккаунт, IP) до 15 минут, плюс общий лимит на IP. Чужой IP не блокирует владельца (тест за доверенным прокси с разными XFF).
  - **Токены сессий** хранятся как sha256-хэш (тест: в БД нет сырого токена). Cookie: HttpOnly, Secure (prod), SameSite=Lax.
  - **Пользователи.** `users.active`; удаления нет — только деактивация. Деактивированный не входит, его сессии отзываются, он не считается в «все активные ученики» (тест). Последнего активного админа деактивировать нельзя (409). Изменения пишутся в audit с маскированием секретов.
  - **Восстановление.** CLI `node dist/cli.js reset-password <login>` (через `docker exec`) работает (тест).

### FEAT-052 — HTTP API настроек и секретов
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `GET /api/admin/settings` → `[{key,value,default,isDefault,updatedAt}]`; подписи и типы полей форма (FEAT-039) берёт из общего реестра `@questclass/shared/settings/registry`. `PUT /api/admin/settings` принимает `{ "<ключ>": значение, … }` (меняются только переданные ключи), атомарно: одно неверное значение (400) или неизвестный ключ (404) — ничего не сохраняется; неизменённые значения не пересохраняются и не пишутся в audit.
  - Секреты: `GET /api/admin/secrets` → `[{key,isSet,updatedAt}]`, `PUT /api/admin/secrets/:key {value}` (только запись), дополнительно `DELETE /api/admin/secrets/:key` (очистить). В ядре секретов пока нет, поэтому HTTP-тесты секретов идут на сервисе с тестовым ключом; в матрице доступа админ на незарегистрированный ключ получает 404.
  - Строки FEAT-049 добавлены (5 маршрутов).
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §1 «Конфигурация»; Critique 1 MED#1.
- **Rule**: CLAUDE.md 6, 11
- **Scope**:
  - `apps/api/src/modules/settings/routes.ts`, `apps/api/test/settings-api.test.ts`
- **Depends on**: FEAT-004
- **DoD**:
  - `GET/PUT /api/admin/settings` (по реестру), `PUT /api/admin/secrets/:key` (только запись), `GET /api/admin/secrets` → `[{key,isSet,updatedAt}]` (тесты). Всё пишется в audit.

### FEAT-049 — Матрица доступа (сквозной тест)
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Кроме «у каждого маршрута есть роль» тест проверяет, что в Hono не смонтировано ничего в обход `route()`, и что строк в матрице ровно по одной на каждый зарегистрированный маршрут (новый маршрут без строки валит тест). Строки для данных ученика помечаются `learnerOwned: true`, тогда для learnerB обязателен 404.
  - Маршрутов settings/secrets ещё нет (FEAT-052 идёт после) — их строки добавит FEAT-052.
  - Персона `import` до FEAT-012 предъявляет невыданный токен и обязана получать то же, что аноним; FEAT-012 подставит настоящий токен в фикстуру.
  - Мутирующие строки не портят общую фикстуру: у каждой персоны свежая копия cookie, отзывается запасное устройство, `logout` идёт на отдельной фикстуре (`fresh`). Проверено мутацией: расширение ролей `/api/admin/audit` валит тест.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: CLAUDE.md 11; Critique 1 HIGH#7, MED#15.
- **Rule**: CLAUDE.md 11, 14
- **Scope**:
  - `apps/api/test/access-matrix.test.ts`, `apps/api/test/fixtures/twoLearners.ts`
- **Depends on**: FEAT-004
- **DoD**:
  - Тест 1: каждый зарегистрированный маршрут объявил роль (иначе тест падает).
  - Тест 2, табличный: строки `{route, as: anon|learnerA|learnerB|admin|import, expect}`. На момент этого пункта покрывает все существующие маршруты: health, setup, auth, users, settings, secrets, audit.
  - Каждый последующий пункт с маршрутами обязан добавить свои строки; это часть его DoD. Для данных ученика обязательна проверка learnerB → чужое (404).

### Фаза B — домен и API

### FEAT-007 — Журнал начислений (ledger), баланс, уровень
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Ключи: `idemKey(...parts)` (брендированный тип `IdemKey`, части `[A-Za-z0-9_-]`, разделитель `:`) и `requestKey(source, learner, requestId)` → `<source>:<learner>:<requestId>`; `requestIdSchema` (8–64 символа `[A-Za-z0-9_-]`) — в `@questclass/shared/economy/dto`. Повтор ключа возвращает первую строку (`created:false`, суммы не сравниваются — «платим один раз»); тот же ключ для другого ученика или источника → 409 `idempotency_conflict`.
  - Отмена сохраняет `source_type/source_id` отменяемой строки (нетто по источнику = сумма строк), ключ `reversal:<id>`; отменить отмену нельзя (409 `cannot_reverse_reversal`), повторная отмена → 409 `already_reversed`. Ledger сам audit не пишет — действие аудирует вызывающий модуль (FEAT-009, FEAT-016).
  - Сервис сверх DoD (для следующих пунктов): `spend()` (покупки, FEAT-019), `sourceTotals()` (доплата FEAT-009), `hasSource()` (проверка истории перед удалением, FEAT-008). `LEDGER_SOURCE_TYPES`: task, streak, award, chore, purchase, coins_reset; добавлен индекс `(source_type, source_id)`.
  - `/api/me/wallet` и `/api/me/ledger` — роль `learner` (админу 403). Фильтр `type` в админском журнале = `source_type`.
  - Перед пунктом отдельным коммитом исправлено форматирование `scripts/parity-check.mjs` (lint был красным с FEAT-051; поведение не менялось).
  - RSS в простое 70,5 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §7 принцип 5; spec/02 §2.1 «уровень = floor(XP/300)+1; баланс может уйти в минус, тогда покупки блокируются»; Critique 1 MED#2.
- **Rule**: CLAUDE.md 4
- **Scope**:
  - `apps/api/src/db/schema/ledger.ts` + миграция, `apps/api/src/modules/ledger/{service.ts,repo.ts,routes.ts}`, `packages/shared/src/{economy/*.ts,settings/keys/economy.ts}`, `apps/api/test/ledger.test.ts`
- **Depends on**: FEAT-005, FEAT-006, FEAT-049
- **DoD**:
  - Схема: `ledger(id, learner_id, at, xp, coins, source_type, source_id, idem_key UNIQUE, reverses_id UNIQUE NULL, note, created_by)`; индекс `(learner_id, at)`.
  - `post()` идемпотентна по `idem_key`. Ключ всегда строится на сервере с префиксом ученика и источника, клиентский `requestId` — только часть ключа (тест).
  - `reverse(id)` создаёт компенсирующую строку; второй раз — 409 (UNIQUE `reverses_id`). Компенсация может увести баланс в минус (тест).
  - Тратить (покупки) при балансе < цены нельзя (`insufficient_coins`). Отрицательный баланс блокирует все покупки (тест).
  - Админ: `GET /api/admin/learners/:id/ledger?type&from&to&cursor` (тест + FEAT-049).
  - `GET /api/me/wallet` → `{xp, coins, level, levelXp, xpToNext}` по `economy.xpPerLevel` (ключи: xpPerLevel=300, defaultTaskXp=100, defaultTaskCoins=350). `GET /api/me/ledger` — постранично. Строки в FEAT-049.

### FEAT-008 — Предметы, задания, реестр типов, назначения
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `GET /api/subjects` (learner, admin), `GET/POST /api/admin/subjects`, `PATCH/DELETE /api/admin/subjects/:id`; `GET/POST /api/admin/tasks`, `GET/PATCH/DELETE /api/admin/tasks/:id`, `POST /api/admin/tasks/:id/assignments {learnerId}`, `DELETE /api/admin/tasks/:id/assignments/:learnerId`; ученику `GET /api/tasks`, `GET /api/tasks/:id` (чужое/невидимое → 404). Публикация, снятие и архив — `PATCH {status}`; итог `published` всегда проходит проверки типа (422 `cannot_publish`, `details.errors`).
  - Сид предметов запускается хуком старта только на пустой таблице: удалённый админом стартовый предмет не возвращается после перезапуска. Сама `seedSubjects()` идемпотентна по `key` (и по имени) и существующие строки не трогает. Иконка — ключ ассета `game/subjects-pixel/<key>`.
  - Уникальность имени предмета — колонка `name_key` (ru-RU lower-case, схлопнутые пробелы): `lower()` SQLite не знает кириллицу. `key` неизменяем; без ключа генерируется `s-<8 hex>`.
  - Контракт: shared `defineTaskType({type, label, configSchema, submissionSchema, defaultConfig, publicConfig, canPublish})` (`defaultConfig` сверх DoD — конфиг нового задания); api `TaskTypePlugin {contract, canStart, grade?, publishChecks?, fromImport?}`. `grade` необязателен (у `chore` нет автопроверки), `publishChecks(task, {db, settings})` — серверные проверки (медиа готово, хватает вопросов). Реестр — на рантайм (`ctx.taskTypes`, `register()` для тестовых типов); списки встроенных типов (`task-types/registry.ts`, `shared/tasks/registry.ts`) пусты до FEAT-010/013/014.
  - Назначения = аудитория: есть строки — задание только этим ученикам и первым в их очереди (`position`), нет строк — всем активным на момент запроса (`tasks.audience()` для FEAT-009/022). Назначения не история: удаляются вместе с черновиком.
  - Удаление: строка в ledger по заданию или любая FK RESTRICT (будущие progress/attempts/media) → 409 `has_history` с `details.archive=true`. Ученик не видит задания архивных предметов, неизвестных типов и с невалидным сохранённым config.
  - Вне Scope: `apps/api/src/db/constraints.ts` (распознавание FK/UNIQUE ошибок SQLite, пригодится дальше), `apps/api/test/fixtures/noteTaskType.ts` (тестовый тип для tasks- и matrix-тестов); `tasks/seed.ts` не создавался (сид уроков — FEAT-048). Колонка `tasks.external_id` (UNIQUE NULL) добавлена сразу — для upsert импорта FEAT-012.
  - Матрица: данные для строк готовит `prepare()` в `access-matrix.test.ts` (14 строк). RSS в простое 73,3 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §8 «subjects, tasks, task_assignments, типы-плагины»; Critique 1 MED#8, MED#14, LOW (назначения «всем»).
- **Rule**: CLAUDE.md 1, 5, 10, 11
- **Scope**:
  - `apps/api/src/db/schema/{subjects.ts,tasks.ts,assignments.ts}` + миграция, `apps/api/src/modules/{subjects,tasks}/{routes.ts,service.ts,repo.ts,seed.ts}`
  - `packages/shared/src/tasks/{contract.ts,registry.ts,dto.ts}`, `apps/api/src/task-types/registry.ts`, `apps/api/test/tasks.test.ts`
- **Depends on**: FEAT-049
- **DoD**:
  - Сид 6 предметов оригинала: `{key, name, icon(ключ ассета), sort}` — russian, world, math, reading, art, craft. Идемпотентен по `key`, правки админа не перетирает (тест).
  - Контракт типа: `{type, configSchema, submissionSchema, publicConfig(config), canPublish(task) → string[] ошибок}` (shared) + `grade()`, `canStart(ctx) → ok | {code, message}` и необязательный `fromImport(manifest) → config` (api). Модули типа (маршруты, сервисы) живут в `apps/api/src/task-types/<type>/` (правило 10).
  - Удаление: предмет или задание без истории удаляется физически. Если история есть (прогресс, попытки, ledger, медиа) — 409 с предложением архивировать. `status=archived` скрывает задание у ученика, история остаётся. FK — `RESTRICT` (тесты).
  - Предмет: `key` и `name` уникальны (тест).
  - Админ-CRUD предметов и заданий. Публикация вызывает `canPublish`; при ошибках — 422 со списком (тест).
  - `GET /api/tasks` для ученика: published, наступил `release_at`, назначено ему; «нет назначений» = все **активные** ученики на момент запроса. Config — только через `publicConfig` (тесты + строки FEAT-049).

### FEAT-054 — Вопросы (версии) и расшифровки
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Ресурс вопроса — `(task, key)`, версии — его история: `GET/POST /api/admin/tasks/:taskId/questions` (`?archived=true` — все версии), `GET …/questions/:key/versions`, `PUT …/questions/:key` (новая версия, редактируемая архивируется), `DELETE …/questions/:key` (архив всех живых версий ключа; повтор — 404), `POST …/question-imports {content, append?}`, `GET/POST /api/admin/tasks/:taskId/transcripts` (тело до 4 МБ).
  - Колонки сверх DoD: `state active|pending`, `source import|admin`, `position`, `created_by/at`, `archived_by`. Импорт (`importVersions(taskId, questions, {state})` для FEAT-012) считает конфликтом ключ, чья последняя версия создана админом **или** архивирована админом — так удалённый мамой вопрос не воскресает. Импортные вопросы, которых нет в новом пакете, попадают в `removed` (в режиме `active` архивируются, в `pending` только сообщаются). Для FEAT-010/013 — `activeBank()` и `countActive()`.
  - Админский импорт текста/JSON: формат определяется по содержимому, как в оригинале; 3–30 вопросов, ровно 4 различных варианта; без `append` живой банк архивируется и заменяется (источник `admin`, новые ключи). Парсер `shared/questions/importText.ts` написан заново по описанию поведения (код оригинала не копировался); `helpVideo {startSeconds,endSeconds,quote}` оригинала → `evidence {start,end,quote}`.
  - Картинки — только относительные пути (ведущий `/` срезается, `{src}` оригинала принимается); внешние URL отклоняются (без сторонних CDN).
  - FK `questions.task_id` и `transcripts.task_id` — `ON DELETE CASCADE`: это содержимое задания, не история; задание без истории удаляется вместе с ними, а попытки (FEAT-010) будут ссылаться на вопросы с RESTRICT и такое удаление заблокируют. `transcripts.media_id` без FK: таблицы `media` ещё нет (FEAT-011), а добавить FK к существующей колонке можно только пересборкой таблицы.
  - Строки FEAT-049 добавлены (8 маршрутов). RSS в простое 72,9 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §8 «questions (task_id, text, options, correct, image, evidence)», «transcripts»; Critique 1 HIGH#6, MED#7.
- **Rule**: CLAUDE.md 1
- **Scope**:
  - `apps/api/src/db/schema/{questions.ts,transcripts.ts}` + миграция, `apps/api/src/modules/questions/{routes.ts,service.ts}`, `packages/shared/src/questions/*.ts`, `apps/api/test/questions.test.ts`
- **Depends on**: FEAT-008
- **DoD**:
  - `questions(id, task_id, key, version, text, options json, correct, image_ref, evidence json {start,end,quote}, archived_at)`; UNIQUE `(task_id, key, version)`.
  - Правка вопроса создаёт новую версию, старая архивируется; удаление — тоже архивирование (тест). Банк задания = неархивные вопросы с `state=active`.
  - Источник версии: `import|admin`. Импорт не перезаписывает вопрос, последняя версия которого создана админом; такой вопрос попадает в список конфликтов ревизии (тест).
  - `transcripts(id, task_id, media_id, lang, source youtube|whisper|manual, segments json)` — хранение и выдача админу (тест).
  - Админ-API: список, создание, правка, архив, импорт текста и JSON. Парсер `importText.ts` в shared проверен на примерах из README оригинала (тест).

### FEAT-009 — Прогресс: факты, доступность, ручное управление, сбросы
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `GET /api/admin/learners/:id/progress`, `POST /api/admin/learners/:id/progress/:taskId/closure {withReward, reason?}`, `POST …/progress/:taskId/reopening`, `POST /api/admin/learners/:id/progress-resets {taskId?, requestId}`, `POST /api/admin/learners/:id/coins-resets {requestId}`; сверх DoD — `GET /api/me/progress` (тот же вид для ученика: нужен главной FEAT-029, а её Scope — только web).
  - Epoch не хранится счётчиком: epoch(ученик, задание) = число строк `progress_resets` этого ученика для задания или «для всех». В `progress_resets` добавлены `kind reset|reopen` и `request_id` (UNIQUE по ученику; повтор — no-op, 200). Выполненность считается с последнего **сброса**: переоткрытое задание остаётся выполненным для цепочки.
  - Награды: зачёт → `task:<t>:learner:<l>:pass` (пропорционально, вниз); после сброса повторно не платится; в переоткрытом epoch доплата `…:topup:<epoch>` = max(0, цель − нетто уже выплаченного по заданию (`ledger.sourceTotals`, отмены учтены)) по каждой валюте. `close {withReward}` платит полную награду только через ключ `pass`.
  - Для FEAT-010/013/015: `markStarted()`, `recordResult(l, t, {correct, total, passed})` (в транзакции вызывающего), `standing()`, `lastFullResetAt()` (серию обнуляет только полный сброс).
  - Доступность (`availability.ts`, чистая функция): указатель ротации не хранится — очередь переходит к предмету после последнего по времени выполненного задания круга; в предмете — первое невыполненное после самого дальнего выполненного; пропущенные раньше остаются открыты. Начатые, выполненные и назначенные открыты всегда; предметы вне круга — по порядку; задания без предмета открыты, но в «следующее» попадают только по назначению. Порядок в предмете — `sort`, затем id.
  - «Обнулить монеты» пишет строку и при нулевом балансе (маркер идемпотентности, чтобы повтор не обнулил заработанное позже); отрицательный баланс поднимается до 0; XP не трогается.
  - `reopen` требует результат в текущем epoch (409 `nothing_to_reopen`); `close` — только опубликованное (409 `task_not_published`) и не дважды за epoch (409 `already_completed`).
  - Вне Scope: `packages/shared/src/progress/dto.ts` (схемы запросов и DTO для web). Строки FEAT-049 добавлены (6 маршрутов). RSS в простое 73,6 МиБ.
  - Риск: при сильной загрузке CPU (параллельная работа в другом worktree) первые тесты с полным стартом в `db/health/auth.test.ts` упирались в 5 с таймаут Vitest; повторный прогон зелёный (257/257, 35 с).
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §1 «Админ вручную управляет прогрессом»; spec/01 «автооткрытие, ротация предметов, полный сброс»; Critique 1 MED#3, HIGH#10.
- **Rule**: CLAUDE.md 1, 2, 4
- **Scope**:
  - `apps/api/src/db/schema/{progress.ts,progressResets.ts}` + миграция, `apps/api/src/modules/progress/{service.ts,availability.ts,routes.ts}`, `packages/shared/src/settings/keys/progress.ts`, `apps/api/test/progress.test.ts`
- **Depends on**: FEAT-007, FEAT-008
- **DoD**:
  - `task_progress(learner, task, epoch, state started|passed|closed, score, completed_at, closed_by, closed_reason)`; UNIQUE `(learner, task, epoch)`.
  - `progress_resets(id, learner, task NULL=все, at, by)`. Сброс увеличивает epoch: прежние попытки и факты не учитываются, ledger не трогается, повторная награда не выплачивается (тот же `idem_key`) (тест).
  - Решения пользователя 14.11.2026:
    - по умолчанию `rotation`, круг `progress.rotationSubjects` = russian → math → world → reading, шаг круга — после **зачёта теста**; ИЗО и труд — по порядку или по назначению;
    - назначенные ученику задания идут первыми в «следующем» (тест).
  - Доступность вычисляется при чтении и ничего не пишет (тест). Режим `progress.unlockMode`:
    - `sequential` — по порядку в предмете;
    - `rotation` — следующий предмет по кругу, как автоматическая ротация оригинала;
    - `all` — все сразу.
  - Админ:
    - `close {withReward}` — награда через `idem_key = task:<t>:learner:<l>:pass`, выплатить дважды нельзя;
    - `reopen` («Пройти с мамой»): новая попытка в новом epoch. Если результат лучше, доплачивается разница до награды за лучший результат (`idem_key = task:<t>:learner:<l>:topup:<epoch>`), дважды не платится (тест);
    - `reset` — по заданию или по всем: попытки, прохождения и серия. Монеты, покупки и герой остаются;
    - `coins-reset` — «Обнулить монеты» одной компенсирующей строкой ledger до 0, идемпотентно по requestId (тест).

    Каждое действие пишется в audit (тесты + строки FEAT-049).
  - `GET /api/admin/learners/:id/progress` — задания с состоянием, баллом, датами и доступностью (тест).

### FEAT-015 — Серия занятий
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `GET /api/me/streak`; сверх DoD — `GET /api/admin/learners/:id/streak` (тот же вид для экрана прогресса в админке). Ответ: `{current, best, days[], nextRewardAt}` + `todayDone`, `cycleDays`, `cycleProgress` («3/5»), `reward`; тип `StreakDto` — в `shared/progress/dto.ts` (вне Scope).
  - `streak.recordDay(learner)` берёт день только из часов сервера (`dayKey`, часовой пояс из настроек): способа записать другой день нет, строки не меняются и не удаляются. Вызывается в транзакции закрытия админом (любое закрытие = зачёт, с наградой или без); вызов из `finish` попытки добавит FEAT-010.
  - Бонус: если серия, заканчивающаяся сегодня, кратна `streak.days`, — строка ledger `streak:<learner>:<первый день цикла>` (`source_id` = этот день); повтор дня ничего не доплачивает, 10 дней = два бонуса.
  - Полный сброс прогресса: в серию идут дни с `day_key` ≥ дня сброса, старые строки остаются; сброс одного задания серию не трогает. Сервис серии читает `progress_resets` напрямую — сервис прогресса сам вызывает серию, обратная зависимость дала бы цикл.
  - Отдельным коммитом перед пунктом (`test(api)`): тестовый помощник `test/helpers/fastUsers.ts` (хэш PIN/пароля один раз на файл) в доменных тестах — прогон 35 → 20 с, хуки не упираются в таймауты под нагрузкой; проверки не менялись.
  - Строки FEAT-049 добавлены (2 маршрута). RSS в простое 73,7 МиБ.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: spec/01 «серия 5 дней», spec/02 «+200 монет / +200 XP за серию»; Critique 1 MED#6.
- **Rule**: CLAUDE.md 1, 2, 4, 12
- **Scope**:
  - `apps/api/src/db/schema/streakDays.ts` + миграция, `apps/api/src/modules/streak/{service.ts,routes.ts}`, `apps/api/src/modules/progress/service.ts` (вызов при закрытии админом с зачётом), `packages/shared/src/settings/keys/streak.ts`, `apps/api/test/streak.test.ts`
- **Depends on**: FEAT-009
- **DoD**:
  - `streak_days(learner, day_key)` UNIQUE. Как в оригинале («ошибки не мешают серии»), день засчитывается за **любую завершённую попытку** учебного задания (quiz или video_lesson), а также за закрытие админом с зачётом. `streak.recordDay` вызывается в транзакции `finish` (`insert or ignore`). Прошлое переписать нельзя (тест).
  - Серия = подряд идущие `day_key` до сегодня/вчера. `GET /api/me/streak` → `{current, best, days[], nextRewardAt}`, только чтение (тест).
  - Награда за `streak.days` (5) дней: `idem_key = streak:<learner>:<day_key первого дня цикла>`, после неё новый цикл (тест). Ключи: days=5, rewardXp=200, rewardCoins=200.

### FEAT-010 — Тип `quiz`: попытки со снимком вопросов, зачёт, пересдачи
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты ученика: `POST /api/tasks/:taskId/attempts` (201 — новая, 200 — продолжение открытой), `GET /api/attempts/:id`, `PUT /api/attempts/:id/answers/:questionId {optionId}`, `POST /api/attempts/:id/completion` (finish; повтор возвращает результат), `POST /api/tasks/:taskId/retry-requests`. Админа: `GET /api/admin/attempts/:id`, `GET /api/admin/retry-requests?status=open|granted`, `POST /api/admin/retry-grants {learnerId, taskId}`; сверх DoD — `GET /api/admin/learners/:id/attempts?taskId` (список для деталей попыток в FEAT-041).
  - Движок попыток общий: тип участвует, если реализует `grade()` (у `chore` его нет → 409 `no_questions`). N = `quiz.questionsPerAttempt` для всех таких типов; `quiz.minCorrect` больше N означает «все верно». Конфиг `quiz` пуст (`{}`), размер банка проверяет серверный `publishChecks` («Нужно не меньше N вопросов в банке (сейчас K)»).
  - «Закрытое» (уже пройдено или закрыто) → 409 `already_passed`, «ещё не открытое» (по порядку/ротации) → 409 `task_locked`; задание с будущей датой или чужое ученику не видно вовсе → 404, как в FEAT-008.
  - Одна открытая попытка на (ученик, задание) — частичный UNIQUE. Вопросы и варианты тасуются криптослучайно; если порядок вариантов совпал с прошлой попыткой этого ученика — циклический сдвиг (как в оригинале).
  - Пересдачи: бесплатных попыток в epoch = 1 + `quiz.autoRetries`; дальше `retry_grant`, который тратится ровно одной попыткой (`attempts.retry_grant_id` UNIQUE, сама строка разрешения не меняется). Открытая просьба одна (частичный UNIQUE); выдача разрешения переводит её в `granted`; просьба при доступной бесплатной пересдаче → 409 `retry_available`. Сброс и «Пройти с мамой» — новый epoch, бесплатные попытки снова есть; открытая попытка старого epoch при старте новой становится `abandoned` (новый статус).
  - `finish` в одной транзакции (оценка, прогресс, награда, серия; откат проверен). Если epoch сменился или админ уже закрыл задание, попытка завершается без прогресса и награды; день серии засчитывается за любую завершённую попытку. Попытка хранит выплаченные награду и бонус серии.
  - Вне Scope: `packages/shared/src/attempts/dto.ts` (общие DTO попыток для quiz и video_lesson). Строки FEAT-049 добавлены (9 маршрутов; `prepare()` готовит тесты, назначенные ученику A, в нужных состояниях). RSS в простое 74,5 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: Clarification «порог в настройках: 2 из 3, 1 автопересдача, дальше по разрешению; награда пропорциональна»; Critique 1 HIGH#6, MED#3, LOW (minCorrect, повтор ответа, малый банк).
- **Rule**: CLAUDE.md 1, 4, 10, 11
- **Scope**:
  - `packages/shared/src/task-types/quiz/*`, `apps/api/src/task-types/quiz/*`, `packages/shared/src/settings/keys/quiz.ts`
  - `apps/api/src/db/schema/{attempts.ts,attemptQuestions.ts,attemptAnswers.ts,retryGrants.ts,retryRequests.ts}` + миграция, `apps/api/src/modules/attempts/{routes.ts,service.ts}` (общий движок попыток для всех типов с вопросами), `apps/api/test/quiz.test.ts`
- **Depends on**: FEAT-054, FEAT-009, FEAT-015
- **DoD**:
  - Старт попытки проверяет доступность (FEAT-009) и `canStart` типа; закрытое или ещё не открытое задание → 409 (тест). N = `quiz.questionsPerAttempt` (3) случайных вопросов из банка. Варианты перемешиваются. Снимок (текст, варианты, правильный ответ, evidence) пишется в `attempt_questions` (тест). Банк < N → 409 «Вопросы ещё готовятся».
  - Ответ один раз. Тот же ответ повторно → 200; другой → 409 (тест). Правильные ответы и evidence отдаются только после `finish`.
  - `finish` в **одной транзакции**: оценка, прогресс, награда, серия (тест на откат).
  - Зачёт: верных ≥ `quiz.minCorrect` (целое, 2, ≤ N). Награда при первом зачёте = `floor(xp·верных/N)` и `floor(coins·верных/N)`.
  - Админ: `GET /api/admin/attempts/:id` (снимок вопросов и ответы), `GET /api/admin/retry-requests?status=open` (тест).
  - Пересдачи: после провала `quiz.autoRetries` (1) бесплатно. Дальше ученик создаёт `retry_request`, админ выдаёт `retry_grant` (используется одной попыткой) (тесты + строки FEAT-049).

### FEAT-011 — Медиа: хранение и раздача с Range
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршрут `GET /api/media/:id/*` (admin, learner). На HEAD Hono отвечает тем же маршрутом — отдаются только заголовки, файл не открывается.
  - Файлы лежат в `DATA_DIR/media/<dir>/`, `dir` — 24 случайных hex-символа (UNIQUE). Колонки сверх DoD: `created_at`, `ready_at`. Сверх DoD в том же `schema/media.ts` — таблица `media_files(media_id, path, size_bytes, sha256)` UNIQUE `(media_id, path)`: заявленные файлы медиа для загрузки FEAT-012 (у FEAT-012 в Scope нет своей схемы для них). Сервис: `create` (pending + каталог + заявленные файлы), `find`, `files`, `dirOf`, `markUploading`, `markReady {sizeBytes, durationSec}`, `scheduleDeletion` (для ревизий FEAT-012 и ретеншна FEAT-022), `markDeleted` (сначала удаляет файлы, строка остаётся со `status=deleted`), `resolveFile(actor, id, path)`.
  - Доступ: ученику — только медиа с `task_id` задания, которое он видит (`tasks.visibleTask`: опубликовано, наступил `release_at`, назначено ему или всем), иначе 404; медиа без задания (загрузки) — только админу. Не готовое (`pending|uploading`) → 404 `media_not_ready`, удалённое → 410 `media_deleted` (ученику — только для видимого задания, иначе 404).
  - Путь берётся из исходного `pathname` запроса (ещё в percent-кодировке) и декодируется ровно один раз в `safePath()`; небезопасный путь → 404. Сегменты `[a-z0-9_-]{1,64}`, до 4 уровней, до 200 символов, расширение из белого списка; двойное кодирование, `\`, `:`, NUL, верхний регистр и пустые сегменты отклоняются. Симлинки и junction-точки Windows: `lstat` каждого существующего компонента ниже каталога медиа; несуществующие компоненты разрешены (цель загрузки FEAT-012). Тест на симлинк-файл на Windows без режима разработчика пропускается (EPERM), тест на связанный каталог (junction) идёт везде. Последовательность `/%2e%2e/` нормализует сам URL-парсер до маршрутизации, поэтому через HTTP проверены `..%2f`, `%2e%2e%2f`, `..%5c`, `%252e`, а все варианты — юнит-тестами `safePath`.
  - Range: один диапазон (`a-b`, `a-`, `-n`) → 206; несколько диапазонов или неверный заголовок игнорируются (200, весь файл); невыполнимый → 416 с `Content-Range: bytes */size`. Отдача потоком (`createReadStream` → web stream). `Cache-Control`: `.m3u8` — `private, no-cache`, остальное — `private, max-age=86400`; `X-Content-Type-Options: nosniff`.
  - Строка FEAT-049 добавлена (1 маршрут, learnerB → 404). Тестов 368 (+1 пропущен на Windows), было 295. RSS в простое 74,9 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §4 «доступ только с сессией и для видимых заданий»; Critique 1 HIGH#7.
- **Rule**: CLAUDE.md 11, 13
- **Scope**:
  - `apps/api/src/db/schema/media.ts` + миграция, `apps/api/src/modules/media/{routes.ts,service.ts,stream.ts,safePath.ts}`, `apps/api/test/media.test.ts`
- **Depends on**: FEAT-008
- **DoD**:
  - `media(id, task_id NULL, role video|question_image|upload, kind hls|mp4|image, dir, size_bytes, duration_sec, status pending|uploading|ready|deleted, delete_after, deleted_at)`. Ретеншн (FEAT-022) удаляет только `role=video`; картинки вопросов и загрузки идут в бэкап (FEAT-047).
  - `GET /api/media/:id/*`:
    - Range → 206 (тест);
    - ученик получает медиа только видимого ему опубликованного задания, иначе 404; админ — любое (тест + FEAT-049);
    - удалённое медиа → 410.
  - `safePath()`: только `[a-z0-9_-]` сегменты и белый список расширений (`.m3u8 .ts .m4s .mp4 .webp .png .jpg .vtt .json`); `..`, абсолютные пути и симлинки отклоняются (тесты). Отдача потоком.

### FEAT-013 — Тип `video_lesson`: честный учёт просмотра
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `POST /api/watch/:taskId/sessions` (learner, 201 `{sessionId, media {id, kind, durationSec, src}, progress}`), `POST /api/watch/:taskId/sessions/:id/intervals` (learner, тело `{intervals[{start,end,kind main|help}] ≤100, position?}` → `WatchProgressDto`), `POST /api/admin/learners/:id/watch/:taskId/confirmation` (admin, 201 / 200 повтор). Отклонения от DoD: путь `/confirmation` вместо `/confirm` (правило 3, как `/closure`, `/completion`), подтверждение работает в любом режиме, не только `manual` (как в оригинале, PARITY 01-016: «просмотр вне приложения»); пишется audit `watch.confirmed`.
  - Config: `mediaId` nullable (у нового черновика видео ещё нет; `canPublish` → «Нужно видео урока»). `publishChecks`: медиа существует, принадлежит этому заданию, не картинка и `ready`, вопросов ≥ `quiz.questionsPerAttempt`. `publicConfig` = `{mediaId, watchMode, shutter}`; итоговый порог ученик получает в `progress.requiredPercent`. Ответы оцениваются движком попыток FEAT-010, как у `quiz`. Ключи `watch.minPercent` = 70 (SPEC §8 «правило просмотра (70%)»; в оригинале по умолчанию было 95%) и `watch.maxRate` = 1,25.
  - Сессия: старт требует видимого (иначе 404) и открытого (409 `task_locked`) задания, готового видео с длительностью (409 `video_not_ready`; удалённое → 410), закрывает прежнюю открытую сессию (частичный UNIQUE `(learner, task) WHERE closed_at IS NULL`) и отмечает задание начатым (`progress.markStarted`). Пачка: чужая сессия → 404, закрытая → 409 `session_closed`, видео задания заменено → 409 `session_outdated`. Зачитывается ≤ (время с прошлой пачки или старта сессии) × `watch.maxRate`, интервалы обрезаются по длительности, `help` не зачитывается, повтор не добавляет секунд; больше 2000 отдельных фрагментов → 422.
  - `watch_progress`: объединённые интервалы (JSON по правилу 1b), `watched_sec`, `percent`, `last_position`, `completed_at` (порог достигнут один раз — повышение порога не отзывает), `confirmed_by/at`. Сброс прогресса (FEAT-009) пересмотра видео **не требует**: у строки нет epoch, UNIQUE `(learner, task, media)` по DoD; если нужно иначе — решить при FEAT-041.
  - `fromImport(input)`: FEAT-012 передаёт манифест вместе с `mediaId` созданного медиа и (при переимпорте) `current` — текущим config; настройки просмотра админа сохраняются, меняется только видео. Входной файл видео по виду медиа — `MEDIA_ENTRY`: HLS → `master.m3u8`, MP4 → `video.mp4` (FEAT-023 выпускает эти имена).
  - Вне Scope: `packages/shared/src/task-types/video_lesson/dto.ts` (в маске Scope), регистрация в `app.ts`, `startup.ts` (`ctx.watch`), реестрах типов и настроек, `schema/index.ts`. Перед пунктом отдельным коммитом `test(api)` (598b1ed) — `apps/api/vitest.config.ts` с таймаутами 20/30 с: при параллельном прогоне таймаут 5 с периодически срабатывал в `auth.test.ts` и `db.test.ts`, проверки не менялись.
  - Строки FEAT-049 добавлены (3 маршрута, learnerB → 404). Тестов 401 (+1 пропущен), было 368. RSS в простое 77,2 МиБ.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §4 «трекинг интервалов»; spec/01 «режимы просмотра, ручное подтверждение просмотра родителем»; Critique 1 MED#4, MED#5.
- **Rule**: CLAUDE.md 1, 10
- **Scope**:
  - `packages/shared/src/task-types/video_lesson/*`, `apps/api/src/task-types/video_lesson/*`, `packages/shared/src/settings/keys/watch.ts`
  - `apps/api/src/db/schema/{watchProgress.ts,watchSessions.ts}` + миграция, `apps/api/src/task-types/video_lesson/{routes.ts,watch.ts,intervals.ts,canStart.ts}`, `apps/api/test/video-lesson.test.ts`
- **Depends on**: FEAT-010, FEAT-011
- **DoD**:
  - Config: `{mediaId, watchMode: percent|none|manual, minWatchPercent?, shutter {enabled, heightPct}}`; вопросы — из FEAT-054. `canPublish` требует медиа `ready` и ≥ N вопросов.
  - `POST /api/watch/:taskId/sessions` выдаёт сессию просмотра; активна только одна на (ученик, задание), новая закрывает прежнюю (тест на параллельные сессии). `POST …/sessions/:id/intervals` принимает пачку.
    - Зачитывается не больше, чем прошло реального времени с прошлой пачки ×1,25.
    - Интервалы обрезаются по длительности.
    - Воспроизведение подсказки-фрагмента (`kind: help`) не зачитывается.

    Хранятся объединённые интервалы, процент и `last_position`; UNIQUE `(learner, task, media_id)` — после замены видео прогресс считается заново (тесты на «один интервал на весь ролик» → не засчитан).
  - Реализует `fromImport(manifest)` для `video_lesson` (используется FEAT-012).
  - `canStart` в режиме `percent` проверяет процент на сервере (409 ниже порога), `none` — без условий (тест).
  - `watchMode=manual`: админ подтверждает просмотр (`POST /api/admin/learners/:l/watch/:task/confirm`). Без подтверждения попытка → 409 (тест).

### FEAT-012 — Импорт: токены, загрузка пакета урока
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты. Admin: `GET/POST /api/admin/import-tokens`, `DELETE /api/admin/import-tokens/:id` (отзыв, строка остаётся), `GET /api/admin/task-revisions?status=`, `GET /api/admin/task-revisions/:id`, `POST …/:id/acceptance`, `POST …/:id/rejection`. Import: `POST /api/import/lessons` (201 — новый черновик, иначе 200), сверх DoD `GET /api/import/media/:id` (файлы и сколько байт уже принято — для продолжения), `PUT /api/import/media/:id/files/<path>?offset=`, `POST /api/import/media/:id/completion`.
  - Токен: `qci_<32 байта base64url>`, в БД sha256, показывается один раз. `Authorization: Bearer` учитывается только если у запроса нет сессии (`importTokenMiddleware`, без записи в БД). Audit: `import_token.created|revoked`, `import.lesson` (actor null, `tokenId` в payload), `task_revision.accepted|rejected`.
  - Манифест сверх DoD: `type` (по умолчанию `video_lesson`; тип без `fromImport` → 400 `type_not_importable`), `description`, `images {files[]}` — картинки вопросов отдельным медиа `role=question_image` (ретеншн их не трогает); `image` вопросов и вариантов — пути внутри `images`, в банке хранятся как `media/<id>/<path>` (web открывает `/api/media/<id>/<path>`). В `media.files` обязателен главный файл (`master.m3u8` для HLS, `video.mp4` для MP4). Длительность видео не в манифесте, а в `completion {durationSec}` (для видео обязательна, 400 `duration_required`): её знает только lesson-prep после ffprobe. Неизвестный или архивный `subjectKey` → 422 `unknown_subject` (предмет не создаётся сам; PARITY 01-027).
  - Черновик при переимпорте обновляется на месте: название, предмет, описание, XP, монеты, дата из манифеста; config строит `fromImport({...manifest, mediaId, current})` — настройки просмотра админа сохраняются. Медиа с теми же заявленными файлами (путь, размер, sha256) переиспользуется, поэтому повторный импорт не требует перезаливки и продолжает недогруженное; прежние видео черновика получают `delete_after = now` (их удалит FEAT-022).
  - Опубликованное: ревизия создаётся, только если что-то изменилось (иначе `outcome: unchanged`); метаданные опубликованного задания импорт не меняет. Видео считается прежним, если `fromImport` даёт тот же config. Одна ожидающая ревизия на задание (частичный UNIQUE); новый импорт переводит старую в `superseded`, её медиа удаляются, если не переиспользованы. Для конфликтов (вопрос правил или удалял админ) предложение импорта хранится в JSON ревизии и показывается в diff рядом с версией админа. Принятие: новое медиа должно быть `ready` (409 `media_not_ready`); pending-версии становятся active, заменённые и `removed` импортные версии архивируются с `archived_by = NULL` (это не удаление админом); config меняет `fromImport`, старое видео получает `delete_after`; затем повторная проверка публикации — если, например, вопросов стало меньше N, 422 `cannot_publish` и ничего не меняется. Отклонение архивирует pending-версии и удаляет предложенные медиа.
  - Загрузка: путь из исходного `pathname`, один раз декодируется в `safePath()` (400 `invalid_path`; `/%2e%2e/` целым сегментом убирает ещё URL-парсер → 404 маршрута); незаявленный файл → 404; один запрос на файл одновременно (409 `upload_in_progress`); `offset` ≠ принятому → 409 `offset_mismatch {received}`; больше заявленного → 413 `exceeds_declared_size`, файл возвращается к `offset`; тело > 8 МБ → 413. Части пишутся по мере чтения, поэтому при обрыве принятое остаётся на диске (400 `upload_interrupted {received}`) и загрузка продолжается с этого места. Место: при импорте — свободно ≥ всех заявленных байт + 1 ГиБ, на каждую часть — ≥ остатка файла + 1 ГиБ, иначе 507 `insufficient_storage`. `completion`: размеры и sha256 всех файлов; файл с неверным sha256 удаляется (заливается заново с 0), 409 `verification_failed {files}`; повтор для готового медиа ничего не меняет.
  - Вне Scope (по заметке FEAT-049): `test/fixtures/twoLearners.ts` выдаёт настоящий токен вместо невыданного, поэтому в матрице персона `import` на всех не-импортных маршрутах получает 403 (была 401 как аноним); регистрация в `app.ts` (маршруты, middleware, `ctx.imports`) и `startup.ts`. Строки FEAT-049 добавлены (11 маршрутов). Тестов 432 (+1 пропущен), было 401. RSS в простое 77,9 МиБ.
- **Risk**: HIGH
- **Requires decision**: N
- **Spec reference**: SPEC §5 шаг 7; Critique 1 HIGH#5, HIGH#6, MED#7, MED#18.
- **Rule**: CLAUDE.md 6, 11, 13
- **Scope**:
  - `apps/api/src/db/schema/{importTokens.ts,taskRevisions.ts}` + миграция, `apps/api/src/modules/import/{routes.ts,service.ts,upload.ts}`, `packages/shared/src/import/manifest.ts`, `apps/api/test/import.test.ts`
- **Depends on**: FEAT-011, FEAT-054, FEAT-052, FEAT-013
- **DoD**:
  - Токены: создать или отозвать (admin), хэш в БД, показ один раз. Роль `import` даёт доступ только к `/api/import/*` (FEAT-049).
  - Манифест: `{externalId, subjectKey, title, lessonDate?, xp?, coins?, questions[] {key, text, options, correct, image?, evidence}, transcript?, media {kind, files[{path, size, sha256}]}}`.
  - Конфиг задания из манифеста строит хук типа `fromImport(manifest) → config` (контракт FEAT-008, реализация для `video_lesson` — в FEAT-013); модуль импорта логику типа не содержит.
  - `POST /api/import/lessons` — upsert по `externalId`:
    - новое задание создаётся как `draft`;
    - для **опубликованного** создаётся **ревизия** `task_revisions(pending)`: новые версии вопросов в `state=pending`, новое медиа `pending`. Ученики продолжают видеть текущее, пока админ не примет ревизию; после принятия старое медиа уходит под ретеншн (тесты).
  - Ревизии (admin): `GET /api/admin/task-revisions?status=pending`, `GET …/:id` (diff вопросов, конфликты с правками админа), `POST …/:id/acceptance` (атомарно: версии вопросов → active, `task.config.mediaId` → новое медиа) и `POST …/:id/rejection` (тесты + строки FEAT-049).
  - Чанки:
    - `PUT /api/import/media/:id/files/<path>?offset=` ≤ 8 МБ, потоком на диск;
    - путь через `safePath()` после URL-декодирования (тест на `%2e%2e`, `..%2f`);
    - принимаются только файлы, заявленные в манифесте, и не больше заявленного размера;
    - `offset` обязан равняться текущему размеру файла, иначе 409 с текущим размером;
    - проверка свободного места (`statfs` ≥ размер + 1 ГБ);
    - продолжение после обрыва (тесты).
  - `complete` сверяет размеры и sha256 → `ready` (тест).

### FEAT-014 — Тип `chore`: дела с подтверждением
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты. Learner: `GET /api/tasks/:taskId/chore-completions` (`{repeat, periodKey, current, items[]}` — текущий период и до 50 отчётов, новые первыми), `POST /api/tasks/:taskId/chore-completions` («Я сделал»: 201 — новый `pending`; если в периоде уже есть `pending|approved`, он и возвращается, 200). Admin: `GET /api/admin/chores/reviews?status=pending|approved|rejected&learnerId` (по умолчанию `pending`, ожидающие — старые первыми), `POST /api/admin/chores/reviews/:id/approval` (201 / 200 повтор), `POST /api/admin/chores/reviews/:id/rejection {comment?}` (201 / 200 повтор). Одобрить отклонённое или отклонить одобренное → 409 `already_reviewed`.
  - Config `{repeat: once|daily|weekly}` (по умолчанию `once`), `publicConfig` = config; submission пуст (`{}`). `grade` нет — движок попыток отвечает 409 `no_questions`. Чужое, невидимое, черновик и задание другого типа → 404; закрытое правилами открытия → 409 `task_locked`. Отчёт отмечает задание начатым (`progress.markStarted`); task_progress зачётом не пишется — награда только через `chore:<id>`, а не через ключ `task:…:pass`.
  - Колонки сверх DoD: `reward_xp`, `reward_coins` (что выплатило одобрение — снимок награды задания на тот момент, как у попыток), `note` — комментарий отклонения. Ревью меняет строку ровно один раз. Индекс `(learner, task)` для истории. `period_key` — `dayKey`/`weekKey` по `settings.timezone` на момент отчёта. Audit `chore.approved|rejected` (с `learnerId`).
  - Вне Scope: `packages/shared/src/task-types/chore/dto.ts` (в маске Scope), регистрация в `app.ts`, `startup.ts` (`ctx.chores`), реестрах типов (api и shared), `schema/index.ts`. Строки FEAT-049 добавлены (5 маршрутов, learnerB → 404 на делах ученика A). Тестов 661 (+2 пропущено), было 647.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §8 «chore»; Critique 1 HIGH#11.
- **Rule**: CLAUDE.md 1, 4, 10, 12
- **Scope**:
  - `packages/shared/src/task-types/chore/*`, `apps/api/src/task-types/chore/{index.ts,routes.ts,service.ts}`, `apps/api/src/db/schema/choreCompletions.ts` + миграция, `apps/api/test/chore.test.ts`
- **Depends on**: FEAT-009
- **DoD**:
  - `chore_completions(id, learner, task, period_key, status pending|approved|rejected, note, reviewed_by, reviewed_at, created_at)`. Частичный UNIQUE `(learner, task, period_key) WHERE status IN ('pending','approved')`: после отклонения можно сдать снова (новая строка), в том числе для `once` (тесты). `period_key` = `once` | `dayKey` | `weekKey` по `repeat`.
  - Одобрение → ledger `idem_key = chore:<completion_id>`. Отклонение с комментарием. `GET /api/admin/chores/reviews?status=pending`. Строки FEAT-049.

### FEAT-016 — Причины наград и ручные начисления
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты. Admin: `GET/POST /api/admin/reward-reasons`, `PATCH /api/admin/reward-reasons/:id` (`{name?, xp?, coins?, archived?}`), `GET/POST /api/admin/learners/:id/awards` (201 — новое, 200 — повтор `requestId`), `POST /api/admin/learners/:id/awards/:awardId/cancellation` (201 / 200 повтор). Learner: `GET /api/me/awards` («От родителя», новые первыми, `?cursor&limit`).
  - Причины не удаляются физически (как в оригинале: «удаление — это архивирование»), «D» в CRUD — `PATCH {archived:true}`; восстановление проверяет уникальность имени. Имя 1–60, уникально среди активных без учёта регистра и повторных пробелов (частичный UNIQUE `name_key WHERE archived_at IS NULL`), XP и монеты 0–1000, хотя бы одно > 0. Лимита 100 причин нет (PARITY 02-013). Сид по `seed_key` (`attendance`, `homework`) — хук старта на каждом запуске вставляет только отсутствующие ключи, строки не меняет, поэтому правки и архив админа переживают перезапуск.
  - Начисление: таблица `awards` (сверх DoD, в том же `schema/rewardReasons.ts`, как `media_files` у FEAT-011) — снимки `reason_name` и `subject_name`, `title_key`, `date`, необязательный `task_id` (PARITY 02-014), `note`. Строка не меняется: оплата — строка ledger `award:<learner>:<requestId>` с `source_id` = id начисления, отмена — компенсирующая строка `ledger.reverse` (видна через `reverses_id`, `cancelledAt` — время отмены). `reasonId` — id причины или `"custom"` («Своя награда»); `subjectKey` архивного/неизвестного предмета → 400 `unknown_subject`, неизвестное задание → 400 `unknown_task`, архивная причина → 400 `unknown_reason`. Повтор `requestId` возвращает первое начисление до любых проверок.
  - Дубль (та же причина, дата, предмет и нормализованное название среди неотменённых начислений ученика) → 409 `duplicate_award` `{awardId, force:true}`; с `force:true` проходит (в audit `forced`). Audit: `reward_reason.created|updated`, `award.granted|cancelled` (с `learnerId`).
  - Вне Scope: `packages/shared/src/rewards/dto.ts` (схемы запросов и DTO для web), регистрация в `app.ts`, `startup.ts` (`ctx.rewards`, хук сида), `schema/index.ts`. Строки FEAT-049 добавлены (7 маршрутов). Тестов 647 (+2 пропущено), было 627.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: spec/02 §2.3; Critique 1 MED#2, LOW (дефолтные причины, поля, защита от дубля).
- **Rule**: CLAUDE.md 4, 5, 6
- **Scope**:
  - `apps/api/src/db/schema/rewardReasons.ts` + миграция, `apps/api/src/modules/rewards/{routes.ts,service.ts,seed.ts}`, `apps/api/test/rewards.test.ts`
- **Depends on**: FEAT-007
- **DoD**:
  - Сид двух причин по умолчанию: «Присутствие на уроке», «Домашняя работа» (50 XP / 10 монет), по `seed_key`. CRUD и архивирование (тест).
  - Начисление `{reasonId|custom, title, date, subjectKey?, xp, coins, note, requestId}`:
    - ключ `award:<learner>:<requestId>`;
    - дубль «причина + дата + название» — предупреждение 409 с `force` (тест).
  - Отмена через `ledger.reverse` с audit. Ученик видит начисления в «От родителя». Строки FEAT-049.

### FEAT-026 — Ассеты MVP: импорт и пережатие
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Итог: 249 исходных файлов → 279 файлов, 75,2 МБ (бюджет 90 МБ = 90·10⁶ байт). Импорт идёт ~10 с, `pnpm assets:import -- --source <QuestClass-Source или его public>`; `pnpm assets:budget` — отчёт по папкам.
  - В манифесте у записи есть поле `kind` (`image|audio|font|text`). У звуков, шрифтов и текста только `bytes`, у анимированных картинок кроме `frames` есть `durationMs` (сумма длительностей кадров, совпадает с `durationMs` каталога оригинала). Ключ — путь от `apps/web/public/assets`, URL — `/assets/<ключ>`.
  - Манифест строится разбором заголовков (WebP/PNG/SVG) без sharp, поэтому тест в CI не требует нативных зависимостей. sharp 0.35 — devDependency корня (без install-скрипта).
  - WebP оригинала (в том числе анимированные) копируются байт в байт. PNG → WebP без потерь, размеры те же; это касается всех PNG, включая непиксельные (`wishes.png`, `rewards/towel…`). PNG остались только у иконок платформы (манифест PWA, apple-touch, favicon, иконка уведомлений, `stars-transparent-v7/*-192.png`): режим `keep`.
  - Ролик серии → animated WebP 768×1168 (размер исходника), 12 кадров/с вместо 24, q70, бесконечный цикл (121 кадр, 10,08 с; плеер FEAT-038 останавливает его по `durationMs`). У MP4 был звук с кнопкой «Включить звук», поэтому дорожка вынесена в `celebrations/streak-five-v1.{ogg,mp3}`.
  - Звук: OGG оригинала копируется, к нему MP3 (LAME VBR q4, исходная частота); MP3 оригинала (`ui-audio`) копируется, к нему OGG (Vorbis q4). Шрифты TTF не конвертируются: их читает jsPDF для PDF-отчёта; лицензия DejaVu лежит рядом.
  - Исключены файлы, на которые код оригинала не ссылается (старые версии и остатки, список с комментариями в `mvp-assets.txt`): `rebound-audio/` (используется `rebound-audio-v2/`), `room-rebound-hotel{,-thumb}.webp` и `rebound-curtain.webp` (используются `-v3`), `fitting-room/{heroes.png,room.png,*-compact.webp}`, `animated/{blue-cover.png,blue-idle.webp}`, `repaired/vampire-juice*` (используется `vampire-drink-v2`), `red-hero.jpg`, 4 неиспользуемых спрайта Рибаунда, `menu/multiplication.webp`, 2 звука `night-hotel/audio/ui`, старые наборы `icons/stars/` и `icons/stars-cobalt-v5/`.
  - Тест детерминизма ищет оригинал в `<repo>/QuestClass-Source` или по `QUESTCLASS_SOURCE` (только для dev, например из worktree), пропускается и без ffmpeg; идёт ~12 с.
  - `.gitattributes`: `apps/web/public/assets/** binary`, чтобы SVG и текст лицензии не нормализовались и совпадали с манифестом.
  - Для FEAT-044: у Vite `build.assetsDir` по умолчанию тоже `assets`, хэшированные бандлы попадут в `dist/assets` рядом с нехэшированными игровыми ассетами. Нельзя помечать весь `/assets/*` как `immutable`: сменить `build.assetsDir` или различать по хэшу в имени.
  - `docs/PLACEHOLDERS.md` создан: каталожных заглушек нет, в реестре 3 слота без встроенной картинки (загрузки товаров и похвал, значок нового предмета).
  - Вне Scope: `scripts/parity-check.mjs` только переформатирован prettier (на базовой ветке `pnpm lint` падал на нём), логика не менялась, `--strict` зелёный; в корневой `package.json` добавлены скрипты `assets:import` и `assets:budget`.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: Clarification «в git, пережатые»; «анимации — всё в MVP»; Critique 1 HIGH#1, MED#11, LOW (MP3).
- **Rule**: CLAUDE.md 9, 13, 16
- **Scope**:
  - `scripts/assets/{mvp-assets.txt,import.mjs,manifest.mjs,budget.mjs}` (sharp — только devDependency скриптов, на сервер не попадает), `apps/web/public/assets/**`, `packages/shared/src/assets/manifest.json`, `apps/web/test/assets.test.ts`
- **Depends on**: FEAT-001
- **DoD**:
  - Источник — явный список `mvp-assets.txt`, без чтения каталога: глобы по `game/characters`, `game/animated`, `game/fitting-room`, `game/rooms` (включая night-hotel, astro- и rebound-audio), `game/menu`, `game/ui-audio`, `game/subjects-pixel`, `game/subjects.png`, `game/report-robux.svg`, `heroes.png`, `special.png`, `wishes*.png`, `icons`, `rewards`, `celebrations`, `fonts`.
  - Картинки квизов сюда не входят: они едут с уроками через импорт.
  - Пережатие:
    - PNG → WebP (без потерь для пиксель-арта);
    - анимированный WebP — с сохранением кадров;
    - аудио → OGG + MP3 (запасной для iOS);
    - видео-празднования (ролик серии) → анимированный WebP; MP4 в git нет.

    Итог ≤ 90 МБ (`budget.mjs` падает при превышении).
  - Манифест: путь → `{w, h, bytes, animated, frames?}`.
  - Тест в CI: манифест соответствует файлам в `apps/web/public/assets` (наличие и размеры).
  - Тест детерминизма (повторный импорт = тот же результат) запускается только при наличии `QuestClass-Source/`, в CI пропускается с пометкой.

### FEAT-017 — Каталог: товары, герои, комнаты, анимации, сцены + сид
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Таблицы: библиотека встроенной графики `characters` (45: картинка-ассет, ячейка спрайта, `foot_offset`), `animations` (21: 20 `hero` — 11 живых + 9 экшенов, и 1 `room` — Астро; анимированный WebP `src` или CSS-движение `motion bounce|float|pendulum|sway`, постер), `rooms` (38: раздел, картинка и миниатюра, `foot_x/foot_y`, `scene`, `scene_assets` — слои и звуки особой сцены, объект-значение по правилу 1b) — и товары `catalog_items` (95: 53 образа, 38 комнат, 4 билета). Товар ссылается на библиотеку FK (`character_id`/`room_id`/`animation_id`) либо на загрузки `image_upload_id`/`animation_upload_id` (FK на `media`; у билета — `image` + `sprite`). DTO разворачивает всё в URL (`/assets/<ключ>`, загрузки — `/api/uploads/<id>` FEAT-018) и флаг `animated` (живой герой; комната с анимацией или не `static` сценой).
  - `scene`: `static | ambient:<embers|fairy|forest|water|clock|rebound> | night-hotel | astro | rebound`. В сиде `ambient:` — 5 тем (Дракула → embers, Галерея сказок и спальня Дозера → fairy, Лесной домик → forest, острова Марта → water, обсерватория Cadence → clock); шестая тема `rebound` входит в сцену `rebound` (как в оригинале: ambient + своя накладка). Звуки и слои «Ночного отеля», Астро и Рибаунда — в `scene_assets` (ogg; mp3 лежит рядом).
  - Сид `apps/api/seed/catalog.json` извлечён разово скриптом вне репозитория из `QuestClass-Source/lib` (`initialGame` + паки + `shopItemAtEconomyPrice`; пути — ключи манифеста FEAT-026, PNG → WebP, базовые герои — `fitting-room/*-original.webp`, pizza/seek/dozer и билеты — ячейки спрайтов). Цены spec/02 §2.5: образ 40, живой 80, комната 120, анимированная 200, «300 Robux» 300 (robux 300), «Картошка и наггетсы из Додо» 400 (wish 1), киновечер 100, сюрприз 200. Стартовые `blue`, `purple`, `room-default` — `starter: true`, цена 0, `active: false` (не продаются, есть у всех). Видимость MVP: все остальные образы и комнаты `active`, из билетов — только `tokens`.
  - Сид — хук старта после миграций, в одной транзакции: библиотека — upsert по `key`, товары — по `seed_key`; совпадающие строки не пишутся (повторный старт — 0 записей), изменение несиданных полей — `version + 1`. `edited_fields` (JSON-массив полей, правило 1b) ведёт админский PATCH; при пересиде эти поля остаются админскими, а если смесь перестала быть валидным товаром (та же проверка, что у сохранения админом), строка не меняется. Разобранный сид кэшируется на процесс, библиотека при сиде читается один раз (пересид 3–5 мс).
  - Маршруты (admin): `GET /api/admin/catalog/library`, `GET /api/admin/catalog/items?kind`, `POST /api/admin/catalog/items` (201), `GET/PATCH /api/admin/catalog/items/:id`. Удаления нет (выключение — `active:false`, история покупок FEAT-019 ссылается на товар). Валидация как в редакторе оригинала: название 1–100, описание ≤800, цена 0–100000; у образа — герой или загрузка, анимация героя; у комнаты — фон или загрузка, раздел (по умолчанию из библиотеки), анимация комнаты 3:2 ±0,02, «Ночному отелю» анимацию нельзя; у билета — картинка (ассет манифеста не из `game/rooms/`) или загрузка, награда, для Robux — количество, у желания количество всегда 1, анимации нет. Ошибки — 400 `invalid_item`; смена типа купленного — 409 `kind_locked`. Audit `catalog_item.created|updated`.
  - Точки расширения для следующих пунктов (без них поведение безопасное): `describeUpload(mediaId)` — факты о загрузке (FEAT-018; до него загрузки отклоняются) и `hasPurchases(itemId)` (FEAT-019; до него тип менять можно). Сервис сверх DoD: `starters()` (FEAT-021), `findRow()`, `resolve()`/`draftOf()`.
  - Вне Scope: `packages/shared/src/catalog/dto.ts` (схемы сида и запросов, DTO), регистрация в `app.ts`, `startup.ts` (`ctx.catalog`, хук сида), `schema/index.ts`. Строки FEAT-049 добавлены (5 маршрутов). Тестов 681 (+2 пропущено), было 661. RSS в простое ~83 МиБ (WorkingSet; базовая ветка на этой машине тем же замером — 80–82 МиБ).
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.5, §2.8; Clarification «все анимации в MVP»; Critique 1 HIGH#1, HIGH#2, MED#12, LOW (seed_key).
- **Rule**: CLAUDE.md 5, 6, 16
- **Scope**:
  - `apps/api/src/db/schema/catalog.ts` + миграция (`catalog_items`, `characters`, `rooms`, `animations`), `apps/api/src/modules/catalog/{routes.ts,service.ts,seed.ts}`, `apps/api/seed/catalog.json`, `apps/api/test/catalog.test.ts`
- **Depends on**: FEAT-026, FEAT-005, FEAT-004, FEAT-049
- **DoD**:
  - Сид запускается при старте после миграций. Upsert идёт по `seed_key`; поля с флагом `edited_by_admin` не перетираются (тест).
  - У комнаты есть поле `scene: static|ambient:<theme>|night-hotel|astro|rebound` (компонент выбирается по нему, не по id).
  - Сид содержит:
    - всех героев и все паки (Mart, Cadence, Dozer, Rebound, Astro, live-sets);
    - 9 экшен-анимаций;
    - все комнаты, включая Rebound, Astro, «Ночной отель» и 6 ambient-тем;
    - билеты; цены — из spec/02 §2.5.
  - Стартовые предметы помечены `starter: true` в сиде (`blue`, `purple`, `room-default`), в коде их id нет (тест).
  - **Видимость для MVP** (альбомов и искр нет): все герои, живые герои и комнаты активны в магазине. Из билетов активен «300 Robux», остальные выключены, админ включает сам (тест: каждый анимированный товар достижим).
  - Тест: каждый путь картинки, анимации или звука из `catalog.json` есть в манифесте FEAT-026.
  - Админ-CRUD: валидация, `version++`, тип купленного товара менять нельзя (тесты + FEAT-049).

### FEAT-018 — Загрузка картинок админом
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты: `POST /api/admin/uploads` (admin, тело — сырые байты файла, лимит тела 6 000 000 байт; 201 `{id, url, mime, sizeBytes, animated, durationMs, width, height, frames, createdAt}`), `GET /api/admin/uploads` (admin, новые первыми), `GET /api/uploads/:id` (learner, admin; потоком через `streamFile` FEAT-011: Range, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=86400` — содержимое под id не меняется). Не-загрузка, не готовое и неизвестное → 404.
  - `webp.ts` (написан заново, без нативных библиотек и декодирования): тип только по сигнатуре — PNG (IHDR), JPEG (маркеры SOFn), WebP (`VP8 `, `VP8L`, `VP8X` + `ANIM`/`ANMF`: кадры, сумма длительностей, самый короткий кадр, кадр в пределах холста). Тест сверяет разбор с манифестом FEAT-026 на всех 150+ WebP/PNG ассетах (размеры, анимация, кадры, длительность).
  - Лимиты: картинка ≤2 МиБ, анимация ≤5 МиБ (413 `file_too_large`), ≤1024×1024 для любых, у анимации 2–120 кадров, ≤10 с, кадр ≥40 мс (422 `invalid_image`), чужой формат → 415 `unsupported_type`, повреждённые заголовки → 422, всего ≤300 неудалённых загрузок (409 `uploads_full`). Анимированный это слот или нет, решает файл: анимированный WebP — анимация, остальное — картинка; слот проверяет каталог.
  - Хранение — `media` (`role=upload`, `kind=image`, один файл `image.<webp|png|jpg>` в `media_files` с sha256), признак анимации и длительность — в `media.duration_sec` (у неподвижной `NULL`); размеры не хранятся, а читаются из заголовков файла, когда их спрашивает каталог (`describe(id)` при сохранении товара) — так обошлось без изменения схемы `media`. Если файл не записался, строка медиа помечается удалённой. Audit `upload.created`.
  - Подключено к каталогу FEAT-017: `describeUpload` = `uploads.describe` (образ/комната/билет с загруженной картинкой, анимация героя, анимация комнаты 3:2).
  - Удаления загрузок нет (в DoD нет; на загрузку ссылается товар через FK RESTRICT). Вне Scope: регистрация в `app.ts`, `startup.ts` (`ctx.uploads`, связь с каталогом). Строки FEAT-049 добавлены (3 маршрута; JSON-тело — не картинка, поэтому у админа в строке POST 415). Тестов 691 (+2 пропущено), было 681. Один прогон `pnpm test` под параллельной нагрузкой на машине уронил `tools/lesson-prep` `import.test.ts` по таймауту 5 с (сам по себе — 0,4 с); повторный прогон зелёный.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.7.
- **Rule**: CLAUDE.md 11, 13
- **Scope**:
  - `apps/api/src/modules/uploads/{routes.ts,service.ts,webp.ts}` (хранение — таблица `media` с `role=upload`, отдельной таблицы нет), `apps/api/test/uploads.test.ts`
- **Depends on**: FEAT-011
- **DoD**:
  - Тип файла — по сигнатуре (PNG, JPEG, WebP). Лимиты: ≤2 МиБ, анимация ≤5 МиБ, ≤1024×1024, ≤10 с, ≤120 кадров, ≥40 мс на кадр, всего ≤300 файлов (тесты на фикстурах). WebP разбирается по заголовкам, без нативных библиотек. Тело запроса ≤6 МБ.
  - `GET /api/uploads/:id` (роли learner и admin) отдаёт файл для витрины и наград. Строки FEAT-049.

### FEAT-019 — Покупки в магазине
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты (learner): `GET /api/shop` → `{coins, items[]}` — активные нестартовые товары (`CatalogItemDto` + `affordable`, `missingCoins`), без купленного и уже имеющегося, билеты всегда; живые первыми, дальше порядок каталога. `POST /api/shop/purchases {itemId, version, requestId}` → 201 `{purchase, coins}` (повтор `requestId` — 200 с той же покупкой).
  - `purchases` — одна вставка на покупку, не меняется: снимок `kind, title, description, price, item_version, reward_type/amount` + `snapshot` (JSON-объект-значение: `hero/room/roomCategory/animation/ticket/animated` из DTO каталога на момент покупки — правило 1b, как снимок вопроса) + `visual_key`. Списание — `ledger.spend` с ключом `purchase:<learner>:<requestId>`, `source_id` = id покупки, `note` = название; покупка и списание в одной транзакции (нехватка монет откатывает вставку). UNIQUE `(learner, request_id)`.
  - Отказы (409): тот же `requestId` для другого товара — `request_conflict`; выключенный, стартовый или несуществующий — `item_unavailable`; версия ≠ текущей — `item_changed {version}`; уже есть (купленный товар, стартовый или такой же по картинке+анимации) — `already_owned` с текстом оригинала для героя/комнаты; монет меньше цены или баланс < 0 — `insufficient_coins` (FEAT-007). Билеты — сколько угодно раз.
  - `ownership.ts`: `visualKey` (вид + картинка из библиотеки или загрузка + анимация или `still`) и `owned(learner)` — стартовые (по флагу `starter`, текущий вид из каталога) + купленное (снимок), дубли по `visual_key` схлопнуты; для FEAT-021. `itemHasPurchases` подключён к каталогу FEAT-017 (`hasPurchases` → 409 `kind_locked`). Отдельного списка покупок по HTTP нет (сервис `purchases(learner)` для FEAT-020/021); в «Истории» покупка видна строкой ledger.
  - Вне Scope: `packages/shared/src/shop/dto.ts`, регистрация в `app.ts`, `startup.ts` (`ctx.shop`, `hasPurchases` каталога), `schema/index.ts`. Строки FEAT-049 добавлены (2 маршрута; оба ученика с монетами покупают билет каждый под своим ключом). Тестов 699 (+2 пропущено), было 691.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.5.
- **Rule**: CLAUDE.md 4, 5
- **Scope**:
  - `apps/api/src/db/schema/purchases.ts` + миграция, `apps/api/src/modules/shop/{routes.ts,service.ts,ownership.ts}`, `apps/api/test/shop.test.ts`
- **Depends on**: FEAT-007, FEAT-017
- **DoD**:
  - `POST /api/shop/purchases {itemId, version, requestId}`: снимок товара и списание в одной транзакции. `idem_key = purchase:<learner>:<requestId>` (тест).
  - Отказы: другой товар с тем же `requestId` (409), устаревшая версия, уже принадлежит (с учётом дублей по картинке и анимации), нехватка монет, неактивный товар (тесты). Билеты можно покупать многократно.
  - `GET /api/shop`: купленное скрыто, есть флаги `affordable` и `missingCoins`. Строки FEAT-049.

### FEAT-020 — Билетики: просьбы и выдача (вставками)
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты. Learner: `GET /api/me/wishes?cursor&limit` → `{groups[], history {items, nextCursor}}` (история по 20, новые первыми), `POST /api/me/wish-requests {groupKey}` (201 — вставка, 200 — группа уже запрошена, чужая/пустая → 404). Admin: `GET /api/admin/wishes?status=open|remaining` (по умолчанию `open` — запрошенные; `remaining` — всё с остатком; по ученикам), `POST /api/admin/learners/:id/fulfillments {groupKey, amount, expectedRemaining, requestId}` (201 / 200 повтор).
  - Группа: все Robux-билеты ученика — `robux`; желание — `wish:<itemId>:<12 hex sha256(название, описание)>` (как в оригинале по [товар, название, описание]: переименованный товар начинает новую группу для новых покупок). Ключ группы вычисляется из снимка покупки, в `purchases` не хранится.
  - Ничего не обновляется: остаток покупки = `reward_amount − SUM(allocations)` (SQL-агрегат), остаток группы — сумма. Выдача — вставка `fulfillments` (квитанция: тип, название «Robux» или желания, количество) + вставки `fulfillment_allocations` по FIFO (по id покупки, частично). UNIQUE `(learner, request_id)`: повтор → та же квитанция, тот же `requestId` для другой группы → 409 `request_conflict`; `expectedRemaining` ≠ остатку → 409 `remaining_changed {remaining}`; больше остатка → 409 `amount_exceeds_remaining`; нет группы → 404. Монеты не возвращаются. Audit `wish.fulfilled` (с `learnerId`).
  - Статус группы выводится, не хранится: `requested`, пока самая новая просьба новее самой новой квитанции группы; после частичной выдачи остаток снова `ready` (ученик может попросить ещё раз). Уведомление родителю в MVP — очередь `status=open` (push — этап 2).
  - Вне Scope: `packages/shared/src/wishes/dto.ts`, регистрация в `app.ts`, `startup.ts` (`ctx.wishes`), `schema/index.ts`. Строки FEAT-049 добавлены (4 маршрута, просьба learnerB → 404). Тестов 708 (+2 пропущено), было 699.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.6; Critique 1 MED#22.
- **Rule**: CLAUDE.md 1, 4
- **Scope**:
  - `apps/api/src/db/schema/{wishRequests.ts,fulfillments.ts,fulfillmentAllocations.ts}` + миграция, `apps/api/src/modules/wishes/{routes.ts,service.ts}`, `apps/api/test/wishes.test.ts`
- **Depends on**: FEAT-019
- **DoD**:
  - Просьба = одна вставка `wish_requests(learner, group_key, at)`.
  - Выдача = вставка `fulfillments` + вставки `allocations` по FIFO. Покупки не обновляются: остаток и статус вычисляются из сумм (тест). Robux — одна группа.
  - Выдача идемпотентна по `requestId`. При несовпадении `expectedRemaining` → 409 (тесты + FEAT-049).
  - `GET /api/me/wishes` (группы с остатком и история) и `GET /api/admin/wishes?status=open` (ждут выполнения, по ученикам) (тесты).

### FEAT-021 — Персонаж
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Маршруты (learner): `GET /api/me/character` → `{name, look, room, looks[], rooms[]}` (гардероб: стартовые + купленное, каждая вещь — `itemId`, `purchaseId|null`, название и снимок вида как куплено), `PUT /api/me/character/look {itemId}`, `PUT /api/me/character/room {itemId}`, `PUT /api/me/character/name {name}` (1–30 после схлопывания пробелов). Не своё (не стартовое и не купленное этим учеником, другой вид, неизвестное) → 403 `not_owned` «Сначала открой этот скин в магазине» / «…этот фон в магазине» (про альбомы — этап 2). Цвет фона героя оригинала (`sky|mint|sun|lilac`) не перенесён — в DoD нет, в новом интерфейсе не используется.
  - Таблица `learner_characters` (PK `learner_id`; `name`, `look_item_id`, `room_item_id` — FK на `catalog_items`): имя `characters` уже занято библиотекой героев FEAT-017. Строка создаётся первым изменением (upsert одной колонки), до этого надеты стартовые. Владение и гардероб — `ownership.owned()` FEAT-019 (стартовые по флагу `starter`, без id в коде; купленное — из снимков; дубли по виду схлопнуты).
  - `GET` только читает: если надетое больше не принадлежит (или ничего не выбрано), отдаётся первое доступное, в БД ничего не пишется (тест на `total_changes`).
  - Вне Scope: `packages/shared/src/character/dto.ts`, регистрация в `app.ts`, `startup.ts` (`ctx.character`), `schema/index.ts`. Строки FEAT-049 добавлены (4 маршрута; надеть купленное учеником A: A → 200, B → 403). Тестов 718 (+2 пропущено), было 708.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: spec/02 §2.8.
- **Rule**: CLAUDE.md 1, 2, 5
- **Scope**:
  - `apps/api/src/db/schema/character.ts` + миграция, `apps/api/src/modules/character/{routes.ts,service.ts}`, `apps/api/test/character.test.ts`
- **Depends on**: FEAT-019
- **DoD**:
  - Стартовые герои и комната берутся из каталога по флагу `starter` (FEAT-017), в коде id нет. `GET /api/me/character` только читает; если надетое больше не принадлежит, отдаётся первое доступное без записи (тест).
  - `PUT look|room|name` (имя 1–30) проверяет владение → 403 «Сначала открой этот скин…» (тест + FEAT-049).

### FEAT-022 — Удаление видео по сроку
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Планировщик `jobs/scheduler.ts` — в процессе, без внешнего cron: `createScheduler(db, jobs)` (таймеры `unref`, `stop()` — closer в `openRuntime`, запуск — хук старта сервера; CLI планировщик не запускает), `runJob()` и `ctx.scheduler.runNow(name)`. Задача `video-retention`: первый запуск через 5 мин после старта, затем раз в час.
  - `job_runs(job, started_at, finished_at, status running|ok|failed, result json-счётчики, error)`; частичный UNIQUE `(job) WHERE finished_at IS NULL` — запуски не пересекаются и между процессами (второй → `skipped`); незавершённый запуск старше 6 ч (упавший процесс) закрывается `failed: interrupted`; ошибка задачи пишется `failed` с текстом, следующий запуск идёт.
  - `jobs/retention.ts`: удаляются только `role=video`: (1) заменённые переимпортом (`delete_after ≤ now`); (2) видео задания, которое все из аудитории (`tasks.audience`: назначенные или все активные; деактивированные не считаются; пустая аудитория — не удаляем) прошли или закрыли раньше `now − video.retentionDays` — выполненность и дата берутся из `progress.learnerProgress` (с последнего сброса: сброс по заданию снова требует видео; переоткрытое «Пройти с мамой» остаётся выполненным). Невидимые ученику (черновик, архив, будущая дата) не считаются выполненными — их видео остаётся. `markDeleted` FEAT-011: файлы удаляются, строка `deleted`; вопросы, картинки вопросов и расшифровки остаются. Ключ `video.retentionDays` (30, 1–3650).
  - `canStart` видеоурока: если видео урока удалено — тест открывается без просмотра (тест: до удаления 409 `watch_required`, после — попытка стартует).
  - Вне Scope: регистрация в `app.ts` (`ctx.scheduler`), `startup.ts` (планировщик, closer, хук), `schema/index.ts`, `settings/registry.ts`. Новых маршрутов нет. Тестов 727 (+2 пропущено), было 718. RSS собранного API в простое ~84 МиБ (WorkingSet на Windows; базовая ветка f138e0e тем же замером 80–82 МиБ).
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §1 «через 30 дней после прохождения; настройка».
- **Rule**: CLAUDE.md 2, 6
- **Scope**:
  - `apps/api/src/jobs/{scheduler.ts,retention.ts}`, `apps/api/src/db/schema/jobRuns.ts` + миграция, `packages/shared/src/settings/keys/video.ts`, `apps/api/src/task-types/video_lesson/canStart.ts` (удалённое видео → тест без просмотра), `apps/api/test/retention.test.ts`
- **Depends on**: FEAT-013, FEAT-012
- **DoD**:
  - Раз в час медиа удаляется, если все ученики, кому задание назначено (или все активные, если назначений нет), прошли или закрыли его больше `video.retentionDays` (30) дней назад. Также удаляется медиа, заменённое переимпортом. Файлы удаляются, статус `deleted`, вопросы и расшифровка остаются (тест с фейковым временем).
  - Запуски пишутся в `job_runs` и не пересекаются (тест). Тест удалённого видео проходится без просмотра.

### FEAT-023 — `lesson-prep import`
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `lesson-prep import <папка>… [--config] [--server] [--encoder auto|nvenc|x264]`; `--token` в любом виде отклоняется. Настройки `~/.questclass/lesson-prep.json`: `server`, `token?`, `encoder`, `ffmpeg`, `ffprobe`, `videos?` (для FEAT-048), неизвестные поля — ошибка (опечатки). Без `token` токен читается из stdin (первая строка) или спрашивается в терминале. Тексты CLI по-русски.
  - Пакет: `lesson.json` (поля манифеста FEAT-012 без `media`/`images`, плюс `video` — путь к исходнику, по умолчанию `video.mp4`), `hls/`, `images/`. `lesson.json` проверяется общей схемой `lessonManifestSchema` с заглушкой медиа **до** перекодирования; картинки — только `images/<имя>`, существование файлов проверяется; все ошибки выводятся списком.
  - HLS: один запуск ffmpeg на обе дорожки (`split` + `scale=-2:360|480`, `format=yuv420p` — исходники AV1/VP9 10-бит тоже проходят), H.264 main, VBR 400/700 кбит/с (max 500/900), AAC стерео 64/96 кбит/с, ключевой кадр каждые 4 с (`-force_key_frames`), сегменты 4 с, `master.m3u8` + `360p|480p/index.m3u8` + `seg_00000.ts`. NVENC (`h264_nvenc -preset p5`) выбирается, только если пробное кодирование на GPU прошло, иначе libx264 `veryfast`. Видео без звука — без аудио-дорожек (проверка ffprobe). Пути для ffmpeg с прямыми слешами (иначе на Windows в master попадает `360p\index.m3u8`). Работа в `hls.tmp/`, переименование в конце; HLS переделывается, если видео новее `master.m3u8`. Длительность — сумма `#EXTINF` первого варианта (уходит в `completion {durationSec}`).
  - Загрузка: sha256 и размер каждого файла, манифест, затем только недостающие байты частями по 4 МБ (4 файла параллельно); `offset_mismatch`/`upload_interrupted` → продолжение с `details.received`; сетевая ошибка или 5xx → пауза, `GET /api/import/media/:id`, продолжение с принятого (до 5 попыток); `verification_failed` → перезалить сброшенные файлы один раз. Повторный запуск без изменений ничего не кодирует и не шлёт.
  - Тесты: ffmpeg мокается (`test/fakeFfmpeg.ts` — помощник вне маски `*.test.ts`), сервер — тестовый экземпляр API в процессе (`fetch` → `app.request`, импорт из `apps/api/src` и `apps/api/test/helpers`). Сверх DoD тест с настоящим ffmpeg (`testsrc` + `sine`, 9 с) проверяет, что команда даёт 360p/480p H.264 + AAC с сегментами по 4 с; без ffmpeg пропускается. Тестов 462 (+1 пропущен), было 432.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §5 «В MVP — минимальная команда import»; Critique 1 LOW (токен не в аргументах).
- **Rule**: CLAUDE.md 13
- **Scope**:
  - `tools/lesson-prep/src/{cli.ts,config.ts,commands/import.ts,hls.ts,upload.ts}`, `tools/lesson-prep/README.md`, `tools/lesson-prep/test/*.test.ts`
- **Depends on**: FEAT-012
- **DoD**:
  - Конфиг `~/.questclass/lesson-prep.json` (`server`, `token`) или токен из stdin; в аргументах токена нет.
  - `import <папка>`:
    - валидирует `lesson.json`;
    - MP4 без HLS → локальный ffmpeg (360p и 480p, сегменты 4 с, NVENC при наличии);
    - считает sha256 и докачивает с `offset` (тесты: ffmpeg мокается, сервер — тестовый экземпляр API).

### FEAT-048 — Сид 5 уроков
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Фикстуры извлечены разово скриптом вне репозитория (в git не попал, в Scope его нет) из `QuestClass-Source/lib/subtitle-lesson-pack.json`: 5 уроков SPEC §9, предметы оригинала → ключи (`математика`→`math`, `изо`→`art`, `Окр мир`→`world`, `Русский`→`russian`, `чтение`→`reading`), ключи вопросов `q1…q8`, `correct` индекс → `a–d`, `helpVideo {startSeconds,endSeconds,quote}` → `evidence {start,end,quote}`. 53 PNG из `public/quiz` → WebP без потерь (sharp), имена `q<N>.webp` / `q<N>-<a–d>.webp` в `seed/images/<videoId>/` (0,97 → 0,35 МБ). Подписи `alt` картинок оригинала не перенесены: в схеме вопроса их нет. Расшифровок в пакете оригинала нет — сид без них.
  - `lesson-prep seed [--videos] [--out]` (по умолчанию `videos` из настроек, `out` = `<videos>/packages`) пишет `<out>/<videoId>/lesson.json` (`externalId` = `yt-<videoId>`, `video` — абсолютный путь к `<videos>/<videoId>.mp4`, без копии) и `images/`; `hls/` между запусками сохраняется. Нет видео → перечисляются id и готовая команда `lesson-prep fetch … --out "<videos>"`, код выхода 2. `lesson-prep fetch [<ids>…] --out [--yt-dlp]` (без id — сид-уроки) вызывает установленный yt-dlp: `bv*[height<=480]+ba/b[height<=480]`, MP4, уже скачанные пропускаются.
  - Тест «seed + import»: 5 черновиков, по 8 вопросов с evidence, 53 картинки (`media/<id>/q…webp`), видео `ready`; сэмпл-видео — `ffmpeg -f lavfi testsrc` 3 с (с настоящим ffmpeg, а без него ffmpeg мокается), сервер — тестовый экземпляр API в процессе. Фикстуры проверяются схемой манифеста и сигнатурой WebP; от `QuestClass-Source` тесты не зависят.
  - Вне Scope: регистрация команд `seed` и `fetch` в `tools/lesson-prep/src/cli.ts` и раздел в `tools/lesson-prep/README.md`. Тестов 467 (+1 пропущен), было 462.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §9 «5 уроков»; Critique 1 MED#9.
- **Rule**: CLAUDE.md 16
- **Scope**:
  - `tools/lesson-prep/seed/original-5.json` (извлечённые вопросы и evidence 5 уроков), `tools/lesson-prep/seed/images/**` (53 картинки квизов), `tools/lesson-prep/src/commands/{seed.ts,fetch.ts}`, `tools/lesson-prep/test/seed.test.ts`
- **Depends on**: FEAT-023
- **DoD**:
  - Фикстуры извлекаются из `QuestClass-Source` разово и коммитятся. Тесты и CI от `QuestClass-Source` не зависят.
  - `seed --videos <папка>` (по умолчанию из конфига) собирает 5 пакетов уроков. Отсутствующие видео перечисляются с готовой командой загрузки. Опциональный `fetch <ids> --out <папка>` вызывает установленный yt-dlp (480p).
  - После `seed` + `import` в локальном API 5 черновиков по 8 вопросов с картинками и evidence (тест на тестовом сервере с маленьким сэмпл-видео).

### Фаза C — web ученика

### FEAT-024 — Каркас web: роутинг, клиент API, реестр типов
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Зависимости web: `react-router` 8 (data router: `createBrowserRouter`, `RouterProvider` из `react-router/dom`), `@tanstack/react-query` 5; dev — testing-library (`react`, `dom`, `user-event`, `jest-dom`) и `jsdom` 30.
  - Маршруты в `routes` (`router.tsx`): `/setup` и `/login` публичные; `/`, `/tasks/:id`, `/hero`, `/shop`, `/rewards` — роль learner; `/admin` + `/admin/*` — роль admin; `/dev/ui` — в dev всем, в production только админу. Пока экраны не готовы, на маршрутах стоят заглушки `ScreenStub` (их заменят FEAT-025/027/028/029…). Пока админа нет, любая страница ведёт на `/setup` (`SetupGate` по `GET /api/setup`).
  - Гварды: нет сессии → `/login` (в `state.from` — откуда пришли); ученик в админке → «Нет доступа» (со ссылкой «Войти как родитель» → `/login?as=admin`); админ на странице ученика → `/admin`. `QueryErrorView`: 401 → вход, 403 → «Нет доступа», остальное — сообщение и «Повторить». 401 на любом запросе (не мутации: там это «неверный пароль/PIN») сбрасывает кэш пользователя, и гварды показывают вход.
  - Клиент `api()`: тело ошибки сервера → `ApiError {status, code, message, details, retryAfterSec}`, сбой сети → status 0. Запросы auth/setup/profiles/devices и мутации входа, выхода, setup и доверенных устройств — в `api/queries/auth.ts` (их используют FEAT-028/039). 4xx не повторяются.
  - Реестр типов web: `createTaskTypeRegistry([...])` → `renderPlayer/renderEditor`; неизвестный тип — `role=alert` «Неизвестный тип задания «…»». Типы пропсов Player/Editor пока свои (контракты shared появятся в FEAT-008).
  - Vite `build.assetsDir: '_app'`: хэшированные бандлы в `/_app/*`, игровые ассеты остаются нехэшированными в `/assets/*` (замечание FEAT-026 для FEAT-044).
  - Вне перечня Scope (необходимо): `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/vite.config.ts`, `apps/web/src/app/App.tsx` (провайдеры + роутер), `apps/web/vitest.config.ts`, `apps/web/test/{setup.ts,helpers.tsx}`. Среда тестов web по умолчанию node (тесту ассетов FEAT-026 нужны `file:` URL), компонентные тесты включают jsdom докблоком `// @vitest-environment jsdom`.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §7; Critique 1 MED#14.
- **Rule**: CLAUDE.md 8, 10, 15
- **Scope**:
  - `apps/web/src/app/{router.tsx,providers.tsx,ErrorBoundary.tsx,guards.tsx}`, `apps/web/src/api/{client.ts,queries/*.ts}`, `apps/web/src/task-types/registry.ts`, `apps/web/test/*.test.tsx`
- **Depends on**: FEAT-001, FEAT-004, FEAT-051
- **DoD**:
  - Маршруты: `/`, `/tasks/:id`, `/hero`, `/shop`, `/rewards`, `/admin/*`, `/login`, `/setup`, `/dev/ui` (dev или админ).
  - На 401 — экран входа, на 403 — «нет доступа» (тесты).
  - Реестр типов web: `type → {Player, Editor}`. Неизвестный тип рендерит понятную ошибку (тест).

### FEAT-053 — e2e-стенд Playwright
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - e2e — пакет воркспейса `@questclass/e2e` (`e2e` в `pnpm-workspace.yaml`), `@playwright/test` закреплён точно (1.64.1): тег образа `mcr.microsoft.com/playwright:v<версия>-noble` берётся из него.
  - Команды: `pnpm e2e` — сборка + прогон на своей ОС (на Windows и macOS сравнение скриншотов пропускается с пометкой в отчёте, базы не пишутся); `pnpm e2e:docker` — прогон в Linux-контейнере как в CI (`CI=1`: недостающая база = падение); `pnpm e2e:update` — то же с `--update-snapshots`, базы копируются обратно в `e2e/__screenshots__`. Репозиторий копируется в контейнер без `node_modules`, pnpm-store — в docker-томе `questclass-pnpm-store`.
  - Образ-обёртка `e2e/Dockerfile` (FROM официального образа Playwright): в нём нет ffmpeg и corepack (Node 26), они доустанавливаются; corepack ставится с `--force` поверх yarn образа.
  - Global setup поднимает собранный API (`apps/api/dist/index.js`, `NODE_ENV=test`, временный `DATA_DIR`, setup-токен читается из лога) и SPA через `vite preview` с прокси `/api` (один origin, как в production); создаёт админа, ученика «Саша» с PIN и доверенное устройство через HTTP API; сессии персон `admin | learner | device | anon` — storage state, выбор `test.use({ persona })`. Фикстура `freshStack` поднимает отдельную чистую установку (для пути «setup → …» в FEAT-028).
  - Видеофикстуры: MP4 (H.264 + AAC, 5 с, `testsrc` + `sine`) и HLS (VOD, сегменты fMP4 по 2 с) в `e2e/.output/fixtures/video` (в `.gitignore`), создаются заново, если их нет. Сегменты fMP4, а не `.ts`, чтобы их не подхватывали eslint/tsc.
  - Скриншоты: `__screenshots__/<spec>/<имя>-<mobile|desktop>.png`, порог `maxDiffPixelRatio 0.01`, анимации и каретка отключены. Первая база (`smoke.spec.ts/login-*`) создана в контейнере, повторный прогон `pnpm e2e:docker` — 20 passed.
  - Шаг CI — в FEAT-045 (тот же `e2e/Dockerfile` или `pnpm e2e:docker`).
  - Вне перечня Scope (необходимо): `e2e/{package.json,tsconfig.json,Dockerfile,docker.mjs}`, корневой `package.json` (скрипты `e2e`, `e2e:docker`, `e2e:update`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore` (`/e2e/.output/`), `eslint.config.mjs` (игнор `e2e/.output/**`).
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: Critique 1 MED#20.
- **Rule**: CLAUDE.md 14
- **Scope**:
  - `e2e/{playwright.config.ts,fixtures/*,global-setup.ts}`, `e2e/smoke.spec.ts`, CI-шаг в FEAT-045
- **Depends on**: FEAT-024, FEAT-002
- **DoD**:
  - `pnpm e2e` поднимает API и web на временном `DATA_DIR`, создаёт админа, ученика и доверенное устройство через фикстуры. Смоук проходит в Chromium на 390×844 и 1440×900.
  - Скриншот-базы хранятся в `e2e/__screenshots__` и создаются только в Linux-контейнере `mcr.microsoft.com/playwright` (`pnpm e2e:update` запускает его через docker), как в CI. Отличие больше порога валит тест.
  - Видеофикстуры (HLS и MP4, 5 с) генерируются в `global-setup` через `ffmpeg -f lavfi -i testsrc`; в git их нет.

### FEAT-025 — Дизайн-система: токены и компоненты
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `tokens.css`: палитра тёмной темы оригинала (`--q-page/surface/raised/input/border/text/muted/blue/selected/focus`), тёплый акцент `--q-accent #f4c65f` (+ hover/shadow/ink), жёлтая «Начать» (`--q-cta-*`), игровые цвета (монеты, XP, «живой»), статусы, шрифты (Arial; заголовки — Arial Black), шкала размеров, отступы 4 px, радиусы, тени, длительности, слои. Глобальная база — `base.css`, вход — `@questclass/ui/styles.css` (подключён в `main.tsx`).
  - Компоненты (`packages/ui/src/components`, по файлу на компонент или группу): Button/IconButton (+`buttonClassName` для ссылок), Card, ItemCard, Modal/Sheet/Drawer (портал, фокус-ловушка, Escape, возврат фокуса, блок прокрутки), Tabs, SegmentedControl, ProgressBar, ProgressRing, StatChip, Badge, Avatar, StepList, EmptyState, Toast (+`ToastProvider`/`useToast`), Tooltip, Placeholder, Field (+TextInput, Textarea, Select, DateTimeInput), Switch, Checkbox, NumberInput, Slider, FileInput, Accordion, DataTable, PinPad (экранные кнопки + физическая клавиатура), Spinner, QuestionCard, OptionTile. Дополнительно (чтобы экранам и галерее не нужен был свой CSS): Stack/Inline/Grid/Container, Heading/Text/VisuallyHidden, Skeleton; набор иконок lucide-react (`icons.ts`, версия 1.63.0 закреплена) — экраны берут иконки только из дизайн-системы.
  - Классы — kebab-case (`qc-btn-primary`): `selector-class-pattern` из stylelint-config-standard не пропускает BEM-разделители; варианты — через `data-*`.
  - Галерея `/dev/ui` (`UiGallery`, ленивый чанк ~65 КБ): каждый компонент в состояниях «обычное», «недоступно», «загрузка», «пусто», «ошибка»; где состояние неприменимо, вместо него строка «Не применимо: причина». `docs/PLACEHOLDERS.md`: описание компонента и типов `kind`.
  - Тесты: 54 testing-library теста в `packages/ui/test` (роли, имена, описания, фокус, клавиатура); e2e `ui-gallery.spec.ts` — все секции и 5 состояний, нет горизонтальной прокрутки на 390 и 1440, скриншоты каждой секции и открытого окна (76 баз из Linux-контейнера, повторный прогон в контейнере — 26 passed). База `smoke/login-*` перегенерирована (тёмная тема).
  - Исправление FEAT-053: ffmpeg писал init-сегмент HLS (`init.mp4`) в текущую папку, а не рядом с плейлистом; шаг HLS теперь запускается в папке фикстуры с относительными именами, смоук проверяет `init.mp4` и сегменты, в `.gitignore` добавлены `*.mp4` и `*.m4s`.
  - Вне перечня Scope (необходимо): `packages/ui/{package.json,tsconfig.json,vitest.config.ts,test/setup.ts}`, `packages/ui/src/{index.ts,icons.ts,styles.css,base.css,env.d.ts,internal/*}`, `apps/web/src/main.tsx` (глобальные стили), `apps/web/src/app/router.tsx` (ленивый маршрут галереи), `e2e/ui-gallery.spec.ts`, `e2e/fixtures/test.ts` (скриншот элемента), `e2e/fixtures/video.ts`, `e2e/smoke.spec.ts`, `.gitignore`, `e2e/__screenshots__/**`, `pnpm-lock.yaml`.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §3 пп. 1–5; Critique 1 MED#10.
- **Rule**: CLAUDE.md 8, 9
- **Scope**:
  - `packages/ui/src/tokens.css` (по `QuestClass-Source/app/focus-theme.css`)
  - `packages/ui/src/components/*`: Button, IconButton, Card, ItemCard, Modal, Sheet, Drawer, Tabs, SegmentedControl, ProgressBar, ProgressRing, StatChip, Badge, Avatar, StepList, EmptyState, Toast, Tooltip, Placeholder, Field, Select, Switch, Checkbox, NumberInput, Slider, Textarea, DateTimeInput, FileInput, Accordion, DataTable, PinPad, Spinner, QuestionCard, OptionTile
  - `apps/web/src/screens/dev/UiGallery.tsx`, `docs/PLACEHOLDERS.md`, `packages/ui/test/*.test.tsx`
- **Depends on**: FEAT-024, FEAT-053
- **DoD**:
  - Каждый компонент в `/dev/ui` в состояниях default, disabled, loading, empty, error. stylelint (FEAT-001) зелёный.
  - Тесты testing-library: роли, подписи, фокус. e2e-скриншоты галереи на 390 и 1440 без горизонтальной прокрутки (FEAT-053).

### FEAT-035 — Анимации героев: менеджер и AnimatedHero
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `AnimatedHero` (ui) — только отображение: постер (картинка или ячейка спрайта), анимированный WebP поверх него появляется лишь после `load` (до этого виден постер, на кнопке индикатор), CSS-движения `bounce | float | pendulum | sway` для героев без WebP (Март, Фея, Cadence, Сик — как в оригинале), кнопка «Оживить героя / Остановить героя» (`aria-pressed`), «Движение выключено» (disabled), сообщение при ошибке загрузки. Остановленный герой — без анимированного `<img>` в DOM.
  - `AnimationManager` (web): одна активная анимация на всё приложение; режимы `autoplay` (на экране — двигается, при возврате на экран/вкладку продолжает), `autoplay-3s` (сам один раз, 3 с считаются от загрузки анимации), `on-demand` (только по кнопке); скрытая вкладка и уход с экрана (IntersectionObserver) останавливают; `prefers-reduced-motion` отключает автозапуск и останавливает автозапущенное, нажатие работает всегда. Часы внедряются (тесты на фейковых таймерах). `AnimationProvider` подключён в `Providers` приложения; хук `useHeroAnimation(ref, mode)` и обёртка `LiveHero` для экранов (FEAT-029/033/034).
  - Галерея: секция AnimatedHero в 5 состояниях и «Живые герои и экшен-анимации» — 11 живых героев и 9 экшенов (`screens/dev/liveHeroes.ts`: список как `builtinAnimations`/`actionAnimations` оригинала, пути, кадры и длительность берутся из манифеста; неизвестный ключ — ошибка). Реальный каталог с ценами — FEAT-017.
  - Тесты: 15 в `apps/web/test/animation.test.tsx` (менеджер на фейковых таймерах + LiveHero с замоканным IntersectionObserver), 5 в `packages/ui/test/animated-hero.test.tsx`; e2e — каждый из 20 героев запускается по кнопке и двигается, одновременно двигается один; базы двух новых секций из Linux-контейнера (повторный прогон — 28 passed).
  - Вне перечня Scope (необходимо): `apps/web/src/features/animation/LiveHero.tsx`, `apps/web/src/app/providers.tsx`, `apps/web/src/screens/dev/{UiGallery.tsx,liveHeroes.ts}`, `packages/ui/src/index.ts`, `packages/ui/test/animated-hero.test.tsx`, `packages/shared/package.json` (экспорт `./assets/manifest.json`), `e2e/ui-gallery.spec.ts`, `e2e/__screenshots__/**`.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.8 «одна анимация одновременно; надетый живой — на «Герое» и 3 с на главной; в магазине по кнопке; вне экрана стоит; reduced-motion отключает автозапуск; 9 экшен-анимаций»; Critique 1 MED#13, LOW.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `packages/ui/src/components/AnimatedHero/*`, `apps/web/src/features/animation/{AnimationManager.ts,useVisibility.ts}`, `apps/web/test/animation.test.tsx`
- **Depends on**: FEAT-025, FEAT-026
- **DoD**:
  - Менеджер:
    - одна активная анимация;
    - стоп на скрытой вкладке и вне экрана;
    - постер до старта;
    - режимы `autoplay`, `autoplay-3s`, `on-demand`;
    - `prefers-reduced-motion` отключает автозапуск.

    Покрыт тестами на фейковых таймерах.
  - В галерее проигрываются все живые герои и 9 экшен-анимаций из манифеста.

### FEAT-038 — Празднования и звуки интерфейса
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `Celebration` (ui) — оверлей-диалог (фокус внутри, Escape, возврат фокуса), варианты `pass` (кубок, «+XP», «+монет», полёт жетонов), `purchase` («Куплено!», «Потрачено N монет, осталось M»), `streak` (ролик — анимированный WebP серии длиной из манифеста, саундтрек с «Включить/Выключить звук» на случай блокировки автозвука, «К наградам», затем счётчики идут от «итог − награда» до подтверждённых итогов с полётом монет и XP, «Отлично!»; если ролик не загрузился — сразу награды и пометка). Компонент только показывает то, что уже начислил сервер; `onReward` — момент для звука «complete».
  - Один раз на бонус и устройство: маркер `quest-streak-celebration-v1:<ученик>:<бонус>` в localStorage (`streakCelebrationKey`, `wasStreakCelebrated`, `markStreakCelebrated`), пишется при показе. `preview` ничего не пишет и говорит об этом («ПРЕДПРОСМОТР», «Предпросмотр: ничего не начислено», «Закрыть предпросмотр»). `prefers-reduced-motion` (или проп `reducedMotion`) — статичная версия: без ролика, звука и полёта, сразу итоговые числа и постер.
  - `SoundManager` (web): 4 звука с приоритетами packet 1 / element 2 / level 3 / complete 4; играет один, менее важный не прерывает более важный (в том числе пока тот грузится); загрузка дольше 900 мс — звук пропускается; громкость 55% и «включено» по умолчанию; на скрытой вкладке тишина; формат OGG, на iOS/iPadOS (и где нет OGG) — MP3. Web Audio внедряется (в тестах — фейк). `SoundProvider`/`useSound`: настройки на устройстве (`quest-interface-sounds`, как в оригинале), прайм по первому касанию или клавише; подключён в `Providers`.
  - Галерея: секции Celebration (все варианты в предпросмотре, статичная серия, сломанный ролик) и «Звуки интерфейса» (переключатель, громкость, проигрывание всех 4 звуков).
  - Тесты: 9 в `sound.test.tsx`, 12 в `celebration.test.tsx`; e2e — диалоги праздников открываются, серия проходит от ролика к наградам, скриншоты зачёта и статичной серии (Linux-контейнер, повторный прогон — 30 passed).
  - Вне перечня Scope (необходимо): `packages/ui/src/{index.ts,internal/useReducedMotion.ts}`, `apps/web/src/app/providers.tsx`, `apps/web/src/screens/dev/UiGallery.tsx`, `e2e/ui-gallery.spec.ts`, `e2e/__screenshots__/**`.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: spec/02 §2.15; spec/01 «празднование серии: ролик, полёт монет и XP, один раз на бонус и устройство, reduced-motion, предпросмотр»; Critique 1 MED#13, LOW.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `packages/ui/src/components/Celebration/*`, `apps/web/src/features/sound/{SoundManager.ts,useSound.ts}`, `apps/web/test/{celebration,sound}.test.tsx`
- **Depends on**: FEAT-025, FEAT-026
- **DoD**:
  - Варианты Celebration: зачёт, покупка, серия (ролик, полёт монет и XP). Показ серии — один раз на бонус и устройство. Reduced-motion — статичная версия. Режим «предпросмотр» не трогает данные (тесты).
  - Звуки: 4 приоритета, по одному. Отмена, если загрузка дольше 900 мс. Громкость 55% по умолчанию. OGG, на iOS — MP3 (тест менеджера).

### FEAT-027 — Шаблоны экранов
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Шаблоны (`apps/web/src/templates`) — только данные и слоты, весь вид в `packages/ui`. Для этого в дизайн-систему добавлены: `AppFrame`, `TopBar`, `Brand`, `BottomNav`, `SideNav` (+`NavItem`), `Menu` (меню профиля: стрелки, Home/End, Escape, клик мимо, возврат фокуса), `PlayerFrame`, `ButtonLink`, `UiLink`/`UiLinkProvider` (компоненты дизайн-системы ссылаются через роутер приложения), `StatChip href`. Значок lucide `Menu` переэкспортирован как `MenuIcon` (имя `Menu` — у компонента).
  - `LearnerShell`: бренд, меню профиля («Сменить ученика», «Родителям»), «Награды» (`/rewards`), строка чисел — уровень, XP, монеты, «Мои желания» (`/wishes`); нижнее меню «Учёба · Герой · Магазин» с `aria-current`. На телефоне кнопки шапки только со значком (подпись остаётся для экранного диктора), как в эталоне 01. Числа приходят пропсом: API кошелька (FEAT-007) ещё нет, поэтому в приложении строка чисел пока скрыта — её подключит FEAT-029.
  - `TaskPlayer` (назад, предмет, заголовок, шаги, прогресс, медиа, панель действий снизу), `Catalog` (фильтр-вкладки, сетка ItemCard, диалог подробностей, пусто/загрузка/ошибка с «Повторить»), `ProgressView` (итоги, слот серии, доп. секции, история DataTable), `AdminShell` + `AdminPage` (разделы сбоку/сверху, меню «Выйти», заголовок страницы, действия).
  - Подключение в приложении (`app/layouts.tsx`): страницы ученика живут в `LearnerShell` («Сменить ученика» → выход и `/login`; «Родителям» → `/login?as=admin` без выхода ученика), админка — в `AdminShell` с реестром разделов `ADMIN_SECTIONS` (каждый админ-экран добавляет строку). `/tasks/:id` — заглушка в `TaskPlayer`. Добавлен маршрут-заглушка `/wishes`. Экраны состояний (загрузка, «Нет доступа», ошибки, 404) переведены на компоненты дизайн-системы.
  - Демо-данные: `/dev/templates/:name` (`learner`, `task`, `catalog`, `progress`, `admin`); в галерее — секции Menu, «Навигация», ссылки на шаблоны.
  - Тесты: 15 в `templates.test.tsx` (шапка, меню профиля с клавиатурой, нижнее меню, раскладки в приложении, «Сменить ученика»/«Родителям», TaskPlayer, Catalog, ProgressView, AdminShell). e2e `templates.spec.ts`: 5 шаблонов на 390 и 1440 без горизонтальной прокрутки и со скриншотами, меню профиля, диалог каталога. Базы из Linux-контейнера, повторный прогон — 44 passed.
  - `pnpm e2e:update` теперь `--update-snapshots=all` (раньше устаревшая, но укладывающаяся в порог база `smoke/login` не обновлялась), `e2e/docker.mjs` распознаёт любой `--update-snapshots…`. Все базы перегенерированы.
  - Вне перечня Scope (необходимо): `packages/ui/src/components/{AppFrame,Link,Menu,PlayerFrame}.*`, `packages/ui/src/components/{Button,StatChip}.*`, `packages/ui/src/{index.ts,icons.ts}`, `apps/web/src/app/{layouts.tsx,router.tsx,providers.tsx,guards.tsx,ErrorBoundary.tsx}`, `apps/web/src/screens/dev/{TemplateDemos.tsx,UiGallery.tsx}`, `e2e/{templates.spec.ts,ui-gallery.spec.ts,docker.mjs}`, `e2e/__screenshots__/**`, корневой `package.json`.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §3 п. 3; Critique 1 LOW («Сменить ученика», «Родителям»).
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/templates/{LearnerShell,TaskPlayer,Catalog,ProgressView,AdminShell}.tsx`, `apps/web/test/templates.test.tsx`
- **Depends on**: FEAT-025, FEAT-053
- **DoD**:
  - LearnerShell:
    - шапка: уровень, XP, монеты, «Мои желания», «Награды»;
    - меню профиля: «Сменить ученика», «Родителям»;
    - нижнее меню «Учёба · Герой · Магазин».
  - TaskPlayer, Catalog, ProgressView, AdminShell — по SPEC §3. Только данные и слоты, свой CSS — только в `packages/ui`.
  - e2e-скриншоты шаблонов на демо-данных (FEAT-053).

### FEAT-028 — Экраны входа и доверенные устройства
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `/setup` (`Setup`): код установки, имя, логин, пароль; проверка полей до отправки (те же правила, что в shared), неверный код — у поля, «первый админ уже создан» — со ссылкой на вход, ошибки 400 раскладываются по полям из `details`. После успеха — `/admin/device` с приветствием. Уход с `/setup`, когда установка уже сделана, теперь решает сам экран (раньше гард `SetupGate` перенаправлял на `/login` и гонялся с переходом после успешной установки).
  - `/login` (`Login` → `LearnerPicker` или `AdminLogin` по `?as=admin`): на недоверенном устройстве — «Попросите родителя включить это устройство» и «Я родитель»; на доверенном — «Кто учится?» (карточки профилей) → `PinEntry` (PinPad, физическая клавиатура, «Неверный PIN», «Другой ученик»); «Учеников пока нет». Вход родителя: «Неверный логин или пароль», после входа — возврат на страницу, с которой отправили на вход, если она этой роли.
  - Троттлинг (429): обратный отсчёт до следующей попытки из `retryAfterSec` («Попробуйте через 3 с», «Подожди 1:15»), кнопка и PinPad заблокированы до конца отсчёта.
  - `/admin/device` (`TrustDevice`, раздел «Устройства» в `ADMIN_SECTIONS`): «Сделать устройство детским» с названием; список детских устройств (это/детское/отозвано) и «Отозвать» с подтверждением.
  - Выход из шапок теперь сначала уводит на `/login`, потом завершает сессию (раньше редирект гарда и переход после выхода гонялись); после выхода родителя на детском устройстве сразу открывается выбор ученика.
  - **Найдена и исправлена ошибка dev-стенда:** прокси Vite в короткой записи (`'/api': url`) ставит `changeOrigin: true`, `Host` переставал совпадать с `Origin`, и проверка «тот же сайт» API (FEAT-002) отклоняла любой POST из браузера («Запрос с другого сайта отклонён»). В `vite.config.ts` и в e2e-стенде прокси теперь с `changeOrigin: false` — как за Caddy.
  - В дизайн-систему добавлены `AuthFrame` (карточка по центру для экранов до входа, режим `embedded` для превью) и `Notice` (сообщение в форме: info/success/warning/danger), оба в галерее; иконки `LogIn`, `TabletSmartphone`.
  - Тесты: 15 в `auth-screens.test.tsx` (setup и проверки, вход родителя с возвратом, неверный пароль, отсчёт 429 на фейковых таймерах, недоверенное устройство, нет учеников, выбор профиля + PIN, неверный PIN, блокировка PinPad, «Сделать устройство детским», отзыв). e2e `auth.spec.ts`: полный путь «setup → сделать устройство детским → вход ученика» на чистой установке (ученик создаётся через API: экран пользователей — FEAT-039), экраны выбора и PIN на доверенном устройстве, неверный пароль; скриншоты setup, входа родителя, выбора и PIN из Linux-контейнера (повторный прогон — 52 passed).
  - Вне перечня Scope (необходимо): `apps/web/src/screens/auth/{Login.tsx,common.tsx}`, `apps/web/src/app/{router.tsx,layouts.tsx,guards.tsx}`, `apps/web/vite.config.ts`, `apps/web/src/screens/dev/UiGallery.tsx`, `packages/ui/src/components/{AuthFrame,Notice}.*`, `packages/ui/src/{index.ts,icons.ts}`, `e2e/{auth.spec.ts,ui-gallery.spec.ts,fixtures/stack.ts}`, `e2e/__screenshots__/**`.
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §7 «Auth»; FEAT-004.
- **Rule**: CLAUDE.md 8, 11
- **Scope**:
  - `apps/web/src/screens/auth/{Setup,AdminLogin,LearnerPicker,PinEntry,TrustDevice}.tsx`, `apps/web/test/auth-screens.test.tsx`
- **Depends on**: FEAT-027, FEAT-053
- **DoD**:
  - `/setup` с полем токена. Вход админа. На недоверенном устройстве — «Попросите родителя включить это устройство». На доверенном — выбор профиля и PinPad.
  - При задержке показывается время до повтора. e2e: полный путь «setup → сделать устройство детским → вход ученика».

### FEAT-029 — Главная ученика («Учёба»)
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Главная (`screens/learner/Home.tsx`): «{Имя}, начнём?» (h1; «Начнём?» для «Игрок»), карточка серии, счётчик «Задания от родителя: X из Y» (ProgressBar, только если есть назначенные), карточка следующего задания по `nextTaskId` из `GET /api/me/progress`, «Выбрать предмет или урок» → окно «Выбери урок». Данные — `GET /api/me/progress`, `/api/tasks`, `/api/subjects`; прогресс, задания, кошелёк и серия перезапрашиваются раз в минуту и при возврате на вкладку (PARITY 01-045).
  - Карточка урока: значок и предмет, название, «Урок от ДД.ММ.ГГГГ» (из `lessonDate`) · «Задание от родителя», герой справа, жёлтая CTA по типу и состоянию («Начать урок / Продолжить урок», «Начать тест / Продолжить тест», «Посмотреть результат»), шаги значками ▶ → ? → 🎁. «Перейти к тесту» (видео уже засчитано) не различается: в `progress` нет данных просмотра, отдельный запрос на главной не делается.
  - Герой: API персонажа ещё нет (FEAT-021/034), поэтому у всех стартовый герой — синий исследователь из манифеста (`game/animated/repaired/blue-idle-cover.webp` + живой `blue-idle.webp`; у `fitting-room/blue-original` другое кадрирование, и при оживлении картинка прыгала бы). `LiveHero` в режиме `autoplay-3s` без кнопки. Заменить на надетого героя — в FEAT-034.
  - Серия: строка «Серия занятий N/5» с точками и подарком раскрывается (состояние на устройстве, `quest-streak-expanded`) в 5 дней, бонус «За 5 дней подряд / Бонус получен!», правило и подсказку; «Предпросмотр награды за серию» — Celebration серии с `preview` (ничего не начисляется). Ошибка загрузки серии карточку просто скрывает.
  - «Выбери урок»: «Мои задания · N / Все уроки» (если есть назначенные), плитки «Все предметы» + предметы, у которых есть задания; строки со статусами «Выполнено», «Начато», «Можно открыть», «После предыдущего урока», «Откроется по очереди предметов»; закрытые не кликаются. Предмет без встроенного значка — `Placeholder` P-003.
  - Пустые состояния: «Скоро новый урок» (нет заданий или следующее закрыто) и «Все уроки пройдены!»; ошибка загрузки — EmptyState с «Повторить».
  - Шапка: уровень, XP, монеты из `GET /api/me/wallet`; «Мои желания» скрыты, пока нет API билетиков (`LearnerStats.wishes` стал необязательным).
  - Дизайн-система: `LessonCard`, `StreakCard`, `ChoiceTile`, `ActionList`/`ActionRow`, у `StepList` вариант `compact` (только значки); иконки `Flame`, `Lock`, `Star`; секции в `/dev/ui`. Классы `qc-streak*` уже заняты праздником серии, поэтому у карточки — `qc-streak-card*`.
  - Сверх Scope (просьба пользователя): фавикон и `apple-touch-icon` (`icons/star-v1-*.png`) в `apps/web/index.html` (раньше 404), проверка в смоуке.
  - e2e: `home.spec.ts` идёт на **второй установке** из global setup (`E2E_LEARNING_BASE_URL`, сессии `learning-*.json`): каждый тест создаёт своего ученика и задания, назначенные только ему (`fixtures/content.ts`: ученик, вход на доверенном устройстве, тест через админ-API, видеоурок через импорт), поэтому параллельные тесты друг друга не видят, а список профилей общей установки (скриншоты входа) не меняется. Скриншоты главной, раскрытой серии и окна выбора на 390/1440 (Linux-контейнер); проверено, что герой оживает сам и останавливается через 3 с. Таймаут старта API в стенде — 45 с (под нагрузкой в контейнере 20 с иногда не хватало). Базы обновлены режимом `--update-snapshots=changed` (16 секций галереи на телефоне сдвинулись на доли пикселя), повторный `pnpm e2e:docker` — 58 passed.
  - Ручная сверка с reference-screens 01, 02, 04 — отметка в PARITY.md.
  - Вне перечня Scope (необходимо): `packages/ui/src/components/{LessonCard,StreakCard,ChoiceTile}.*`, `packages/ui/src/components/StepList.*`, `packages/ui/src/{index.ts,icons.ts}`, `apps/web/src/app/{layouts.tsx,router.tsx}`, `apps/web/src/templates/LearnerShell.tsx`, `apps/web/src/screens/dev/UiGallery.tsx`, `apps/web/index.html`, `apps/web/test/{router,auth-screens,templates}.test.tsx` (заголовок главной), `e2e/{global-setup.ts,smoke.spec.ts,auth.spec.ts,ui-gallery.spec.ts}`, `e2e/fixtures/{content,learning,paths,stack}.ts`, `e2e/__screenshots__/**`, `docs/PARITY.md`. Тестов 642 (+1 пропущен), было 628.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/01 «главная»; reference-screens 01, 02, 04.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/learner/Home.tsx`, `apps/web/src/features/{tasks,streak,wallet}/*`, `apps/web/test/home.test.tsx`, `e2e/home.spec.ts`
- **Depends on**: FEAT-028, FEAT-009, FEAT-015, FEAT-021, FEAT-035, FEAT-053
- **DoD**:
  - Счётчик «Задания от родителя: X из Y», если есть назначенные (решение 14.11.2026).
  - Карточка следующего задания: предмет, название, герой (живой 3 с), «Начать», шаги. «Серия занятий» N/5 раскрывается. Выбор предмета или задания. Пустые состояния (тесты).
  - e2e-скриншоты 390 и 1440. В PR — ручная сверка с reference-screens 01, 02, 04 (отметка в PARITY.md).

### FEAT-030 — Прохождение теста
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `/tasks/:id` (`screens/learner/TaskScreen.tsx`) грузит `GET /api/tasks/:id`, предметы и строку прогресса и рендерит Player типа через реестр; неизвестное или невидимое задание — «Задание не найдено». Пропсы Player приведены к общим контрактам: `{task: LearnerTaskDto, subject: SubjectDto | null, progress: TaskProgressDto | null}`; `Editor` в реестре стал необязательным (редакторы — FEAT-040), без него — «Настройки этого типа задания пока меняются только импортом». В реестре — `quiz`.
  - Player `quiz`: вступление (описание, «Каждый ответ сохраняется сразу», «Награда за пройденный тест +XP · +монет») и «Начать тест / Продолжить тест»; попытка создаётся только по нажатию (запись не идёт по переходу на страницу). Пройденный тест открывается итогом «Тест пройден!» с баллом из прогресса, без запросов на запись: у ученика нет API прошлых попыток, поэтому разбор старой попытки не показывается.
  - Общий поток попытки `features/attempts/AttemptFlow.tsx` (им же пользуется видеоурок): старт или продолжение открытой попытки с первого неотвеченного вопроса; выбор варианта можно менять до «Ответить», ответ сохраняется сразу `PUT …/answers/:questionId` и больше не меняется (409 из другой вкладки → перечитать попытку); после последнего — `POST …/completion` (и при продолжении попытки, где всё уже отвечено). Отказы старта: `already_passed`, `retry_needed` (экран «Новую попытку откроет родитель» с «Попросить пересдачу» или «Просьба отправлена. Ждём родителя.» по `details.requestOpen`), прочие 409 (вопросы готовятся, видео не досмотрено) — сообщением.
  - Результат (`task-types/quiz/Result.tsx`): «Миссия выполнена!» (все верно) / «Тест пройден!» / «Попробуем ещё раз», «Верных ответов: X из N.», выплаченная награда или «Награда за этот тест уже получена.», бонус серии, «Давай разберём» (твой ответ и верный, картинки вопросов и вариантов — `/api/media/…`), «Пересдать» (`retry.canRetry`), «Попросить пересдачу» (`canRequest`) → «Просьба отправлена…», «К урокам». Зачёт празднует `Celebration` `pass` со звуком «complete»; после завершения кошелёк, серия, прогресс и задания перезапрашиваются.
  - «Послушать вопрос»: `speechSynthesis` с русским голосом (локальный в приоритете), читает «Вопрос i из N. Текст. Вариант А: …»; во время чтения — «Остановить»; без русского голоса кнопки нет; чтение останавливается при смене вопроса и уходе с экрана.
  - Дизайн-система: `ResultSummary`, `RewardLine`, `AnswerReview` (+ секции «result» и «review» в `/dev/ui`, добавлены в конец галереи: вставка в середину сдвигает все секции ниже и меняет их базы); иконки `RotateCcw`, `Send`.
  - Тесты: 10 в `quiz-player.test.tsx` (зачёт с праздником и сохранением ответов по одному, провал → «Пересдать», исчерпанные пересдачи → просьба, отказ `retry_needed`, продолжение попытки, пройденный тест, «Задание не найдено», озвучка с моком `speechSynthesis` и скрытие без русского голоса, выбор голоса), реестр типов. e2e `quiz.spec.ts`: зачёт (праздник, монеты в шапке, «Все уроки пройдены!», повторное открытие — итог), провал → бесплатная пересдача → зачёт, исчерпанные пересдачи → просьба → отказ старта → разрешение админа → зачёт; скриншоты вступления и итога (порядок вопросов и вариантов случайный, поэтому вопросы не снимаются). Базы из Linux-контейнера, повторный `pnpm e2e:docker` — 64 passed.
  - Вне перечня Scope (необходимо): `apps/web/src/screens/learner/TaskScreen.tsx`, `apps/web/src/task-types/registry.ts`, `apps/web/src/app/router.tsx`, `packages/ui/src/components/Result.*`, `packages/ui/src/{index.ts,icons.ts}`, `apps/web/src/screens/dev/UiGallery.tsx`, `apps/web/test/{task-types,router}.test.tsx`, `e2e/ui-gallery.spec.ts`, `e2e/__screenshots__/**`. Тестов 653 (+1 пропущен), было 642.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/01 «квиз»; Clarification «порог и пересдачи»; Critique 1 MED#3, MED#13.
- **Rule**: CLAUDE.md 8, 10
- **Scope**:
  - `apps/web/src/task-types/quiz/{Player.tsx,Result.tsx}`, `apps/web/src/features/attempts/*`, `apps/web/test/quiz-player.test.tsx`, `e2e/quiz.spec.ts`
- **Depends on**: FEAT-027, FEAT-010, FEAT-038, FEAT-053
- **DoD**:
  - «Послушать вопрос»: браузерный `speechSynthesis` ru-RU читает вопрос и варианты. Если русского голоса нет, кнопка скрыта (тест с моком). Решение 14.11.2026; «Читать автоматически» — этап 2.
  - QuestionCard и OptionTile с картинками. Ответ фиксируется сразу. Результат по каждому вопросу и награда (Celebration). «Пересдать», если разрешено, иначе «Попросить пересдачу» (`retry_request`).
  - e2e: зачёт, провал с автопересдачей, исчерпанные пересдачи.

### FEAT-031 — Видеоплеер урока
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - `MediaPlayer` (ui): свои контролы — «↺ 10 сек · ▶ Смотреть / ❚❚ Пауза · ↻ 10 сек», перемотка (range с «м:сс из м:сс»), «Звук» и громкость, «Скрыть низ / Открыть низ», «На весь экран / Свернуть»; «Подключаем видео…», ошибка «Видео не загрузилось…» с «Загрузить видео заново» (новый `<video>`, место сохраняется); на скрытой вкладке видео встаёт на паузу (PARITY 01-052); продолжение с `startAt`. Чёрная полоса — слой поверх видео (4–40 %, `role=slider`: ↑/→ +1, ↓/← −1, Home/End, перетаскивание ручки), кнопка 👁 на полосе её открывает. На весь экран уходит **весь плеер** (видео, полоса и контролы — иначе в полноэкранном режиме нечем управлять); на iPhone есть только полноэкранный режим самого `<video>`, без полосы — под контролами подсказка «На iPhone видео на весь экран открывается без чёрной полосы». Новый токен `--q-shutter` (чёрный).
  - Источник (`MediaPlayer/attach.ts`): MP4 — напрямую (`<video src>`, Range отдаёт API); HLS — hls.js (1.7.4, отдельный чанк по требованию, ~500 КБ не попадают в основной бандл) с повторами сегментов (`fragLoadPolicy`: таймаут 4, ошибка 6 повторов, задержка 1–8 с) и восстановлением после фатальных ошибок (`startLoad` / `recoverMediaError`, до 3 раз); Safari (`navigator.vendor` Apple + `canPlayType`) играет HLS нативно; нативный HLS и как запасной путь, если MSE нет. Chrome тоже отвечает `canPlayType(m3u8) = maybe`, поэтому только `canPlayType` для выбора не годится.
  - Учёт просмотра (`useWatchTracking.ts`): класс `WatchTracker` без DOM + хук на `<video>`. Непрерывно воспроизведённые отрезки по `playing`/`timeupdate` (скачок > 1,5 с — перемотка, отрезок рвётся; `pause`, `seeking`, `waiting`, `ended` закрывают отрезок); пачки раз в 20 с во время воспроизведения, на паузе и в конце (с позицией для продолжения), на `pagehide` и скрытии вкладки — `sendBeacon` (иначе `fetch keepalive`). Очередь: сеть/5xx — отрезки остаются, повтор через 2, 4, 8… ≤ 20 с; 404/409/410 (видео открыто в другом окне, заменено, удалено) — учёт останавливается с сообщением сервера; прочие 4xx — пачка отбрасывается. Пачки не пересекаются. Место для продолжения запоминается, пока у `<video>` есть данные (`readyState > 0`): при уходе к вопросам плеер сбрасывает элемент в 0, и последняя пачка иначе затёрла бы `last_position` нулём (нашлось на демо-данных); фрагмент-подсказка позицию не отправляет вовсе.
  - Player `video_lesson`: сессия `POST /api/watch/:taskId/sessions` при открытии (одна на экран), «Продолжаем с места остановки: м:сс», «Просмотрено N% · Нужно M%» (ProgressBar) и «Посмотри M% видео — вопросы откроются», «✓ Место остановки сохранено», режимы `none` («Можно переходить к вопросам…») и `manual` («Просмотр подтверждает родитель»); «Перейти к вопросам» доступна по `satisfied` сервера (или если видео недоступно — тогда решает старт попытки); блок «Награда за пройденный тест» / «Урок пройден. Награда уже получена.». Полоса — по `config.shutter` (выключена родителем — нет ни полосы, ни кнопки), высота и вкл/выкл — на устройстве по видео (`quest-video-shutter:<mediaId>`). Вопросы — тот же `AttemptFlow`, что у теста; «Повторить видео» после провала возвращает к видео.
  - Подсказка (`HelpClip.tsx`, решение 14.11.2026 — только после ответа): на экране результата у вопроса с `evidence` — «Посмотреть объяснение» → окно «Помощь к вопросу» («Объяснение начнётся с м:сс»), фрагмент с `start − 3` до `end` по времени медиа (взводится, только когда позиция рядом со стартом), по окончании окно закрывается само; отрезки уходят с `kind: help` и не засчитываются.
  - Тесты: 14 в `video-player.test.tsx` (трекер: склейка и разрыв на перемотке, периодический срез, повтор с ростом задержки, остановка на 409, `help` и beacon; хук на `<video>`: пачка на паузе, раз в 20 с, beacon на `pagehide`, уход с видео не обнуляет место, подсказка без позиции; Player: сессия, продолжение, гейт кнопки, режим `none`, полоса на устройстве, «открыто в другом окне», подсказка и «Повторить видео»), 7 в `packages/ui/test/media-player.test.tsx`. e2e `video.spec.ts`: HLS под «Slow 4G» (CDP) — воспроизведение идёт, процент дорастает до порога, «Перейти к вопросам» открывается, подсказка играет и закрывается сама, после перезагрузки урок продолжается с конца видео (0:05); MP4 — играет, место сохраняется и восстанавливается после перезагрузки, полоса по клавиатуре и внутри полноэкранного режима. Скриншот экрана урока с закрашенным кадром видео (в галерее секция плеера без скриншота: кадр зависит от того, как быстро отвалится несуществующий файл). Базы из Linux-контейнера, повторный `pnpm e2e:docker` — 68 passed.
  - Ручная сверка с reference-screens 18 — отметка в PARITY.md.
  - Вне перечня Scope (необходимо): `packages/ui/src/components/MediaPlayer/attach.ts`, `packages/ui/{package.json,src/index.ts,src/tokens.css}`, `pnpm-lock.yaml` (hls.js), `apps/web/src/task-types/registry.ts`, `apps/web/src/screens/dev/UiGallery.tsx`, `packages/ui/test/media-player.test.tsx`, `e2e/{ui-gallery.spec.ts,fixtures/test.ts}` (маска в скриншоте), `e2e/__screenshots__/**`, `docs/PARITY.md`. Тестов 674 (+1 пропущен), было 653.
- **Risk**: HIGH
- **Requires decision**: N
- **Spec reference**: SPEC §4; spec/01 «плеер, ±10 с, прогресс, «Перейти к вопросам», полоса над субтитрами»; Critique 1 MED#5, MED#13, LOW (iOS fullscreen).
- **Rule**: CLAUDE.md 8, 10
- **Scope**:
  - `apps/web/src/task-types/video_lesson/{Player.tsx,useWatchTracking.ts,controls/*,HelpClip.tsx}`, `apps/web/src/task-types/quiz/Result.tsx` и `apps/web/src/features/attempts/*` (кнопка подсказки), `packages/ui/src/components/MediaPlayer/*`, `apps/web/test/video-player.test.tsx`, `e2e/video.spec.ts`
- **Depends on**: FEAT-030, FEAT-013, FEAT-050, FEAT-053
- **DoD**:
  - Контролы: play/pause, ±10 с, прогресс, громкость, полноэкранный режим, продолжение с `last_position`.
  - Трекинг: сессия просмотра; пачки раз в 20 с, на паузе и на `pagehide` (`sendBeacon`); очередь с повтором при сбоях сети (тест хука).
  - hls.js с ретраями; Safari — нативный HLS; MP4 — запасной вариант. «Перейти к вопросам» неактивна до порога.
  - Подсказка из результата теста открывает фрагмент `start..end` в режиме `help` (не зачитывается).
  - Полоса над субтитрами работает в полноэкранном режиме обёртки. На iPhone в нативном fullscreen её нет — документировано в UI-подсказке.
  - e2e с HLS-фикстурой и троттлингом «Slow 4G»: воспроизведение идёт, процент растёт, кнопка вопросов открывается.

### FEAT-032 — Дело (`chore`) у ученика
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: SPEC §8 «chore».
- **Rule**: CLAUDE.md 8, 10
- **Scope**:
  - `apps/web/src/task-types/chore/Player.tsx`, `apps/web/test/chore-player.test.tsx`
- **Depends on**: FEAT-027, FEAT-014, FEAT-038
- **DoD**:
  - «Я сделал» → «Ждёт проверки» → «Засчитано» (Celebration) или «Не засчитано: комментарий». Повторяемые — по периоду (тест).

### FEAT-033 — Магазин и «Мои желания»
- **Status**: pending
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.5–2.6; reference-screens 06, 10, 13.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/learner/{Shop.tsx,Wishes.tsx}`, `apps/web/src/features/shop/*`, `apps/web/test/shop.test.tsx`, `e2e/shop.spec.ts`
- **Depends on**: FEAT-027, FEAT-019, FEAT-020, FEAT-035, FEAT-038, FEAT-053
- **DoD**:
  - Фильтры и подфильтры, карточки (живые — по кнопке «плей»), «Ещё N монет», подтверждение «Потратишь N, останется M», тосты. После покупки билета открываются «Мои желания»: «Хочу использовать», история.
  - e2e-покупка героя, комнаты и билета. Ручная сверка с reference 06, 10, 13 в PARITY.md.

### FEAT-034 — Герой: примерочная
- **Status**: pending
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.8.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `packages/ui/src/hero/{Scene.tsx,Ribbon.tsx,DressEffect.tsx}` (визуал — в дизайн-системе), `apps/web/src/screens/learner/Hero.tsx`, `apps/web/src/features/character/{useCharacter.ts,HeroSettings.tsx}`, `apps/web/test/hero.test.tsx`, `e2e/hero.spec.ts`
- **Depends on**: FEAT-027, FEAT-021, FEAT-035, FEAT-053
- **DoD**:
  - Сцена 3:2 cover; позиция героя по `footAnchor` и `footOffset`; nearest-neighbor.
  - Лента «Обычные / Живые / Комнаты», один тап — надеть. Эффект 260/380 мс; при ошибке остаётся старый герой; reduced-motion.
  - Настройки героя хранятся на устройстве (тесты). e2e: надеть героя и комнату.

### FEAT-036 — Живые комнаты: ambient, «Ночной отель», Astro, Rebound
- **Status**: pending
- **Risk**: HIGH
- **Requires decision**: N
- **Spec reference**: spec/02 §2.8; Critique 1 MED#12.
- **Rule**: CLAUDE.md 6, 8
- **Scope**:
  - `packages/ui/src/scenes/{Static,Ambient,NightHotel,Astro,Rebound}.tsx`, `packages/ui/src/scenes/{eventScheduler.ts,roomAudio.ts}`, `packages/ui/src/hero/Scene.tsx` (выбор сцены по `room.scene`), `packages/ui/test/scenes.test.tsx`, `e2e/rooms.spec.ts`
- **Depends on**: FEAT-034, FEAT-053
- **DoD**:
  - Компонент выбирается по `room.scene`, а не по id.
  - Планировщик событий «Ночного отеля» покрыт unit-тестами на фейковых таймерах: интервалы в заданных пределах, пауза касания 8 с, звук только после жеста, стоп на скрытой вкладке.
  - e2e: каждая комната каждого типа сцены открывается без ошибок в консоли; reduced-motion отключает движение (проверка классов).
  - Поведение сверено по `QuestClass-Source/app/{ambient-room,night-hotel-room,astro-room-audio,rebound-room}.tsx` (отметка в PARITY.md).

### FEAT-037 — Награды и прогресс ученика
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: reference-screens 05, 07, 09; SPEC §3 «ProgressView».
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/learner/{Rewards.tsx,Progress.tsx}`, `apps/web/test/rewards-screen.test.tsx`
- **Depends on**: FEAT-027, FEAT-016, FEAT-020, FEAT-015, FEAT-053
- **DoD**:
  - «Мои награды»: вкладки «От родителя» и «Билетики» (ачивки — этап 2). Подробности опыта. ProgressView: пройденное, серия, история начислений (тесты + e2e-скриншот).

### Фаза D — админка

### FEAT-039 — Админка: пользователи, устройства, настройки, ключи, токены
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Разделы кабинета «Пользователи» (`/admin/users`) и «Настройки» (`/admin/settings`, вкладки «Настройки · Ключи API · Импорт уроков» — `/admin/settings/secrets`, `/admin/settings/import-tokens`). Экраны кабинета грузятся по требованию (`lazy`), в основной бандл ученика не попадают. Уведомления кабинета — `ToastProvider` в `AdminLayout`.
  - Настройки: форма строится только из реестра. Тип поля выводится из zod-схемы (`packages/shared/src/settings/form.ts`: целое — `NumberInput` с диапазоном, дробное, переключатель, выбор, список «по одному на строке», текст); подписи вариантов выбора — из `.meta({ optionLabels })` схемы (добавлено у `progress.unlockMode`). Подсказка поля: описание из реестра, «Можно от … до …», «По умолчанию: …». Перед отправкой каждое изменённое значение проверяется схемой реестра (ошибка — у поля), уходят только изменённые ключи, отказ сервера показывается с деталями.
  - Ключи API: «Задан / Не задан» и дата изменения, ввод заново (поле-пароль), удаление с подтверждением; значение никогда не показывается. В реестре MVP ключей нет — экран говорит «Ключей пока нет».
  - Токены импорта: выпуск показывает токен один раз (окно без закрытия по клику мимо) вместе с готовым `~/.questclass/lesson-prep.json` (`server` = адрес кабинета), кнопки «Скопировать»; список, отзыв с подтверждением.
  - Пользователи: таблица (свои отмечены «(вы)», отключённые — по переключателю), добавление ученика (PIN) или взрослого (логин, пароль) с проверкой общими zod-схемами, правка (имя, новый PIN / логин и новый пароль — пустое поле не меняет), «Может входить» = отключение и возврат. Себе админ не меняет пароль здесь («Свой пароль меняется в разделе «Профиль»», FEAT-056) и не отключает себя (иначе сам себя разлогинит).
  - Устройства: экран FEAT-028 (`/admin/device`, `screens/auth/TrustDevice.tsx`) уже закрывает DoD («Сделать устройство детским», список, отзыв) — отдельный `screens/admin/Devices.tsx` не создавался, адрес и тесты FEAT-028 не менялись.
  - Исправлено в дизайн-системе: `.qc-table-wrap` получил `position: relative` — скрытый текст заголовка колонки «Действия» (абсолютно позиционированный) вылезал за прокручиваемую таблицу и давал горизонтальную прокрутку страницы на 390 px.
  - Тесты: 12 в `apps/web/test/admin-settings.test.tsx` (все ключи реестра на форме, нужные контролы и подписи, отправка только изменённых, ошибка схемы у поля без запроса, отказ сервера; секреты без значений, ввод и удаление, пустой реестр; токен один раз и файл настроек, отзыв; пользователи — список и отключённые, ученик с PIN и проверка полей, взрослый и занятый логин, PATCH только изменённого и отключение, себя не отключить). e2e `admin-settings.spec.ts` на отдельной установке на тест (новая фикстура `e2e/fixtures/admin.ts`: свежий стек + вошедший админ): пользователь — добавить, переименовать, отключить; настройки — скриншот формы, сохранение и значение после перезагрузки; токен — работает в API импорта, после отзыва 401. Базы скриншотов — из Linux-контейнера (`pnpm e2e:docker admin-settings.spec.ts --update-snapshots=changed`, 6 passed).
  - Вне перечня Scope (необходимо): `apps/web/src/features/{admin/forms.ts,users/queries.ts,settings/*,imports/queries.ts}`, `apps/web/src/screens/admin/Users.tsx`, `apps/web/src/app/{router.tsx,layouts.tsx}` (строки маршрутов и разделов, `ToastProvider`), `packages/shared/src/settings/{form.ts,keys/progress.ts}`, `packages/ui/src/{icons.ts,components/DataTable.css}`, `e2e/{admin-settings.spec.ts,fixtures/admin.ts,__screenshots__/admin-settings.spec.ts/*}`. Тестов 785 (+2 пропущено), было 773.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §1 «Конфигурация»; FEAT-004, FEAT-012, FEAT-052.
- **Rule**: CLAUDE.md 6, 7, 8
- **Scope**:
  - `apps/web/src/screens/admin/{Users.tsx,Devices.tsx,Settings.tsx,Secrets.tsx,ImportTokens.tsx}`, `apps/web/test/admin-settings.test.tsx`
- **Depends on**: FEAT-027, FEAT-052, FEAT-012, FEAT-053
- **DoD**:
  - Форма настроек строится из реестра. Секреты: «задан / не задан» и ввод заново. Токен импорта показывается один раз. Доверенные устройства: сделать это устройство детским, список, отзыв. Пользователи: CRUD (тесты + e2e).

### FEAT-040 — Админка: предметы, задания, вопросы
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Разделы «Задания» (`/admin/tasks`, `/admin/tasks/:id`, ревизии `/admin/tasks/revisions[/:id]`) и «Предметы» (`/admin/subjects`).
  - Список заданий: фильтры предмета, статуса и типа уходят в `GET /api/admin/tasks`, поиск по названию — на месте; колонки тип, предмет, статус, «Кому» (имена назначенных или «Всем по порядку»), дата урока; плашка «Импорт предлагает изменения опубликованных уроков: N» со ссылкой на ревизии. «Новое задание»: тип из контрактов `@questclass/shared` (Тест, Видеоурок, Дело), название, предмет → черновик и переход на его страницу.
  - Страница задания: «Публикация» (Опубликовать / Снять с публикации / В архив / Вернуть в черновики / Удалить черновик; 422 `cannot_publish` показывается списком причин, 409 `has_history` — «можно только в архив»), «Основное» (название, описание, предмет, XP и монеты 0–1000, «Открыть не раньше» — дата и время, дата урока, порядок; уходят только изменённые поля после проверки `taskUpdateSchema`), «Настройки: <тип>» — Editor типа через реестр, проверка `configSchema` контракта перед сохранением, «Кому назначено» — флажки учеников (POST/DELETE назначения сразу), затем собственные разделы типа.
  - Плагины (правило 10): в реестре web добавлен второй список — админская половина типа `TaskTypeAdmin { type, Editor?, Sections? }` (`TASK_EDITORS`), отдельно от Player-ов: так Editor дела работает до того, как появится его Player (FEAT-032 у соседней ветки — при слиянии их строки не пересекаются). `task-types/quiz/Editor.tsx` (своих настроек нет; раздел — банк вопросов), `video_lesson/Editor.tsx` (как проверять просмотр с пояснением режима, свой порог 10–95 % или «как в настройках», полоса над субтитрами и её высота 4–40 %; разделы — банк и расшифровка), `chore/Editor.tsx` (один раз / раз в день / раз в неделю).
  - Вопросы (`features/questions/*`): банк с номерами, вариантами А–Г и отметкой «верный», фрагментом-объяснением «м:сс–м:сс · «цитата»» и строками расшифровки внутри фрагмента; бейджи версии, источника («из импорта» / «правка родителя»), «ждёт ревизии», «в архиве»; «Показать архив»; «История» — все версии; правка и добавление (текст, 4 варианта, верный, картинка-путь, начало/конец фрагмента в м:сс, цитата; проверка `questionContentSchema` у полей) — новая версия; «В архив» с подтверждением. «Загрузить тест»: файл TXT/MD/JSON ≤ 500 КБ (BOM снимается, ` ` — «Сохраните файл в кодировке UTF-8»), вставка текста, «Промпт для нейросети» (точный текст spec/01 §2.4), образец текста и JSON, «Распознать вопросы» — разбор общим `parseQuestionImport` в браузере и предпросмотр «Проверьте: N вопр.» с верными ответами, затем «Заменить» или «Добавить к ним». Расшифровка — только чтение (источник, язык, дата, все фрагменты с таймкодами).
  - Ревизии импорта: список «Ждут решения / Все» (что меняется, новое видео, статус), страница ревизии — разница по ключам вопросов «Сейчас / Предлагает импорт» с бейджами Новый / Изменён / Убран / Конфликт (конфликт = вопрос правил админ, импорт его не трогает), новое видео и его готовность, «Принять» / «Отклонить».
  - Предметы: таблица (значок, название, ключ, порядок, статус), добавление (название, ключ необязателен, встроенный значок из манифеста `game/subjects-pixel/*` с предпросмотром, порядок), правка, архив, удаление (409 → «можно только убрать в архив»). Значок-загрузка для предмета не сделана: схема предмета принимает только ключ ассета (PARITY 01-004 — без своей картинки; заглушка P-003 уже описана).
  - Просмотр фрагмента evidence — текстом (цитата + строки расшифровки в границах фрагмента), без видеоплеера: вид медиа (HLS/MP4) админским API не отдаётся.
  - Тесты: 11 в `apps/web/test/admin-tasks.test.tsx` (фильтры и поиск, плашка ревизий; новое задание → его страница; причины запрета публикации; PATCH только изменённых полей, конфиг видеоурока, назначение; банк — верный ответ, фрагмент из расшифровки, правка с проверкой «Варианты должны различаться» и смена верного; история версий; импорт текста с предпросмотром и «Добавить к ним»; нераспознанный текст; ревизия — разница, конфликт, «Принять»; предметы — добавление со значком, удаление → архив; файлы теста), +2 в `task-types.test.tsx` (у теста есть Editor, тип без Editor, Editor без Player и двойная регистрация). e2e `admin-tasks.spec.ts` (своя установка): импортированный черновик (lesson-prep API) → правка вопроса 1 (v2, «правка родителя») → «Без условия» → назначить Саше → «Опубликовать» → на детском планшете урок на главной, в попытке исправленный вопрос. Скриншотов нет (база не нужна).
  - Вне перечня Scope (необходимо): `apps/web/src/screens/admin/TaskRevisions.tsx`, `apps/web/src/features/{admin-tasks/queries.ts,imports/queries.ts}`, `apps/web/src/task-types/registry.ts`, `apps/web/src/app/{router.tsx,layouts.tsx}`, `packages/ui/src/icons.ts` (Shapes), `apps/web/test/task-types.test.tsx` (старый тест «у теста нет Editor»), `e2e/fixtures/{content.ts,admin.ts}` (`importVideoLesson` выделен из `createVideoLesson`; админ как API-клиент и детское устройство). Тестов 797 (+2 пропущено), было 785.
- **Risk**: HIGH
- **Requires decision**: N
- **Spec reference**: SPEC §5 шаг 8; README оригинала «Test import format».
- **Rule**: CLAUDE.md 8, 10
- **Scope**:
  - `apps/web/src/screens/admin/{Subjects.tsx,Tasks.tsx,TaskEdit.tsx}`, `apps/web/src/task-types/{quiz,video_lesson,chore}/Editor.tsx`, `apps/web/src/features/questions/*`, тесты, `e2e/admin-tasks.spec.ts`
- **Depends on**: FEAT-039, FEAT-031, FEAT-054, FEAT-053
- **DoD**:
  - Список с фильтрами. Редакторы типов. Публикация показывает ошибки `canPublish`. Дата открытия, назначения.
  - Экран ревизий импорта: diff вопросов, конфликты с правками админа, «Принять» и «Отклонить» (API — FEAT-012).
  - Вопросы: версии и архив, импорт текста и JSON с предпросмотром, просмотр фрагмента evidence, расшифровка (только чтение).
  - e2e: импортированный черновик → правка вопроса → публикация → ученик видит задание.

### FEAT-041 — Админка: прогресс, проверки, начисления
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Разделы «Прогресс» (`/admin/progress[/:learnerId]`, без ученика — первый активный), «Проверки» (`/admin/reviews`, вкладки «Дела · Пересдачи» со счётчиками, `?queue=retries`), «Награды» (`/admin/awards[/:learnerId]`, вкладка «Причины» — `/admin/awards/reasons`), детали попытки `/admin/attempts/:id`.
  - Прогресс ученика: «Задания от родителя X из Y», серия, режим открытия (подпись из `.meta` реестра настроек); фильтр состояния; таблица — задание (ссылка на страницу задания, тип, «назначено», причина закрытия), состояние (Не начато / Начато / Пройдено / Закрыто родителем + «пройдено раньше» у переоткрытого), результат, доступ («закрыто: ждёт предыдущий урок / очереди в круге предметов»), меню «Действия»: «Закрыть…» (с наградой или без, причина), «Переоткрыть («Пройти с мамой»)», «Разрешить ещё попытку», «Сбросить…»; «Сбросить весь прогресс» (подтверждение словом СБРОСИТЬ) и «Обнулить монеты» (одна компенсирующая запись). У сбросов `requestId` создаётся при открытии окна — повторный клик ничего не повторяет.
  - Подтверждение просмотра — действие типа `video_lesson` (правило 10): в `TaskTypeAdmin` реестра добавлен слот `ProgressActions`, кнопка «Подтвердить просмотр» живёт в `task-types/video_lesson/ConfirmWatch.tsx` и видна только на строках видеоуроков, пока урок не пройден (в любом режиме просмотра, как в оригинале, PARITY 01-016).
  - Попытки: список по ученику с фильтром задания (результат «N из M», зачёт / не зачёт, «идёт», «брошена при сбросе») → страница попытки: итог, награда и бонус серии, «по вашему разрешению на пересдачу», вопросы снимка в порядке показа с ответом ученика и верным вариантом (`AnswerReview` дизайн-системы).
  - Проверки: дела — «Засчитать» (тост с выплаченной наградой) / «Не засчитать» с комментарием; фильтр «Ждут проверки / Засчитаны / Не засчитаны»; пересдачи — просьбы со ссылкой на проваленную попытку и «Разрешить пересдачу».
  - Награды: «Начислить» — причина (активные; выбор подставляет название, XP и монеты) или «Своя награда», название, XP/монеты 0–1000, день (сегодня), предмет, урок (опубликованные), заметка; `requestId` на одно намерение; 409 `duplicate_award` → «Начислить ещё раз» с `force` и тем же `requestId`. Список выданных по 20 («Показать ещё»), «Отменить» → награда остаётся с «Отменено». Причины: добавить, изменить, в архив (архивные не предлагаются при начислении).
  - Сброс показывает текущее поведение сервера честно: «Просмотренное видео не сбрасывается: вопросы урока откроются без повторного просмотра» (FEAT-013, у `watch_progress` нет epoch) — **решение за пользователем**: оставить так или требовать пересмотр после сброса (это изменение сервера и, вероятно, миграция).
  - Тесты: 13 в `apps/web/test/admin-progress.test.tsx` (первый ученик, состояния, блокировки, кнопка плагина только у видео; закрытие с наградой и причиной; переоткрытие и пересдача; сброс задания с текстом про видео и `requestId`; «СБРОСИТЬ» и обнуление монет; подтверждение просмотра; попытки со ссылкой; детали попытки; дела — засчитать / не засчитать с комментарием; пересдача по просьбе; награда из причины и повтор с `force`; своя награда без сумм и отмена; причины — добавить и в архив). e2e `admin-progress.spec.ts` (своя установка): ученик дважды проваливает тест и просит пересдачу, отмечает дело → админ засчитывает дело и разрешает пересдачу, закрывает тест с наградой («+100 XP, +350 монет»), переоткрывает, видит обе попытки; своя награда +25 монет и её отмена. Скриншотов нет.
  - Вне перечня Scope (необходимо): `apps/web/src/features/{admin-progress/queries.ts,admin-rewards/*,users/LearnerSelect.tsx}`, `apps/web/src/task-types/{registry.ts,video_lesson/Editor.tsx,video_lesson/ConfirmWatch.tsx}`, `apps/web/src/app/{router.tsx,layouts.tsx}`, `packages/ui/src/icons.ts` (ClipboardCheck, ListChecks), `e2e/admin-progress.spec.ts`. Тестов 810 (+2 пропущено), было 797.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: SPEC §1 «ручное управление»; spec/02 §2.3; Critique 1 MED#3, MED#4.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/admin/{LearnerProgress.tsx,AttemptDetails.tsx,Reviews.tsx,Awards.tsx,RewardReasons.tsx}`, тесты
- **Depends on**: FEAT-039, FEAT-009, FEAT-010, FEAT-013, FEAT-014, FEAT-016, FEAT-053
- **DoD**:
  - По ученику: задания и состояния; «Закрыть (с наградой или без)», «Переоткрыть», «Сбросить», «Сбросить всё»; подтверждение просмотра; детали попыток (вопросы из снимка, ответы).
  - Очереди: дела на проверку и просьбы о пересдаче. Начисления и их отмена, справочник причин (тесты + e2e).

### FEAT-042 — Админка: магазин, загрузки, выдача желаний
- **Status**: done
- **Completed**: 2026-11-14
- **Notes**:
  - Разделы «Магазин» (`/admin/shop`, `/admin/shop/new`, `/admin/shop/:id`) и «Выдача желаний» (`/admin/wishes`, `?show=remaining`).
  - Каталог: вкладки «Все · Образы · Комнаты · Билеты» (фильтр уходит в API), «Только то, что в магазине»; карточки с картинкой (кадр спрайта или целая картинка через `AnimatedHero` без движения, миниатюра комнаты, билет; загрузка без файла — заглушка P-001), тип, цена, Robux, «Живой», «В магазине / Скрыт», «Стартовый». Удаления нет — товар выключают.
  - Редактор товара: тип (только при создании; дальше — текст с версией), название, описание, цена 0–100 000, «Показывать в магазине ребёнка»; картинка «Встроенная / Своя загрузка» — герой из библиотеки, комната (и раздел комнат), картинка билета из уже используемых билетами каталога (кадр спрайта); анимация — встроенная своего вида (герой / комната) или своя загрузка (анимированный WebP); билет — «Желание» или «Robux» с количеством Robux отдельно от цены. Уходят поля только своего вида; при правке — только изменённые; отказ сервера (`invalid_item`) показывается как есть; после сохранения — «Сохранено, версия N» (покупка старой версии отказывается сервером).
  - Загрузки (`features/admin-shop/UploadField.tsx`): выбор из загруженных (неподвижные или анимации — по полю), новая загрузка файлом (сырое тело `POST /api/admin/uploads`, PNG/JPEG/WebP) с подсказкой лимитов, предпросмотр, «Убрать».
  - Выдача: «Просят сейчас» (счётчик просьб) / «Всё невыданное»; по ученику — карточки групп: Robux — количество (по умолчанию весь остаток), «Сейчас осталось: X · После отметки: Y», «Выдать Robux»; желание — «Подтвердить выполнение». С запросом уходят `expectedRemaining` и `requestId`; 409 `remaining_changed` → «Остаток изменился — список обновлён», очередь перечитывается.
  - Тесты: 8 в `apps/web/test/admin-shop.test.tsx` (виды и фильтр, переход к товару; новый образ из героя с анимацией героя — тело запроса целиком; билет Robux и отказ сервера; правка шлёт только изменённое и показывает версию; своя загрузка заменяет героя; часть Robux с «осталось / после отметки»; желание и `remaining_changed`; пустая очередь). e2e `admin-shop.spec.ts` (своя установка): билет из встроенной картинки → своя загрузка PNG → версия 2 → «В магазине»; ученик покупает Robux и желание и просит оба → админ подтверждает желание, выдаёт 100 из 300 Robux, остаток 200 во «Всё невыданное». Скриншотов нет.
  - Не сделано: «Скопировать промпт» для нового образа (PARITY 02-045 — текста `outfitPrompt` в спеках нет); удаление загрузок (API нет).
  - Вне перечня Scope (необходимо): `apps/web/src/features/admin-shop/*`, `apps/web/src/app/{router.tsx,layouts.tsx}`, `e2e/admin-shop.spec.ts`. Тестов 818 (+2 пропущено), было 810.
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: spec/02 §2.6–2.7.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/admin/{ShopItems.tsx,ShopItemEdit.tsx,WishFulfillment.tsx}`, тесты
- **Depends on**: FEAT-039, FEAT-017, FEAT-018, FEAT-020, FEAT-053
- **DoD**:
  - CRUD товаров: встроенная картинка или анимация либо загрузка, включить или выключить, `version`.
  - Выдача: Robux (количество, «сейчас осталось / после отметки»), желания («Подтвердить выполнение») (тесты + e2e).

### FEAT-043 — Админка: история
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: раздел «История» кабинета оригинала (события, результаты); эталон 21 — это главная кабинета, см. FEAT-055.
- **Rule**: CLAUDE.md 8
- **Scope**:
  - `apps/web/src/screens/admin/History.tsx`, тесты
- **Depends on**: FEAT-039, FEAT-006, FEAT-007
- **DoD**:
  - Лента начислений и действий админа с фильтрами по ученику, типу и дате, постранично (тест).

### FEAT-055 — Админка: главная «Что нужно сделать?»
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: PARITY G-1 (строка 01-087), reference-screens 21 («Кабинет родителя»).
- **Rule**: CLAUDE.md 2, 8, 11
- **Scope**:
  - `apps/api/src/modules/admin-inbox/{routes.ts,service.ts}`, `apps/web/src/screens/admin/Home.tsx`, `apps/api/test/admin-inbox.test.ts`, `apps/web/test/admin-home.test.tsx`
- **Depends on**: FEAT-039, FEAT-041, FEAT-042, FEAT-012, FEAT-053
- **DoD**:
  - `GET /api/admin/inbox` (admin) только читает. Отдаёт счётчики очередей: дела на проверку, просьбы о пересдаче, желания и Robux к выдаче, ревизии импорта, просмотры, ждущие подтверждения (тест + строки FEAT-049).
  - `/admin` по умолчанию открывает главную:
    - карточки очередей со ссылками;
    - быстрые действия «Выдать желание», «Проверить дела», «Открыть задания»;
    - поиск по разделам и ключам настроек;
    - хлебные крошки.
  - e2e-скриншот. Ручная сверка с reference 21 — отметка в PARITY.md.

### FEAT-056 — Смена своего пароля админом
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: PARITY 01-085 (решение пользователя 14.11.2026).
- **Rule**: CLAUDE.md 11
- **Scope**:
  - `apps/api/src/modules/auth/{routes.ts,service.ts}` (маршрут смены пароля), `apps/web/src/screens/admin/Profile.tsx`, `apps/api/test/password-change.test.ts`
- **Depends on**: FEAT-004, FEAT-039
- **DoD**:
  - `PUT /api/me/password {current, next}` (admin): нужен верный текущий пароль, иначе 403 с той же защитой от перебора. Остальные сессии этого админа отзываются, текущая остаётся. Пишется в audit без значений (тесты + FEAT-049).
  - Экран «Профиль» в админке с формой смены пароля (тест).

### Фаза E — деплой

### FEAT-044 — Production-режим, Dockerfile, CLI
- **Status**: pending
- **Risk**: MED
- **Requires decision**: N
- **Spec reference**: Clarification «Node раздаёт API, SPA, медиа»; CLAUDE.md 13; Critique 1 MED#19, LOW (tini, backup CLI).
- **Rule**: CLAUDE.md 7, 13
- **Scope**:
  - `apps/api/src/static.ts`, `apps/api/src/cli/backup.ts`, `deploy/{Dockerfile,.dockerignore,healthcheck.mjs}`, `scripts/load.mjs`, `apps/api/test/static.test.ts`
- **Depends on**: FEAT-002, FEAT-024, FEAT-004
- **DoD**:
  - SPA с fallback на `index.html`; ассеты с хэшем — `immutable` (тест).
  - Образ: multi-stage node:22, tini, не root (uid 1000), `HEALTHCHECK`, `NODE_OPTIONS=--max-old-space-size=96`, размер < 250 МБ.
  - CLI: `backup <путь>` через `db.backup()` и `reset-password`.
  - Локальный `docker run` с томом: RSS после прогрева < 150 МБ. Под нагрузкой (`scripts/load.mjs`: 10 параллельных потоков видео + 50 запросов/с к API в течение 2 минут) — < 200 МБ (`measure-rss`).

### FEAT-045 — CI и публикация в GHCR
- **Status**: pending
- **Risk**: LOW
- **Requires decision**: N
- **Spec reference**: Clarification «GitHub Actions → GHCR».
- **Rule**: CLAUDE.md «Git»
- **Scope**:
  - `.github/workflows/{ci.yml,release.yml}`
- **Depends on**: FEAT-044, FEAT-053
- **DoD**:
  - PR и push: lint, typecheck, test, e2e (Chromium). CI не использует `QuestClass-Source`. Push в `main`: образ `ghcr.io/olegmedv/questclass:{sha,latest}` (приватный). Первый прогон зелёный.

### FEAT-046 — Деплой на VPS
- **Status**: pending
- **Risk**: HIGH
- **Requires decision**: Y — разрешение на SSH в момент выполнения
- **Spec reference**: SPEC §1 «новый блок в общем Caddyfile»; Critique 1 MED#19.
- **Rule**: CLAUDE.md 13; аудит сервера «Что НЕ трогать»
- **Scope**:
  - `deploy/{docker-compose.yml,deploy.sh,README.md}`
  - на сервере: `/opt/questclass/**` (временный контейнер FEAT-050 заменяется). Блок Caddy уже добавлен в FEAT-050 и не меняется.
- **Depends on**: FEAT-045, FEAT-050
- **DoD**:
  - Подсеть `shared_web` (`docker network inspect`) входит в `http.trustedProxies`; если нет — ключ правится в админке до открытия доступа.
  - Compose: сеть `shared_web`, `mem_limit: 256m`, логи json-file (10m × 3), `restart: unless-stopped`, том `/opt/questclass/data` с владельцем uid 1000. GHCR — токен только на чтение.
  - `deploy.sh up <tag>` и `deploy.sh rollback` (к предыдущему тегу) проверены. Миграции только расширяющие (CLAUDE.md 2), поэтому предыдущий образ работает на новой схеме. Для крайнего случая есть `deploy.sh restore-snapshot` из снимка перед миграцией (FEAT-003), с предупреждением о потере данных после снимка.
  - `https://questclass.duckdns.org/api/health` → 200. Остальные домены сервера отвечают тем же кодом, что до деплоя. Setup-токен взят из логов, админ создан.

### FEAT-047 — Бэкапы
- **Status**: blocked — отложено пользователем до после MVP (14.11.2026)
- **Risk**: MED
- **Requires decision**: Y — где второе место (второй сервер или S3)
- **Spec reference**: SPEC §1 «мастер-ключ бэкапится отдельно»; research/hosting-ru; Critique 1 HIGH#8, LOW (sqlite3 CLI).
- **Rule**: CLAUDE.md 2
- **Scope**:
  - `deploy/{backup.sh,restore.md}`, cron на сервере
- **Depends on**: FEAT-046, FEAT-053
- **DoD**:
  - Ночью `docker exec questclass node dist/cli.js backup` → БД + все файлы `media`, кроме `role=video` (картинки вопросов и загрузки); список берётся из таблицы `media`. Тест восстановления проверяет картинку вопроса. Архив шифруется (`age`, публичный ключ получателя) и уходит во второе место; хранится 14 копий. Видео не копируются, их бэкап — YouTube.
  - `master.key` **не** входит в архив. При первом деплое админ сохраняет его офлайн; копия, зашифрованная другим ключом, лежит во втором месте.
  - Восстановление по `restore.md` проверено на чистой машине. Выполняется сразу после FEAT-046, до реального использования.

## Iteration history

### Iteration 1 — Draft
- Написаны FEAT-001…FEAT-048 (48 пунктов): каркас (001–003), auth, настройки, audit (004–006), экономика и задания (007–016), каталог, магазин, герой (017–021), видео-ретеншн и импорт (022–023), web-каркас и дизайн-система (024–028), экраны ученика (029–038), админка (039–043), деплой (044–047), сид (048).

### Critique 1

Критик: независимое ревью (critic-plan), 2026-11-14. Сверка с CLAUDE.md, SPEC §1–§11 (источник — §9 «Этап 1 — MVP»), чеклистами паритета `spec/01` и `spec/02` (только пункты MVP), решениями из «Clarification» и исходником `QuestClass-Source/` (только чтение). Вердикт: **нужна доработка** (есть HIGH и MED). Все четыре линзы применены: security, performance, quality, ux — находки есть в каждой.

- HIGH: [FEAT-017, FEAT-026, FEAT-048] Цикл зависимостей в DoD. FEAT-017 ссылается на «пути из манифеста ассетов (FEAT-026)», а манифест появляется только в FEAT-026, который идёт позже и от FEAT-017 не зависит. Тест FEAT-026 «каждый путь из `apps/api/seed/catalog.json` и сид-уроков есть в манифесте» требует catalog.json (FEAT-017) и сид-уроки (FEAT-048), а FEAT-048 сам зависит от FEAT-026. Ни один из пунктов не закрывается первым. Fix: поставить FEAT-026 перед FEAT-017 и брать список картинок квизов прямо из `subtitle-lesson-pack.json` по 5 videoId. Тест «нет битых ссылок каталога» перенести в FEAT-017 (Depends on: FEAT-026), тест для сид-уроков — в FEAT-048.
- HIGH: [FEAT-017, FEAT-019, FEAT-042; Clarification «анимации — всё в MVP»; SPEC §9 «Astro со звуком»] При «видимости как в оригинале» ученик в MVP не сможет получить Astro и большую часть анимаций. В исходнике `active:false` у паков Astro (2 товара), Cadence (4), Dozer (4), Mart (4), Rebound (5) и у live-sets (3). Это призы альбомов и Искр, которых в MVP нет. В итоге недоступны Astro, 4 из 7 ambient-комнат (rebound, clock, water, fairy/dozer) и почти все живые герои этих паков. Решение пользователя невозможно проверить на реальном ученике. Fix: в FEAT-017 переопределить видимость для MVP: товары, которые в оригинале открывались только как призы, включить в магазин по правилу цен §2.5 (живой герой 80, анимированная комната 200). Либо добавить админ-действие «подарить вещь» (покупка за 0 со `source=admin`, без строки в ledger) в FEAT-019 и FEAT-042. DoD-тест: каждый живой герой и каждая анимированная комната доступны через витрину или подарок. Отметить `Requires decision: Y`.
- HIGH: [FEAT-004, FEAT-028, FEAT-046] [lens: security] `POST /api/setup` работает по принципу «кто первый, тот админ». После FEAT-046 приложение открыто в интернете, и любой, кто откроет `/setup` раньше владельца, получит полный админ-доступ. Fix: setup принимает одноразовый setup-токен, который создаётся при первом старте в `DATA_DIR/setup.token` и пишется в лог контейнера. Токен удаляется после создания админа. DoD-тесты: без токена — 403, повтор после setup — 409.
- HIGH: [FEAT-004, FEAT-028] [lens: security] Анонимный `GET /api/auth/profiles` отдаёт имена и аватары детей любому посетителю публичного домена — это персональные данные несовершеннолетних. Кроме того, блокировка «5 неверных → 15 минут» привязана к аккаунту: посторонний может бесконечно держать заблокированными учеников и единственного админа (DoS). Fix: «доверенное устройство». Админ один раз входит на устройстве и выдаёт долгоживущий device-cookie (хэш хранится в таблице `devices`, отзыв — в админке). Без него profiles отдаёт 401. Ограничение попыток считать по паре (аккаунт, IP) плюс общий rate limit. Реальный IP брать из `X-Forwarded-For` только от Caddy (trust proxy). DoD-тесты на все три правила.
- HIGH: [FEAT-012, FEAT-011] [lens: security] `PUT /api/import/media/:id/files/<path>?offset=` пишет файл по пути из URL. На путь записи не заявлено ни одной проверки (тест на traversal в FEAT-011 касается только чтения). Владелец токена импорта сможет перезаписать `DATA_DIR/master.key`, файл БД или выйти за пределы `DATA_DIR`. Fix: белый список `<path>` (regex сегментов и расширений `.m3u8|.ts|.m4s|.mp4|.webp|.jpg|.vtt`), `path.resolve` с проверкой префикса `DATA_DIR/media/<id>/`, отказ на символические ссылки, `offset` строго равен текущему размеру файла (никаких дыр и перезаписи), лимиты на размер файла, число файлов и медиа целиком. DoD-тесты: `../`, абсолютный путь, `%2e%2e`, недопустимое расширение, offset ≠ размер.
- HIGH: [FEAT-008, FEAT-010, FEAT-012, FEAT-013, FEAT-040] Модель данных вопросов и попыток портит историю. (1) FEAT-013 кладёт `questions[]` в JSON `config`, а SPEC §8 требует отдельную таблицу `questions`. Правка одного вопроса переписывает весь config, а ссылаться на вопрос из ответов нельзя. (2) FEAT-010 «фиксирует набор вопросов», но не говорит, что это снимок текста, вариантов и верного ответа. (3) FEAT-012 «обновляет черновик по externalId» без защиты: повторный импорт урока с попытками заменит банк под ними. Правило «статус всегда draft» снимет с публикации урок, который ученик проходит прямо сейчас. (4) FEAT-008 разрешает CRUD (в том числе удаление) заданий, по которым есть попытки, ledger и `foreign_keys=ON`. Удаление упадёт или каскадно сотрёт историю. Fix: таблица `questions` по §8. Снимок в `attempt_questions` (текст, варианты в порядке показа, верный ответ, картинки, evidence). Если по заданию есть попытки, замена банка и смена медиа — 409 (как в `spec/01` §2.3). Повторный импорт меняет только черновик без попыток и не трогает статус опубликованного задания. Удаление заменить архивированием. Отдельные DoD-тесты на каждое правило.
- HIGH: [FEAT-010, FEAT-011, FEAT-013, FEAT-014, FEAT-019–021] [lens: security] Мутации ученика по id не проверяют, чьи это данные и видно ли задание ученику (шаблон «нет ownership check» из библиотеки типовых ошибок). Ответ и finish в чужой попытке, `POST /api/watch/:taskId` по черновику, неназначенному или ещё не открытому заданию, отметка «сделано» по чужому делу, `GET /api/media/:id/*` для черновика — любой сессии хватает для доступа. Нарушается CLAUDE.md правило 11 «Ученик видит только свои данные». Fix: общий хелпер `assertTaskVisible(learner, taskId)` и `assertOwnAttempt` в сервисах. Медиа отдавать только если у ученика есть видимое задание с этим `mediaId`, id медиа — случайные (UUID). DoD-тесты «ученик B → 404/403 на ресурсы ученика A» и «черновик → 404» в каждом пункте.
- HIGH: [FEAT-047] [lens: security] Противоречие со SPEC §1: «мастер-ключ… лежит файлом в томе данных (бэкапится отдельно)». FEAT-047 кладёт `master.key` в один архив с БД и отправляет его без шифрования во второе место. Утечка одного архива раскрывает все секреты из `secrets`. Fix: архив БД и uploads шифровать (age или gpg, публичный ключ на сервере). `master.key` бэкапить отдельно, в другое хранилище или офлайн у владельца, и описать это в `restore.md`. DoD: в удалённом хранилище нет `master.key` рядом с БД.
- HIGH: [FEAT-046, FEAT-011, FEAT-031] Порядок расходится со SPEC §2 «Проверка до запуска видео» и §4 («если провайдер замораживает соединение… нужен прокси в РФ»). Тест скачивания 100 МБ из РФ без VPN стоит последним (FEAT-046), после всей HLS-цепочки. Если он провалится, архитектуру раздачи видео придётся менять. Fix: вынести отдельный ранний пункт (после FEAT-002): Caddy-блок `questclass.duckdns.org` отдаёт статический тестовый файл 100 МБ, пользователь подтверждает скачивание с домашнего и мобильного интернета. Сделать его зависимостью FEAT-011 и FEAT-031. `Requires decision: Y` (SSH, правка общего Caddyfile).
- HIGH: [global; SPEC §11] Нет пункта под правило приёмки этапа: «все пункты модулей, относящиеся к этапу, отмечены, или явно перенесены в «не переносить», или отложены с причиной». Многие пункты чеклистов MVP-модулей молча выпали: «Пройти с мамой», разминка, обучение-тур, авторежим «4 предмета по кругу», режимы просмотра strict/partial/free, вторая вкладка плеера, полный сброс прогресса (конфликтует с правилом 4: ledger нельзя удалять), тестовая копия (в `spec/02` §3 предложена замена на тестового ученика), предупреждение о серии, «запустение», настроения Стара в шапке, ролик серии, отчёты и PDF. Fix: добавить пункт (лучше первым, `Requires decision: Y`) `docs/PARITY.md`. В нём каждая строка чеклистов `spec/01` §4 и `spec/02` §5 сопоставлена с FEAT-id, «этап 2/3» или «не переносить (причина)». Пользователь подтверждает таблицу. Пункты, которые окажутся в MVP, добавить в план.
- HIGH: [FEAT-014] В scope нет схемы и миграции для выполнений дел (SPEC §8: `chores` + `chore_completions`). Повторяемые дела (`daily|weekly`) дают много выполнений на пару (ученик, задание), а `task_progress` хранит одну строку на пару. Состояния `pending_review`, отказ с комментарием и награда по completion некуда записать. Fix: добавить `apps/api/src/db/schema/choreCompletions.ts` и миграцию (learner, task, periodKey, state, reviewedBy, comment, unique (learner, task, periodKey)). idemKey награды — `chore:<completionId>`.

- MED: [FEAT-004, FEAT-005, FEAT-006] Перевёрнутый порядок. FEAT-004 читает «срок жизни сессии — настройку», но реестр настроек появляется только в FEAT-005, который зависит от FEAT-004. FEAT-006 требует, чтобы «изменения пользователей и настроек (FEAT-004/005) писались в журнал», но в его scope только файлы audit. Fix: вынести реестр и сервис настроек (без маршрутов) и `audit.record` в пункт перед FEAT-004. Либо добавить в scope FEAT-006 `modules/{users,settings}/service.ts`, а в FEAT-004 оставить константы до FEAT-005.
- MED: [FEAT-007, FEAT-016] Ledger. (1) Проверка `insufficient_coins` описана как общая для любого списания. Тогда админ не отменит начисление, если ребёнок уже потратил монеты. А `spec/02` §2.1 прямо говорит, что баланс может стать отрицательным после отмены. Проверку делать только для покупок. (2) Повторная отмена должна быть идемпотентной (`spec/02` чеклист): колонка `reverses_id UNIQUE` или idemKey `reverse:<entryId>`. (3) Клиентский `requestId` хранить с пространством имён (`award:<learner>:<requestId>`, `purchase:<learner>:<requestId>`), чтобы повтор чужого requestId не возвращал чужую запись. Добавить DoD-тесты.
- MED: [FEAT-009, FEAT-010, FEAT-030, FEAT-041] Пересдачи и ручное закрытие недоопределены. (1) У FEAT-009 нет зависимости от FEAT-007, хотя «закрыть с наградой» пишет в ledger. Сумма награды и idemKey не заданы — нужен тот же `task:<id>:learner:<id>:pass`, иначе после «закрыть с наградой» и последующего зачёта награда начислится дважды. (2) `/reset` не должен удалять попытки (история, ledger). Нужна вставка строки-маркера, после которой старые попытки не считаются. (3) Таблицы для `retry-grant` нет в scope FEAT-010. (4) Для кнопки «Попросить пересдачу» (FEAT-030) нет эндпоинта в FEAT-010 и очереди просьб в FEAT-041. (5) finish должен в одной транзакции обновлять попытку, `task_progress`, ledger и награду за серию. Fix: дописать DoD и scope.
- MED: [FEAT-009, FEAT-041] Нет админ-действия «Подтвердить просмотр вручную» (чеклист `spec/01`, SPEC §1 «поправить параметры»). Оно нужно, когда видео не грузится, ребёнок смотрел вне приложения или файл удалён по сроку. Также нет просмотра попыток с ответами («Как идут уроки»). Fix: `POST …/progress/:taskId/watch-confirm` (одна строка, `completionKind=admin`, запись в audit) и детализация попыток в LearnerProgress.
- MED: [FEAT-013, FEAT-031] [lens: security] Учёт просмотра доверяет клиенту: пачка интервалов «объединяется и обрезается по длительности», и одного запроса `[0, duration]` хватает, чтобы открыть тест. Чеклист `spec/01` требует засчитывать только уникальные непрерывно воспроизведённые видимые секунды. Fix: сервер засчитывает за пачку не больше `(now − lastBatchAt) × playbackRate + допуск` секунд, привязывает пачку к `watchSessionId` (новая сессия на каждое открытие; старая вкладка получает 409) и хранит `lastPosition` для продолжения. Во время подсказки-фрагмента интервалы не отправляются. Тесты на каждое правило.
- MED: [FEAT-015] Правило серии сместилось и хрупко. В оригинале день засчитывается завершённым тестом с любым результатом по уроку с засчитанным просмотром («ошибки не мешают серии»). В плане — «пройдено хотя бы одно учебное задание», а при пороге 2/3 это меняет поведение. Считаются ли дела — не сказано. Если серия вычисляется из `completedAt`, то reopen или reset в FEAT-009 задним числом перепишут дни, `cycleStartDay` сместится и награда начислится второй раз. Fix: решить правило явно (`Requires decision: Y`) и хранить дни отдельной таблицей `streak_days` (одна вставка на learner+dayKey при первом подходящем событии), а серию и награду вычислять из неё.
- MED: [FEAT-012, FEAT-022] Расшифровки нигде не хранятся, хотя SPEC §5 шаг 7 («видео, расшифровка, черновик»), §8 (`transcripts`) и §1 («Расшифровка и вопросы остаются») их требуют. FEAT-022 обещает, что расшифровка сохранится, но таблицы под неё нет. Fix: добавить `transcripts` (media/task, lang, format srt/vtt, текст) в FEAT-012 и поле в манифест `lesson.json`. DoD: после удаления медиа по сроку расшифровка читается.
- MED: [FEAT-008, FEAT-012, FEAT-026, FEAT-048] Предметы. Нет сида шести стартовых предметов (russian/world/math/reading/art/craft) с пиксельными иконками (чеклист `spec/01`). Нет поля картинки предмета. `game/subjects-pixel` (3,7 МБ) отсутствует в списке ассетов FEAT-026. Манифест импорта не несёт предмет, а FEAT-048 нужны 5 предметов. Нет правил: имя уникально без учёта регистра, удалять только пустой. Fix: сид предметов (без захардкоженных id в коде, данные в seed-файле), `subjects.image`, `subjectKey` в манифесте с сопоставлением или созданием, тесты на правила.
- MED: [FEAT-048] SPEC §9 требует «видео скачивается с YouTube в 480p», но шага скачивания нет: «их нужно скачать заранее». Путь `D:\QuestClassMedia\seed` зашит в код (дух правила 6). Тест читает `QuestClass-Source/`, которого нет в git и CI, поэтому `pnpm test` в FEAT-045 упадёт. Fix: команда `lesson-prep fetch-seed --out <dir>` через yt-dlp (на ПК админа) или точная команда в README. Путь передавать аргументом `--media-dir`. Тесты на фикстурах в `tools/lesson-prep/test/fixtures`. Так же поступить с тестами скрипта ассетов из FEAT-026.
- MED: [FEAT-025, FEAT-029–FEAT-043] [lens: quality] В списке компонентов FEAT-025 нет QuestionCard, хотя SPEC §3 называет его явно и FEAT-030 его использует. Не хватает и примитивов, без которых экраны не собрать: Accordion/Disclosure (серия, «Подробнее»), RadioGroup (варианты ответа), Slider (полоса субтитров с `role=slider`, громкость), DateTimeInput (`release_at`), Textarea, FileInput (импорт, загрузки), Checkbox. В scope экранных пунктов нет `packages/ui`, поэтому по правилу 8 добавлять их некуда. Ещё: вариант DoD «тест „нет hex вне tokens.css“» — это тест по строкам исходника, его запрещает правило 14. Fix: дополнить список в FEAT-025, вместо теста взять stylelint (`color-no-hex` с исключением для `tokens.css`).
- MED: [FEAT-026] Бюджет «≤ 60 МБ» скорее всего недостижим. Сырые папки MVP весят ≈80 МБ (characters 20, rooms 22, animated 14, fitting-room 4,1, icons 5,5, celebrations 4,2, subjects-pixel 3,7, previews 2,5, wishes 2,3, rewards 2,1, fonts 1,5, плюс часть quiz). Они уже в WebP, а анимированные должны сохранить кадры. `celebrations/streak-five-v1.mp4` противоречит CLAUDE.md «Не коммитить: видео». Для пережатия нужен новый инструмент (sharp, cwebp или ffmpeg) без флага решения. В `.gitattributes` нет `*.ogg *.mp3 *.woff2 *.ttf binary`. Fix: `Requires decision: Y` на бюджет и инструмент. Ролик серии перевести в animated WebP или явно разрешить в CLAUDE.md. Добавить `.gitattributes` в scope.
- MED: [FEAT-036] Не охвачена комната Rebound: отдельный `app/rebound-room.tsx`, `rooms/rebound-audio*`, штора `rebound-curtain-v3.webp`, ambient-тема `rebound` из списка §2.8. Если выбирать компонент по id комнаты (`NightHotelRoom`, `AstroRoom`), это захардкоженные id (правило 6). Fix: поле каталога `scene: static|ambient|night-hotel|astro|rebound` плюс `ambientTheme`, компонент выбирается по полю. DoD «работают так же, как в оригинале» и «< 10% CPU» заменить проверяемыми: тесты планировщика событий на фейковом таймере (интервалы, пауза 8 с, звук только после жеста), а CPU оставить отдельной отмеченной ручной проверкой.
- MED: [FEAT-029, FEAT-030, FEAT-031, FEAT-033, FEAT-035, FEAT-038] Порядок и зависимости web-пунктов. FEAT-030 требует «подсказка-фрагмент открывает видео на start», но плеер появится только в FEAT-031, который зависит от FEAT-030. FEAT-038 встраивает оверлей в зачёт, покупку и серию, но экраны 029, 030 и 033 сделаны раньше и не входят в его scope. FEAT-035 должен анимировать героя в магазине и на главной, а Shop.tsx и Home.tsx в его scope нет. Карточке героя на главной (FEAT-029) нужны FEAT-021 и FEAT-026, но они не указаны в Depends on. Fix: подсказку-фрагмент перенести в FEAT-031 (её поведение по `spec/01` §2.15: старт за 3 с, конец по времени медиа, возврат с сохранённым выбором), FEAT-038 поставить перед 029, а scope и Depends on дополнить.
- MED: [FEAT-008, FEAT-024] Правило 10 соблюдается наполовину: реестр типов есть в shared и api, но нет `apps/web/src/task-types/registry.ts`, который сопоставляет тип с Player и Editor. Нет маршрута задания (`/tasks/:id`) в FEAT-024. Нет проверки перед публикацией: медиа в статусе `ready` и банк ≥ `quiz.questionsPerAttempt` (в оригинале публикация требует видео и ≥3 вопросов). Fix: добавить web-реестр и маршрут в FEAT-024 или FEAT-027, а в FEAT-008 — 409 при публикации неготового задания с тестом.
- MED: [FEAT-002, FEAT-004] [lens: security] В правиле 11 только роли `admin | learner | import-token`, у анонимных маршрутов (health, setup, login, profiles) явной роли нет, и ничто не мешает добавить маршрут без гарда. Нет лимита тела запроса: огромный JSON раздует RSS сверх 200 МБ. Нет проверки Origin. Fix: роль `public` в декларации маршрута и тест-инвентаризация реестра маршрутов во время выполнения (у каждого маршрута есть роль). `bodyLimit` (JSON ≤ 1 МБ, кроме чанков импорта) и отказ при чужом `Origin` или `Sec-Fetch-Site: cross-site` для мутаций. Тесты на всё.
- MED: [FEAT-004] [lens: security] Не сказано, что в `sessions` хранится хэш токена, а не сам токен: в бэкапах (FEAT-047) это сырые сессии. Админская сессия на 7 дней с продлением на общем семейном устройстве позволяет ребёнку начислять себе монеты (в оригинале — 15 минут без продления как раз от этого). Нет logout. Fix: хранить SHA-256 токена. Админская сессия короткая (настройка, по умолчанию 30–60 минут без продления) или повторный ввод пароля для админских мутаций. Одна активная роль на браузер. `POST /api/auth/logout`. Тесты.
- MED: [FEAT-006] [lens: security] В журнал записываются «изменения пользователей и настроек», но не сказано, что из payload вырезаются значения секретов, пароли, PIN и токены импорта. Fix: правила маскирования в `audit.record` и тест «PUT secret, смена PIN или пароля → в audit нет значения».
- MED: [FEAT-012, FEAT-023] [lens: performance] Загрузка чанков может буферизоваться в памяти (например, `c.req.arrayBuffer()`), что опасно для лимита ≤200 МБ RSS. Нет максимального размера чанка, проверки свободного места на общем диске 77 ГБ и контрольной суммы при `complete`. Fix: писать поток прямо в файл, чанк ≤ 8 МБ (413 сверх лимита), проверять свободное место до приёма, sha256 каждого файла в манифесте и сверка при `complete`. Тест: загрузка 50 МБ не поднимает RSS выше порога (`measure-rss`).
- MED: [FEAT-044, FEAT-046] [lens: performance] Бюджет памяти только измеряется, но ничем не ограничен. На VPS с ~0,8 ГБ свободной памяти утечка вызовет OOM-killer, который может убить соседей (Postgres, MariaDB, VPN). Нет ротации логов, отката и снимка БД перед миграцией. Владелец тома `/opt/questclass/data` при не-root пользователе в контейнере не задан, и `master.key` не создастся. Fix: в compose задать `mem_limit: 256m`, `NODE_OPTIONS=--max-old-space-size=160`, `restart: unless-stopped`, logging `max-size`/`max-file`, `chown` тома под uid контейнера. `deploy.sh <sha>` делает `VACUUM INTO` перед обновлением и умеет откатиться на прошлый тег.
- MED: [FEAT-027, FEAT-029, FEAT-031, FEAT-033, FEAT-034, FEAT-048] [lens: quality] DoD нельзя проверить механически: «проверка ревью + lint», «скриншот-тест Playwright или ручная сверка», «ручная проверка на Slow 4G», «e2e-смоук». Playwright в CLAUDE.md помечен «позже», и ни один пункт его не настраивает. Fix: добавить пункт настройки Playwright (конфиг, запуск API на временной БД, один смоук) перед FEAT-029. Сверки со скриншотами оформить как артефакты (скриншоты 390 и 1440 px в PR). Ручные проверки пометить «manual» отдельными чекбоксами.
- MED: [FEAT-004, FEAT-039] Нет восстановления доступа, если единственный админ забыл пароль: почты в MVP нет, а переменные окружения запрещены правилом 7. Fix: CLI внутри образа `node dist/cli.js admin:reset-password <login>` (запуск через `docker exec`), запись в audit, тест сервиса.
- MED: [FEAT-020] Расходится с правилом 1 («одно действие = одна вставка или изменение строки»). `request` переводит в `requested` все ready-покупки группы (N обновлений), FIFO-выдача обновляет N покупок. Fix: просьба — одна строка `wish_requests`. Выдача — одна строка квитанции и вставки `fulfillment_allocations(purchaseId, amount)`. Остаток вычислять как `rewardAmount − Σ allocations`, покупки не менять.

- LOW: [global] Блок Summary не заполнен (`Total items: (заполняется)`, Pending, решения). Заполнить: 48 пунктов, Requires decision: FEAT-046 и FEAT-047 плюс новые из этой критики.
- LOW: [SPEC §1, §4, §7] SPEC всё ещё говорит «отдача через Caddy», «статику раздаёт Caddy», «проверка через Caddy forward_auth», а CLAUDE.md и план выбрали раздачу через Node. Обновить SPEC, чтобы исполнитель не сделал forward_auth.
- LOW: [FEAT-005, FEAT-010] `quiz.passRatio = 2/3` как float неудобен в форме настроек (0,67 уже провалит 2 из 3). Хранить `quiz.passPercent` (целое) или `quiz.minCorrect`. Явно зафиксировать округление (`floor`) и то, что пропорциональны и XP, и монеты (по решению из Clarification).
- LOW: [FEAT-010] Повтор того же ответа (сетевой ретрай) должен давать 200, как в оригинале, а 409 — только на другой ответ. Если банк меньше N, нужна понятная ошибка («Родитель ещё готовит вопросы»).
- LOW: [FEAT-016] Паритет `spec/02` §2.3: две причины по умолчанию («Присутствие на уроке», «Домашняя работа», 50 XP / 10 монет), поля начисления дата, предмет и название, защита от дубля (причина + дата + предмет + название), массовое «Награды за все уроки» (`spec/02` §2.2).
- LOW: [FEAT-031] [lens: ux] На iPhone Fullscreen API не работает для обёртки, работает только нативный `webkitEnterFullscreen` у `<video>`. Полоса поверх вшитых субтитров в полноэкранном режиме там не удержится. Зафиксировать ограничение и поведение.
- LOW: [FEAT-026, FEAT-036, FEAT-038] Старые версии iOS Safari не проигрывают OGG. Для звуков интерфейса и комнат оставить MP3 как запасной вариант или проверить на целевых устройствах.
- LOW: [FEAT-044] Обработка SIGTERM (закрыть сервер и БД) и `--init`/tini, чтобы `docker stop` не ждал 10 с и не убивал процесс через SIGKILL.
- LOW: [FEAT-047] В контейнере и, возможно, на хосте нет CLI `sqlite3`. Делать снимок через `VACUUM INTO` или `db.backup()` командой `docker exec questclass node dist/cli.js backup`. Между FEAT-046 и FEAT-047 бэкапов нет — либо поменять порядок, либо принять это явно.
- LOW: [FEAT-023] [lens: security] `--token <t>` в аргументах попадает в историю shell и список процессов. Поддержать чтение из файла конфигурации или из stdin.
- LOW: [FEAT-001] Тесты-заглушки в каждом пакете не проверяют поведение (дух правила 14). Лучше `vitest --passWithNoTests` до появления реальных тестов.
- LOW: [FEAT-027, FEAT-028] [lens: ux] В LearnerShell нет точек «Сменить ученика» (учеников может быть несколько) и «Родителям» (вход в админку с устройства ученика).
- LOW: [FEAT-035] В DoD нет «надетый живой герой анимируется 3 с на главной» и «reduced-motion отключает автозапуск» из чеклиста `spec/02`.
- LOW: [FEAT-038] Празднование серии из чеклиста `spec/01` не описано: ролик, полёт монет и XP, показ один раз на бонус и устройство, reduced-motion, «Предпросмотр награды» без изменения баланса.
- LOW: [FEAT-014] Для `weekly` нужен общий хелпер `weekKey()` рядом с `dayKey()` (правило 12), иначе граница недели посчитается по-разному в разных местах.
- LOW: [FEAT-017] Не сказано, когда запускается сид каталога (при старте после миграций или командой) и по какому ключу он находит свои строки. Нужен стабильный `seed_key`, чтобы новые версии каталога добавляли товары, не трогая правки админа.
- LOW: [FEAT-008, FEAT-022] «Нет назначений — значит всем» плюс удаление «когда все назначенные прошли»: для задания без назначений явно определить «все активные ученики на момент проверки» и что увидит ученик, добавленный после удаления видео.
- LOW: [FEAT-005, FEAT-009, FEAT-031] Ключи настроек, которые вводят поздние пункты (`progress.unlockMode` в FEAT-009, глобальный выключатель полосы субтитров в FEAT-031), не попадут в реестр: файла `packages/shared/src/settings/registry.ts` нет в их scope. Добавить.
- LOW: [FEAT-007, FEAT-009, FEAT-013] [lens: performance] Индексы и уникальность: `ledger(learner_id)`, `task_progress UNIQUE(learner, task)`, `watch_progress UNIQUE(learner, task)` (SPEC §4: «одна строка на (ученик, видео)»). Внести в DoD схем.

Итог: HIGH 11 · MED 22 · LOW 19. Вердикт: refine required — переработать план (Iteration 2) и запустить критику повторно.

### Iteration 2 — Refined
- Раздел `## Items` переписан целиком. ID 001–048 сохранены, добавлены FEAT-049…054. Порядок в файле = порядок выполнения (фазы A–E). Ничего не помечено как superseded.
- Новые пункты:
  - FEAT-049 — матрица доступа;
  - FEAT-050 — спайк доступа из РФ;
  - FEAT-051 — PARITY.md;
  - FEAT-052 — HTTP API настроек;
  - FEAT-053 — e2e-стенд Playwright;
  - FEAT-054 — вопросы с версиями и расшифровки.
- Addresses Critique 1:
  - HIGH#1 (цикл 017/026/048): FEAT-026 берёт ассеты по явному списку `mvp-assets.txt` и зависит только от 001. FEAT-017 зависит от 026 и проверяет свои пути по манифесту. Картинки квизов вынесены из ассетов в пакеты уроков (FEAT-048), поэтому 048 больше не зависит от 026 и 040.
  - HIGH#2 (недостижимые анимации): FEAT-017 — для MVP все герои, живые герои и комнаты активны в магазине; тест «каждый анимированный товар достижим».
  - HIGH#3 (`/api/setup`): FEAT-004 — одноразовый setup-токен из логов контейнера.
  - HIGH#4 (профили и блокировка): FEAT-004 — доверенные устройства (профили и PIN-вход только с них), экспоненциальная задержка по (аккаунт, IP) вместо блокировки аккаунта; FEAT-028 и FEAT-039 — UI.
  - HIGH#5 (путь в загрузке): FEAT-011 `safePath()` с белым списком; FEAT-012 использует его, тесты на traversal и симлинки.
  - HIGH#6 (история вопросов): FEAT-054 — таблица `questions` с версиями и архивом; FEAT-010 — снимок вопросов в `attempt_questions`; FEAT-012 — переимпорт не снимает публикацию.
  - HIGH#7 (владение): FEAT-049 — сквозная матрица доступа; каждый пункт с маршрутами добавляет строки (в DoD); FEAT-011 — медиа только видимых заданий.
  - HIGH#8 (master.key в бэкапе): FEAT-047 — ключ не в архиве, архив шифруется `age`, ключ хранится отдельно.
  - HIGH#9 (тест из РФ поздно): FEAT-050 в фазе A, с точкой СТОП. FEAT-046 переиспользует его блок Caddy.
  - HIGH#10 (паритет): FEAT-051 — PARITY.md с меткой для каждой строки + скрипт проверки. «Пройти с мамой», ротация и сброс → FEAT-009; режимы просмотра → FEAT-013; разминка и обучение → этап 2.
  - HIGH#11 (дела): FEAT-014 — `chore_completions` с `period_key`, UNIQUE; FEAT-003 — `weekKey`.
  - MED#1 (порядок auth/настроек): 003 → 006 (audit-ядро) → 005 (настройки-ядро) → 004 (auth) → 052 (HTTP настроек). Ключи настроек — по файлам модулей.
  - MED#2 (отмены): FEAT-007 — `reverses_id UNIQUE`, компенсация может увести в минус, ключи строит сервер с префиксом ученика.
  - MED#3 (закрытие, сброс, пересдачи): FEAT-009 — закрытие с наградой через тот же `idem_key`, сбросы через `progress_resets` (epoch); FEAT-010 — `retry_requests` и `retry_grants`, `finish` в одной транзакции; FEAT-041 — очередь просьб.
  - MED#4: FEAT-013 — ручное подтверждение просмотра (watchMode manual); FEAT-041 — детали попыток.
  - MED#5 (накрутка просмотра): FEAT-013 — сессии просмотра, лимит по реальному времени ×1,25, `last_position`, подсказки не засчитываются.
  - MED#6 (серия): FEAT-015 — таблица `streak_days`, запись в транзакции засчитывания.
  - MED#7: FEAT-054 — таблица `transcripts`; FEAT-012 — расшифровка в манифесте.
  - MED#8: FEAT-008 — сид 6 предметов с `key` и `icon`; `subjectKey` в манифесте FEAT-012.
  - MED#9: FEAT-048 — фикстуры 5 уроков и 53 картинки в git, `--videos <папка>`, опциональный `fetch` (yt-dlp); CI не зависит от `QuestClass-Source`.
  - MED#10: FEAT-025 — добавлены QuestionCard, OptionTile, Drawer, Tooltip, IconButton, SegmentedControl; проверка цветов — stylelint (FEAT-001), не тест «по строкам».
  - MED#11: FEAT-026 — бюджет ≤90 МБ, sharp только как devDependency скриптов, MP3 для iOS, видео-празднования → WebP или явное исключение; `.gitattributes` дополнен (FEAT-001).
  - MED#12: FEAT-017 — поле `scene` и Rebound; FEAT-036 — выбор сцены по `scene`, механический DoD (unit-тесты планировщика + e2e без ошибок консоли).
  - MED#13 (порядок web): FEAT-035 и FEAT-038 перенесены раньше экранов; переход по подсказке-фрагменту — в FEAT-031; зависимости экранов исправлены.
  - MED#14: FEAT-024 — реестр типов на web и маршрут `/tasks/:id`; FEAT-008 — `canPublish`.
  - MED#15: FEAT-002 — роль `public` обязательна, реестр маршрутов, лимит тела запроса, проверка Origin; FEAT-049 — тест «все маршруты объявили роль».
  - MED#16: FEAT-004 — токены сессий хранятся как хэш, у админа idle 30 мин и максимум 12 ч, logout.
  - MED#17: FEAT-006 — маскирование секретов в payload.
  - MED#18: FEAT-012 — чанки ≤8 МБ потоком, проверка свободного места, sha256.
  - MED#19: FEAT-046 — `mem_limit`, ротация логов, rollback, владелец тома; FEAT-044 — heap cap, tini; FEAT-003 — снимок перед миграцией.
  - MED#20: FEAT-053 — e2e-стенд со скриншот-базами; ручные сверки оформлены отметкой в PARITY.md и в DoD не входят.
  - MED#21: FEAT-004 — CLI `reset-password`.
  - MED#22: FEAT-020 — просьбы и выдачи — вставки, статусы вычисляются.
  - LOW: учтены `minCorrect` (целое), повтор того же ответа → 200, банк < N, дефолтные причины наград, iOS fullscreen, MP3, SIGTERM и tini, backup без `sqlite3`, токен не в аргументах CLI, без тестов-заглушек, «Сменить ученика» и «Родителям», 3 с на главной, празднование серии, `weekKey`, `seed_key`, «всем активным», ключи по модулям, индексы и UNIQUE. SPEC обновлён: раздача через Node, а не Caddy.

### Critique 2

Критик: независимое ревью (critic-plan), 2026-11-14, итерация 2. Сверка с CLAUDE.md, SPEC §9 (источник), `spec/01` и `spec/02` (только MVP), Critique 1 и «Iteration 2 — Refined», плюс с правилами `execute-plan`: он берёт первый pending-пункт с выполненными `Depends on` и `Requires decision: N` и трогает только файлы из Scope. Порядок проверен скриптом: все `Depends on` в 54 пунктах ссылаются на более ранние пункты, неизвестных id и циклов нет. Применены все четыре линзы: security, performance, quality, ux. У ux находки только LOW, плюс UX-сторона MED по FEAT-014.

**Сверка с Critique 1.** Закрыты в пунктах, а не только в заметках: HIGH#1, #2, #3, #8, #11; MED#1–4, #7, #9, #12, #14, #15, #19–22. Не закрыты или закрыты частично (fix — в пунктах ниже):
- HIGH#9 — гейт FEAT-050 не стоит в `Depends on`;
- HIGH#4 — реальный IP за Caddy;
- HIGH#6 — п. 4: удаление с историей; смена видео после начала просмотра;
- HIGH#5 — offset и файлы манифеста;
- HIGH#7 — закрытые задания, гейт просмотра;
- HIGH#10 — нет подтверждения пользователем;
- MED#5, #6, #8, #10, #11, #13, #16, #17, #18.

- HIGH: [FEAT-050, FEAT-011, FEAT-031] Critique 1 HIGH#9 по сути не закрыт: точка СТОП есть только в тексте DoD. У FEAT-050 `Requires decision: Y`, а `execute-plan` такие пункты пропускает и показывает пользователю, только когда больше выполнять нечего. От FEAT-050 зависит лишь FEAT-046, поэтому видеоцепочка (011, 012, 013, 022, 023, 031, 048) будет построена до проверки из РФ — ровно то, что требовалось предотвратить. Fix: добавить `FEAT-050` в `Depends on` у FEAT-011, остальные звенья цепочки унаследуют. Либо разделить пункт на 050a (подготовка файлов, N) и 050b (сервер и проверка пользователем, Y) и сделать зависимостью 050b.
- HIGH: [FEAT-004, FEAT-002, FEAT-046] [lens: security] Critique 1 HIGH#4 закрыт наполовину: нигде не сказано, откуда брать IP клиента. В проде все запросы приходят с IP контейнера Caddy в `shared_web`. Тогда «общий лимит на IP» блокирует сразу всех, пара (аккаунт, IP) вырождается в аккаунт, и посторонний снова может держать заблокированным единственного админа. Если же слепо верить `X-Forwarded-For`, лимит обходится подделкой заголовка. Тест «чужой IP не блокирует владельца» на фейковых IP пройдёт, а в проде защита работать не будет. Fix: хелпер `clientIp()` в FEAT-002. Он берёт крайний правый адрес из XFF, только если сокет-пир входит в `http.trustedProxies` (настройка; по умолчанию частные диапазоны — порты контейнера наружу не публикуются), а иначе — адрес сокета. Тесты: XFF от недоверенного пира игнорируется; два клиента за доверенным прокси ограничиваются независимо.
- HIGH: [FEAT-008, FEAT-004, FEAT-022] Удаление сущностей с историей не определено (Critique 1 HIGH#6, п. 4). FEAT-008 даёт «админ-CRUD предметов и заданий», FEAT-004 — «админ-CRUD учеников». При `foreign_keys=ON` (FEAT-003) на эти строки ссылаются ledger, task_progress, attempts, purchases, watch_progress и chore_completions. Без правил DELETE либо падает с 500, либо при CASCADE стирает историю и строки ledger, что нарушает правило 4. Чеклист `spec/01` требует: урок удаляется, только если не начат; предмет — только пустой. Кроме того, FEAT-008 и FEAT-022 опираются на «активных учеников», но признака активности в `users` нет. Fix: `archived_at` у tasks, subjects и users. DELETE — только без зависимых строк, иначе 409 «архивируйте». Явный `ON DELETE RESTRICT`, без CASCADE на ledger и прогрессе. Архивные ученики не входят в «все активные». Тесты на каждое правило.
- HIGH: [FEAT-007…021, FEAT-029…044, FEAT-051] В Scope нет общих точек регистрации. `execute-plan` трогает только файлы из Scope и в остальных случаях ставит `blocked: scope expansion`. Общее требование из HTML-комментария к `## Items` в Scope не входит. Чего не хватает:
  - строк матрицы в `apps/api/test/access-matrix.test.ts` — во всех пунктах с «Строки FEAT-049»;
  - монтирования маршрутов в `apps/api/src/app.ts`;
  - регистрации ключей настроек (`settings/registry.ts` или barrel) — в 007, 009, 010, 013, 015, 022;
  - реестров типов: `packages/shared/src/tasks/registry.ts` и `apps/api/src/task-types/registry.ts` (010, 013, 014), `apps/web/src/task-types/registry.ts` (030–032, 040);
  - `apps/web/src/app/router.tsx`: нет `/progress` (037), `/wishes` (033), подмаршрутов админки (039–043);
  - `packages/ui/src/index.ts` и `UiGallery.tsx` — в 031, 035, 038; у 035 галерея прямо в DoD;
  - запуска сидов и планировщика в `apps/api/src/index.ts` (008, 016, 017, 022), подключения `static.ts` в `app.ts` и команды в `cli/index.ts` (044);
  - `scripts/parity-check.mjs` и правки `FEATURE_PLAN.md` в FEAT-051;
  - `modules/attempts/service.ts` в FEAT-013 (гейт попытки) и `features/attempts/*` в FEAT-031 (кнопка подсказки в результате теста).

  Fix: вписать эти файлы в Scope каждого пункта. Либо в FEAT-002, 008, 024, 025 и 049 ввести авто-регистрацию через файлы-соглашения (например, матрица собирает `test/access/*.rows.ts`) и указать эти per-item файлы в Scope.
- HIGH: [FEAT-054, FEAT-010, FEAT-013, FEAT-006, FEAT-019] Конфликт с обязательным правилом 1 CLAUDE.md: «JSON-колонки только для type-specific `config` заданий и значений `settings`». План прямо предписывает `questions.options json`, `questions.evidence json`, `transcripts.segments json`. Неявно в JSON попадают ещё снимок в `attempt_questions`, объединённые интервалы `watch_progress`, payload `audit_log` и, вероятно, снимок покупки. Исполнитель упрётся в правило. Fix (`Requires decision: Y`), один из двух вариантов:
  - (а) пользователь вносит в правило 1 явный список разрешённых неизменяемых JSON-значений: варианты и evidence вопроса, снимки попытки и покупки, сегменты расшифровки, интервалы, payload аудита;
  - (б) нормализовать схему: `question_options(question_id, idx, text, image_ref)`, колонки `evidence_start`, `evidence_end`, `evidence_quote`, таблицы `transcript_segments`, `watch_intervals`, `attempt_question_options`.

- MED: [FEAT-049, FEAT-006] DoD FEAT-049 обещает покрыть чужие попытки, медиа черновиков, кошелёк, желания и персонаж. Этих маршрутов к моменту FEAT-049 ещё нет: их делают 007, 010, 011, 020, 021. А уже существующие маршруты (health, setup, auth, profiles, users, devices, settings, secrets, audit) в DoD не названы. `GET /api/admin/audit` (FEAT-006) объявлен раньше FEAT-004, поэтому проверить его HTTP-тестом под админом нельзя: сессий ещё нет. Fix: в FEAT-006 оставить сервис и redact, маршрут audit перенести в FEAT-052 или FEAT-043. DoD FEAT-049 — строки для существующих маршрутов, а строки по ресурсам — в DoD пунктов 007, 010, 011, 020, 021.
- MED: [FEAT-002, FEAT-011, FEAT-004] [lens: security] `route({role})` допускает только одну роль. Но `GET /api/media/:id/*` нужен и ученику, и админу (в FEAT-011 «админ — любое», в FEAT-040 — предпросмотр evidence), logout — обоим, а `GET /api/auth/profiles` — гостю, но только с device-cookie. Придётся объявлять такие маршруты `public` и проверять доступ вручную, мимо гарда и матрицы. Fix: `roles: Role[]` и отдельный гард `device`. Тест 1 в FEAT-049 принимает набор ролей, матрица проверяет каждую.
- MED: [FEAT-004] Конфликт с правилом 2 («Чтение никогда не пишет в БД»). Скользящий idle-таймаут `session.adminIdleMinutes` требует писать `last_seen` при каждом GET. Fix: держать `lastSeen` в памяти процесса (Map; после рестарта нужен повторный вход, это допустимо) или продлевать сессию только на изменяющих запросах. Тест: GET не меняет строку `sessions`.
- MED: [FEAT-004, FEAT-027, FEAT-028] [lens: security] Если cookie админа и ученика раздельные, после сценария «админ включил детское устройство → ученик вошёл по PIN» и после входа через «Родителям» в браузере ребёнка ещё до 30 минут живёт админ-сессия. Ребёнок может открыть `/admin` и начислить себе монеты. «Одна роль на браузер» из Critique 1 MED#16 не закрыта. Токен доверенного устройства (180 дней) не объявлен хэшированным. Fix: одна сессионная cookie на браузер — вход по PIN отзывает админ-сессию, logout админа возвращает к выбору профиля. В `trusted_devices` хранить sha256 токена. Тесты.
- MED: [FEAT-006, FEAT-052, FEAT-004] [lens: security] Critique 1 MED#17 закрыт формально. Маска по именам ключей `/password|pin|secret|token|key/i` пропускает тело `PUT /api/admin/secrets/:key {value}`: ключ называется `value`, поэтому сырой секрет попадёт в `audit_log` и в бэкапы. При этом та же маска закрывает `key`, `subjectKey` и `seed_key`, и в аудите настроек не видно, какой ключ меняли. Fix: payload по allowlist для каждого действия, для секрета — только `{key, isSet:true}`. HTTP-тесты: после PUT секрета, смены пароля или PIN и создания токена импорта сырого значения нет ни в одной строке `audit_log`.
- MED: [FEAT-012] [lens: security] Остаток HIGH#5. Не сказано, что `offset` строго равен текущему размеру файла, а принимаются только пути из манифеста не больше заявленного `size`. До `complete` владелец токена может плодить файлы без ограничений и перезаписывать середину. Тест на `%2e%2e` не заявлен. Fix: в DoD — offset ≠ размер → 409, путь не из манифеста → 404, превышение `size` → 413, лимит числа файлов на медиа. Тесты на каждое правило, включая `%2e%2e`.
- MED: [FEAT-012, FEAT-054, FEAT-022] Переимпорт опубликованного урока сразу пишет новые версии вопросов в живой банк:
  - ревью админа (SPEC §5 шаг 8) обходится;
  - правки админа затираются версией из LLM;
  - медиа подменяется во время просмотров, хотя чеклист `spec/01` говорит: «нельзя менять видео после начала просмотра»;
  - `watch_progress` привязан к заданию, а не к медиа, и процент считается по чужой длительности;
  - старое медиа FEAT-022 удалит в ближайший часовой запуск.

  Fix: если задание опубликовано или по нему есть просмотры, импорт отвечает 409 либо создаёт вопросы-кандидаты, которые админ принимает в FEAT-040. Вопрос, правленный админом, импорт не перезаписывает. Медиа после начала просмотров не меняется. Тесты.
- MED: [FEAT-011, FEAT-012, FEAT-022, FEAT-047] Две проблемы модели медиа.
  - (1) В `media` нет связи с заданием. FEAT-011 не может проверить «медиа видимого задания»: `mediaId` появится только в config `video_lesson` (FEAT-013, позже), а искать по JSON-config в общем коде запрещает правило 10.
  - (2) Картинки вопросов и вариантов (`image_ref`; в сиде их 53, у уроков математики и ИЗО) по манифесту, по-видимому, лежат в том же медиа, что и видео. Ретеншн FEAT-022 удалит их вместе с видео, а бэкап FEAT-047 («видео не копируются») их не сохранит.

  Fix: `media.task_id` (FK), видимость — через join. Картинки вопросов — отдельная запись `kind=image`. Ретеншн удаляет только `hls|mp4`, бэкап включает `kind=image`. Тест: после ретеншна картинки вопросов по-прежнему отдаются.
- MED: [FEAT-018, FEAT-017, FEAT-033] Загруженные админом картинки товаров ученик получить не может. В FEAT-018 нет маршрута чтения, а `/api/media/:id/*` (FEAT-011) отдаёт ученику только медиа заданий. Fix: `GET /api/uploads/:id` в FEAT-018 для ролей learner и admin; ученику — только загрузки, на которые ссылается активный или купленный им товар. Ссылка `upload:<id>` в каталоге (FEAT-017) и строки матрицы.
- MED: [FEAT-008, FEAT-010, FEAT-013, FEAT-014] [lens: security] Серверные гейты мутаций ученика неполные (остаток HIGH#7):
  - (а) доступность из FEAT-009 (sequential, rotation, `release_at`) не проверяется при старте попытки, создании сессии просмотра и отметке дела — закрытый урок проходится через API;
  - (б) порог просмотра в режиме `percent` проверяет только клиент (FEAT-031), сервер требует подтверждения лишь при `manual`;
  - (в) в контракте типа (FEAT-008) нет хука под такую проверку. Значит, логика `video_lesson` уйдёт в общий `modules/attempts`, а это нарушает правило 10. Модули `modules/watch` и `modules/chores` к тому же лежат вне `src/task-types/<type>/` из раздела «Структура».

  Fix: добавить в контракт `canStart(learner, task, ctx) → ok | code` и вызывать его из сервиса попыток. Общий `assertTaskAvailable()` использовать в 010, 013 и 014. Перенести watch и chores в `task-types/video_lesson` и `task-types/chore`. Строки матрицы «закрытое задание → 409».
- MED: [FEAT-013] [lens: security] Остаток MED#5. Лимит «×1,25 реального времени» считается на одну сессию, а число параллельных сессий не ограничено. Две-три вкладки на разных местах ролика набирают просмотр в 2–3 раза быстрее. Fix: новая сессия закрывает прежнюю, пачка от закрытой сессии получает 409. Тест.
- MED: [FEAT-015, FEAT-010] Остаток MED#6. День серии записывается «в транзакции засчитывания», то есть только при зачёте. В оригинале (`spec/01` §2.19, `spec/02` §2.4) день засчитывает завершённая попытка с любым результатом по уроку с засчитанным просмотром: «Ошибки не мешают серии». С порогом 2/3 поведение молча меняется. Не сказано и то, считаются ли дела и админское «закрыть». Fix: зафиксировать правило в DoD. По умолчанию — как в оригинале: `finish` любой попытки `quiz` или `video_lesson`, дела и `close` не в счёт. Либо `Requires decision: Y`. Тесты: проваленная попытка засчитывает день, дело — нет.
- MED: [FEAT-014, FEAT-032] [lens: ux] Отклонённое дело нельзя сдать повторно в том же периоде из-за `UNIQUE(learner, task, period_key)`, а дело с `repeat=once` блокируется навсегда. Ребёнок видит «Не засчитано: комментарий» и не может ничего сделать. Fix: повторное «Я сделал» переводит ту же строку из `rejected` в `pending` — одно изменение строки, правило 1 соблюдено. Тесты на `once` и `daily`.
- MED: [FEAT-051, FEAT-009] Остаток HIGH#10. Метки «Не переносить» и «Этап 2» — продуктовые решения, но у пункта `Requires decision: N`, и исполнитель заполнит таблицу без пользователя. Уже принятая метка «Пройти с мамой → FEAT-009 (переоткрыть)» теряет суть пункта чеклиста `spec/01`: отмена прежней награды, награда по новому результату, без видео. С единственным `idem_key = task:<t>:learner:<l>:pass` после отмены награды ни переоткрытие, ни сброс её больше не дадут. Fix: `Requires decision: Y` на утверждение таблицы. Для «с мамой» — отдельное действие (reverse прежней строки, ключ `…:pass:<epoch>`, попытка без гейта просмотра) либо явная метка «Покрыто иначе, пересчёт награды теряется», подтверждённая пользователем.
- MED: [FEAT-008, FEAT-026] Остаток MED#8. `subjects.icon` ссылается на ассеты из `game/subjects-pixel`, но в `mvp-assets.txt` этой папки нет, хотя в исходнике она есть (3,7 МБ). Нет и `game/report-robux.svg` для Robux (FEAT-033, FEAT-042). Сид предметов в FEAT-008 выполняется раньше манифеста FEAT-026, проверить ключи нечем. Правила «имя уникально без учёта регистра» нет. Fix: дополнить список FEAT-026. В FEAT-017 (после 026) — тест «каждый `subjects.icon` есть в манифесте». В FEAT-008 — UNIQUE по `lower(name)` с тестом.
- MED: [FEAT-025, FEAT-029, FEAT-031, FEAT-034, FEAT-036, FEAT-040…042] Правило 8 (остаток MED#10).
  - В FEAT-025 по-прежнему нет компонентов: Accordion/Disclosure (раскрывающаяся серия в 029), Slider (громкость и высота полосы в 031), DateTimeInput (дата открытия в 040), Textarea (текст вопроса в 040, комментарий отказа в 041), FileInput (импорт JSON в 040, загрузки в 042), Checkbox.
  - В Scope экранных пунктов нет `packages/ui`, добавить компоненты им некуда.
  - FEAT-034 и FEAT-036 кладут визуальные элементы в `apps/web/src/features`: Scene, Ribbon, DressEffect и 5 сцен комнат со слоями и keyframes. Это CSS под страницу мимо `packages/ui` и `/dev/ui`.

  Fix: дополнить список FEAT-025. Визуальную часть сцен, ленты и эффекта вынести в `packages/ui` с записью в галерее (в Scope 034 и 036), в `features` оставить только логику: планировщик и аудио.
- MED: [FEAT-021] Конфликт с правилом 6. Стартовые `blue`, `purple` и `room-default` зашиты в сервис персонажа. Fix: флаг `starter` в `catalog.json` (FEAT-017); принадлежит ученику всё со `starter` плюс покупки. Тест: смена флага в сиде меняет стартовый набор без правки кода.
- MED: [FEAT-026] Остатки MED#11 и MED#9:
  - (1) sharp — новая зависимость вне стека CLAUDE.md, флага решения нет;
  - (2) при варианте «видео-празднование — явное исключение в `.gitignore`» образ из CI окажется без ролика серии (FEAT-038);
  - (3) тест «повторный запуск даёт тот же результат» в `apps/web/test/assets.test.ts` требует `QuestClass-Source`, поэтому `pnpm test` в CI (FEAT-045) упадёт.

  Fix: `Requires decision: Y` на sharp и бюджет. Ролик — только animated WebP. Детерминизм проверять на фикстурах `scripts/assets/test/fixtures/`, в CI — тест согласованности «манифест ↔ файлы».
- MED: [FEAT-031, FEAT-048, FEAT-053, FEAT-001] Конфликт с CLAUDE.md «Git: не коммитить видео». e2e плеера нужна HLS-фикстура, тесту сида — «маленькое сэмпл-видео», а FEAT-001 даже добавляет `*.mp4 binary` в `.gitattributes`. Защиты в `.gitignore` нет. Fix: генерировать фикстуру в тесте или CI (`ffmpeg -f lavfi testsrc` только на CI и ПК; правило 13 касается сервера). Либо по решению пользователя внести в CLAUDE.md исключение для `**/test/fixtures/**` до 1 МБ. В FEAT-001 добавить в `.gitignore` `*.mp4`, `*.ts` и `*.m4s` вне fixtures.
- MED: [FEAT-053, FEAT-045] Скриншот-базы в `e2e/__screenshots__` будут создаваться на Windows-ПК, а CI работает на Linux. Шрифты рендерятся иначе, а шаблон имён Playwright по умолчанию содержит `{platform}`, так что в CI баз просто не окажется. DoD FEAT-045 «первый прогон зелёный» не выполнится. Fix: создавать и сверять базы только в контейнере `mcr.microsoft.com/playwright:<версия>` (скрипт `pnpm e2e:update` через docker), `snapshotPathTemplate` без `{platform}`.
- MED: [FEAT-044, FEAT-046, FEAT-012] [lens: performance] Бюджет RAM ничем не обеспечен (остаток MED#18). При `--max-old-space-size=160` с young gen и нативной памятью (better-sqlite3, буферы потоков) RSS дорастёт примерно до 230 МБ и выше раньше, чем сработает лимит кучи. Правило 13 требует ≤200. RSS меряют только в простое и «после прогрева» (прогрев не определён), под нагрузкой — никогда. Fix: `--max-old-space-size=112 --max-semi-space-size=8`, `mem_limit` около 230m. В DoD FEAT-012 и FEAT-044: `measure-rss` под сценарием «загрузка 50 МБ чанками + 10 параллельных читателей HLS» < 180 МБ.
- MED: [FEAT-046, FEAT-003] `deploy.sh rollback` возвращает прежний тег, но миграции идут только вперёд. Старый код на новой схеме может упасть, а снимок из FEAT-003 при откате не используется. Fix: rollback = остановить, восстановить снимок, сделанный перед миграцией этого деплоя (если миграции применялись), запустить прежний тег. Либо правило expand-only для миграций MVP. Проверить откат с миграцией на стенде.
- MED: [FEAT-017, FEAT-029, FEAT-025…042] `Depends on` неполные, и держится всё только на порядке в файле. `execute-plan` выбирает первый пункт с выполненными зависимостями, поэтому если заблокируется HIGH-риск-пункт (004, 031) или пункт с решением, следующие уйдут вперёд. Пробелы:
  - FEAT-017 (админ-CRUD, строки матрицы) не зависит ни от 004, ни от 049;
  - FEAT-029 не зависит от 021 — герой на карточке (остаток MED#13);
  - ни один пункт с e2e в DoD (025, 027–042) не зависит от FEAT-053.

  Fix: добавить `FEAT-049` в FEAT-017, `FEAT-021` в FEAT-029, `FEAT-053` в FEAT-025 (экраны унаследуют через 025 и 027).

- LOW: [global] Summary так и не заполнен: «Total items: (заполняется)», «Critic iterations: 0». Должно быть 54 пункта; decision — 050, 046, 047 и новые из этой критики.
- LOW: [FEAT-054] Примеры для `importText.ts` берутся из README оригинала, которого нет ни в git, ни в CI. Скопировать их в `packages/shared/test/fixtures/`.
- LOW: [FEAT-009] [lens: quality] Пути для `close`, `reopen` и `reset` не заданы. Чтобы не вышел свитч по `action` (правило 3), нужны ресурсы: `POST …/closures`, `…/reopenings`, `…/progress-resets`.
- LOW: [FEAT-049] Тест 1 видит только реестр `route()`. Маршрут, добавленный напрямую через `app.get`, он пропустит. Сравнивать с фактической таблицей маршрутов Hono.
- LOW: [FEAT-010] Требование `canPublish` (банк ≥ `quiz.questionsPerAttempt`) указано только у `video_lesson`, у `quiz` его нет.
- LOW: [FEAT-013, FEAT-041] Подтверждение просмотра админом есть только при `watchMode=manual`. Случаи из MED#4 («видео не грузится», «смотрел вне приложения») в режиме `percent` закрываются только через `close`. Разрешить подтверждение в любом режиме.
- LOW: [FEAT-004] [lens: security] `reset-password` должен отзывать сессии пользователя и писать в audit.
- LOW: [FEAT-011] [lens: security] Случайные id медиа (UUID), как предлагал Critique 1 HIGH#7, — дополнительная защита от перебора.
- LOW: [FEAT-050] [lens: security] Публичный файл на 100 МБ без авторизации проживёт до FEAT-046. Остановить спайк-контейнер сразу после проверки. Прописать явный откат Caddyfile из `.bak`, если `validate` не прошёл.
- LOW: [FEAT-044] Порог «образ < 250 МБ» не проверить: не сказано, сжатый размер или распакованный. Ассеты — до 90 МБ, `node:22-slim` в распакованном виде ≈ 200 МБ. Указать метрику (`docker image inspect .Size` или размер в GHCR) и реалистичный порог.
- LOW: [FEAT-025, FEAT-035] [lens: quality] «Каждый компонент в 5 состояниях» и «в галерее проигрываются все анимации» механически не проверяются. Сделать e2e галереи по перечню `data-testid` из реестра компонентов и манифеста.
- LOW: [FEAT-028, FEAT-039] [lens: ux] «Сделать устройство детским» есть и в `TrustDevice.tsx` (028), и в `Devices.tsx` (039). Оставить экран в одном пункте, во втором — только ссылку.

Итог: HIGH 5 · MED 23 · LOW 12. Вердикт: refine required — переработать план (Iteration 3) и запустить критику повторно.

### Iteration 3 — Refined
- Правки точечные, ID и порядок сохранены; новых пунктов нет. Скрипт подтверждает: все 54 `Depends on` ссылаются на пункты выше по файлу, циклов нет.
- CLAUDE.md уточнён (решение планировщика, пользователь может отменить):
  - правило 1 — JSON разрешён для объектов-значений одной строки, которые не участвуют в SQL;
  - правило 2 — idle-таймаут сессии без записи в БД, миграции только расширяющие, история не удаляется (`RESTRICT`, деактивация и архив);
  - правило 13 — dev-инструменты не попадают в образ;
  - правило 14 — видеофикстуры генерируются при подготовке тестов, скриншот-базы — только в Linux-контейнере.
- Addresses Critique 2:
  - HIGH#1: FEAT-031 зависит от FEAT-050 (и FEAT-046 уже зависит); в DoD FEAT-050 — «выполняется первым».
  - HIGH#2: FEAT-002 — `clientIp()` с доверенными прокси (`http.trustedProxies`, по умолчанию приватные сети Docker); FEAT-004 — блокировка по `clientIp()`, тест с разными XFF за прокси.
  - HIGH#3: CLAUDE.md 2 (`RESTRICT`, деактивация и архив); FEAT-004 — `users.active`, последнего админа нельзя деактивировать; FEAT-008 — физическое удаление только без истории, иначе 409 и архив.
  - HIGH#4: в шапке Items список «Общие точки регистрации» — в них можно только добавлять строки.
  - HIGH#5: CLAUDE.md 1 расширен (объекты-значения). Перечисленные JSON-колонки подходят под (б).
  - MED#1: FEAT-049 покрывает маршруты, существующие на момент пункта (включая audit); HTTP-тест audit перенесён в 049.
  - MED#2: `route({roles: Role[]})`.
  - MED#3: idle-таймаут через подписанную cookie, GET не пишет (тест).
  - MED#4: одна сессия на браузер (вход ученика завершает админ-сессию); токен доверенного устройства хэшируется.
  - MED#5: `auditPayload(action, data)` со схемой полей; у секретов только `{key,isSet}`; маска `password|pin|token|value`.
  - MED#6: FEAT-012 — `offset` = текущий размер, только файлы из манифеста, размер ≤ заявленного, URL-декодирование до `safePath`.
  - MED#7: FEAT-012 — ревизии `task_revisions` для опубликованных уроков; FEAT-054 — правки админа импорт не перезаписывает, они уходят в конфликты.
  - MED#8: FEAT-011 — `media.task_id` и `media.role`; ретеншн удаляет только `video`; картинки вопросов идут в бэкап.
  - MED#9: FEAT-018 — `GET /api/uploads/:id` для ученика и админа.
  - MED#10: FEAT-008 — хук `canStart`, модули типов в `task-types/<type>/`; FEAT-010 и FEAT-013 проверяют доступность и порог на сервере.
  - MED#11: FEAT-013 — одна активная сессия просмотра на (ученик, задание).
  - MED#12: FEAT-015 — день засчитывается за любую завершённую попытку, как в оригинале.
  - MED#13: FEAT-014 — частичный UNIQUE, после отклонения можно сдать заново.
  - MED#14: FEAT-051 — колонка «нужно решение»; FEAT-009 — `reopen` с доплатой до лучшего результата (topup по epoch).
  - MED#15: FEAT-026 — добавлены `subjects-pixel`, `subjects.png`, `report-robux.svg`; FEAT-008 — уникальное имя предмета.
  - MED#16: FEAT-025 — Checkbox, Slider, Textarea, DateTimeInput, FileInput, Accordion; визуал сцен и примерочной перенесён в `packages/ui` (FEAT-034, FEAT-036).
  - MED#17: FEAT-017 — флаг `starter` в сиде; FEAT-021 берёт стартовые предметы из каталога.
  - MED#18: sharp покрыт CLAUDE.md 13; ролик серии → анимированный WebP; тест детерминизма пропускается в CI.
  - MED#19: видеофикстуры генерируются ffmpeg в FEAT-053.
  - MED#20: скриншот-базы — только в Linux-контейнере Playwright.
  - MED#21: heap 96 МБ + замер RSS под нагрузкой (`scripts/load.mjs`) < 200 МБ.
  - MED#22: миграции только расширяющие → откат безопасен; `restore-snapshot` для крайнего случая.
  - MED#23: FEAT-017 зависит и от 004, 049; FEAT-029 — и от 021, 053; FEAT-053 добавлен в зависимости всех 16 пунктов, у которых в DoD есть e2e.

### Critique 3

Критик: независимое ревью (critic-plan), 2026-11-14, итерация 3, последняя. С чем сверялся план:
- CLAUDE.md (правила 1, 2, 13, 14 в редакции итерации 3);
- SPEC §9, только MVP;
- Critique 2 и «Iteration 3 — Refined»;
- правило `execute-plan`: он трогает только файлы из Scope и из «Общих точек регистрации».

Скрипт порядка проверил 54 пункта. Все `Depends on` ссылаются на пункты выше по файлу; неизвестных id, дублей и циклов нет. `Requires decision: Y` стоит у 050, 046 и 047. Каждый пункт, у которого в DoD есть e2e, зависит от FEAT-053 напрямую или транзитивно.

Линзы:
- security — MED (trustedProxies) и LOW (отзыв устройства);
- performance — только LOW (остаток MED#21);
- quality — HIGH (порядок 012/013) и MED по Scope;
- ux — только LOW (подтверждение сброса).

**Сверка с Critique 2.** Закрыты в тексте пунктов:
- HIGH#1 — FEAT-031 «**Depends on**: FEAT-030, FEAT-013, FEAT-050, FEAT-053», FEAT-046 «FEAT-045, FEAT-050». Серверная часть видео (011–013, 022, 023, 048) по-прежнему строится до проверки из РФ. Но запасной путь из SPEC §4 (прокси в РФ) серверный код не меняет, поэтому отклонение принимается.
- HIGH#3 — CLAUDE.md 2: «FK `ON DELETE RESTRICT`. Пользователи деактивируются, задания и предметы архивируются». FEAT-004: «`users.active`; удаления нет — только деактивация». FEAT-008: «Если история есть… — 409 с предложением архивировать… FK — `RESTRICT`».
- HIGH#5 — CLAUDE.md 1(б): «варианты ответа и evidence вопроса, снимок вопроса в попытке, сегменты расшифровки, payload аудита, объединённые интервалы просмотра».
- MED#1 — FEAT-049: «покрывает все существующие маршруты: health, setup, auth, users, settings, secrets, audit». FEAT-006: «HTTP-тест маршрута — в FEAT-049».
- MED#2 — FEAT-002: «`route({method, path, roles: Role[], handler})`».
- MED#3 — FEAT-004: «idle… ведётся подписанной cookie активности… **без записи в БД**… (тесты: GET не пишет в БД)».
- MED#4 — FEAT-004: «одновременно в браузере живёт одна сессия (тест)», «`trusted_devices` (токен хранится как sha256)».
- MED#5 — FEAT-006: «`auditPayload(action, data)` со схемой разрешённых полей на каждое действие. Для секретов пишется только `{key, isSet}`».
- MED#6 — FEAT-012: «`offset` обязан равняться текущему размеру файла, иначе 409», «принимаются только файлы, заявленные в манифесте, и не больше заявленного размера», «тест на `%2e%2e`, `..%2f`».
- MED#9 — FEAT-018: «`GET /api/uploads/:id` (роли learner и admin)».
- MED#10 — FEAT-008: «`canStart(ctx) → ok | {code, message}` (api). Модули типа… живут в `apps/api/src/task-types/<type>/`». FEAT-010: «Старт попытки проверяет доступность (FEAT-009) и `canStart` типа». FEAT-013: «`canStart` в режиме `percent` проверяет процент на сервере».
- MED#11 — FEAT-013: «активна только одна на (ученик, задание), новая закрывает прежнюю».
- MED#12 — FEAT-015: «день засчитывается за **любую завершённую попытку** учебного задания».
- MED#13 — FEAT-014: «Частичный UNIQUE… после отклонения можно сдать снова (новая строка), в том числе для `once`».
- MED#15 — FEAT-026: «`game/subjects-pixel`, `game/subjects.png`, `game/report-robux.svg`». FEAT-008: «`key` и `name` уникальны».
- MED#16 — FEAT-025: «…Checkbox, NumberInput, Slider, Textarea, DateTimeInput, FileInput, Accordion…». FEAT-034: «`packages/ui/src/hero/{Scene.tsx,Ribbon.tsx,DressEffect.tsx}`». FEAT-036: «`packages/ui/src/scenes/…`».
- MED#17 — FEAT-017: «помечены `starter: true` в сиде… в коде их id нет». FEAT-021: «берутся из каталога по флагу `starter`».
- MED#18 — CLAUDE.md 13: «Dev-инструменты (sharp, ffmpeg, Playwright)… как devDependencies». FEAT-026: «ролик серии → анимированный WebP; MP4 в git нет», «в CI пропускается с пометкой».
- MED#19 — FEAT-053: «Видеофикстуры… генерируются в `global-setup`… в git их нет».
- MED#20 — FEAT-053: «создаются только в Linux-контейнере `mcr.microsoft.com/playwright`».
- MED#21 — FEAT-044: «`NODE_OPTIONS=--max-old-space-size=96`… Под нагрузкой (`scripts/load.mjs`…) — < 200 МБ».
- MED#22 — CLAUDE.md 2: «Миграции только **расширяющие**». FEAT-046: «предыдущий образ работает на новой схеме… `deploy.sh restore-snapshot`».
- MED#23 — подтверждено скриптом: у FEAT-017 «FEAT-026, FEAT-005, FEAT-004, FEAT-049», у FEAT-029 «…FEAT-021, FEAT-035, FEAT-053».

Закрыты частично (остаток — в пунктах ниже):
- HIGH#2 — default `http.trustedProxies` задан противоречиво;
- HIGH#4 — FEAT-051 и FEAT-031;
- MED#7 — у принятия ревизии нет владельца;
- MED#8 — бэкап картинок вопросов;
- MED#14 — таблицу PARITY не утверждает пользователь (разобрано вместе с HIGH#4).

Мелкие остатки MED#5, #9, #10, #15 и #21 — в LOW.

- HIGH: [FEAT-012, FEAT-013, FEAT-022, FEAT-023, FEAT-048] Новая ошибка порядка. FEAT-012 создаёт и обновляет задания типа `video_lesson`: в манифесте есть `media`, «новое задание создаётся как `draft`», ревизия создаётся «для **опубликованного**». Но FEAT-012 идёт раньше FEAT-013, а регистрирует этот тип (`configSchema`, `publicConfig`, `canPublish`, `config.mediaId`) именно FEAT-013. На момент FEAT-012 в реестре есть только `quiz`. Последствия:
  - создание задания не пройдёт валидацию config;
  - тесту ревизии нужен опубликованный урок, а `canPublish` для него ещё нет;
  - запись `config.mediaId` из `modules/import` переносит логику типа в общий код (правило 10).

  Исполнитель либо выйдет за Scope (`task-types/video_lesson/*`) и получит `blocked`, либо обойдёт реестр. Fix:
  - поменять местами FEAT-013 и FEAT-012; у FEAT-012 Depends on: FEAT-013, FEAT-054, FEAT-052;
  - манифест превращается в config через хук типа `fromImport(manifest, mediaId) → config`. В Scope FEAT-012 добавить `packages/shared/src/tasks/contract.ts` (необязательный хук) и `apps/api/src/task-types/video_lesson/import.ts`;
  - тесты FEAT-013 создают медиа через сервис медиа сразу в статусе `ready`;
  - в Depends on у FEAT-022 добавить FEAT-012: там удаляется «медиа, заменённое переимпортом».

- MED: [FEAT-002, FEAT-005, FEAT-004, FEAT-046] [lens: security] Остаток HIGH#2: default задан двумя разными способами. FEAT-002: «По умолчанию доверенные — приватные сети Docker (`172.16.0.0/12`, `10.0.0.0/8`); переопределяется ключом `http.trustedProxies`». FEAT-005: «`http.trustedProxies`=[]». Что из этого следует:
  - связать настройку с `clientIp()` некому: файла `apps/api/src/http/clientIp.ts` нет в Scope ни FEAT-005, ни FEAT-004;
  - если `[]` понять буквально, в проде у всех запросов будет IP Caddy. Тогда «общий лимит на IP» и пара (аккаунт, IP) снова позволяют постороннему держать админа заблокированным;
  - тест FEAT-004 «за доверенным прокси с разными XFF» сам настраивает прокси, поэтому default не проверяет;
  - после подсетей `172.17–31` Docker выдаёт подсети из `192.168.0.0/16`, а этого диапазона в списке нет.

  Fix:
  - один default-список в shared: `["10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]`. Его используют и `clientIp()` в FEAT-002, и `core.ts` в FEAT-005;
  - добавить `apps/api/src/http/clientIp.ts` в Scope FEAT-005;
  - тест в FEAT-004 на настройках по умолчанию: пир `172.18.0.5`, разные XFF → лимиты независимы;
  - в DoD FEAT-046: подсеть из `docker network inspect shared_web` входит в список.
- MED: [FEAT-051, FEAT-031, FEAT-024, FEAT-030] Остаток HIGH#4 и MED#14. Scope по-прежнему не позволяет выполнить DoD, и `execute-plan` поставит `blocked: scope expansion`.
  - FEAT-051. DoD требует `scripts/parity-check.mjs` и «пункты дописываются в план», а в Scope только `docs/PARITY.md`. Гейт «до старта фазы C» механически не работает: ни один пункт фазы C не зависит от 051. Строки с «Нужно решение = Y» пользователь так и не увидит, потому что у пункта `Requires decision: N`.
  - FEAT-031. «Подсказка из результата теста открывает фрагмент», но кнопка живёт в результате теста: `apps/web/src/task-types/quiz/Result.tsx` и `apps/web/src/features/attempts/*` (FEAT-030). Этих файлов нет в Scope 031.

  Fix:
  - в Scope FEAT-051 добавить `scripts/parity-check.mjs` и `FEATURE_PLAN.md`; поставить `Requires decision: Y` (утверждение строк с Y); в Depends on у FEAT-024 добавить FEAT-051;
  - в DoD FEAT-030 — слот `renderHint(evidence)` в Result, либо добавить `apps/web/src/features/attempts/*` в Scope FEAT-031.
- MED: [FEAT-015, FEAT-022, FEAT-009, FEAT-013] Новые пробелы Scope того же рода.
  - FEAT-015: день засчитывается и «за закрытие админом с зачётом», но `close` уже реализован в FEAT-009 (`apps/api/src/modules/progress/service.ts`). Этого файла нет в Scope 015.
  - FEAT-022: «Тест удалённого видео проходится без просмотра» требует правки `apps/api/src/task-types/video_lesson/canStart.ts` из FEAT-013. Этого файла нет в Scope 022.

  Fix:
  - добавить `apps/api/src/modules/progress/service.ts` в Scope FEAT-015;
  - правило «`media.status=deleted` → `canStart` ok без просмотра» перенести в DoD FEAT-013, в FEAT-022 оставить только тест.
- MED: [FEAT-012, FEAT-040, FEAT-013, FEAT-022, FEAT-049] Остаток MED#7: у принятия ревизии нет владельца. FEAT-012: «Ученики продолжают видеть текущее, пока админ не примет ревизию в FEAT-040». Но FEAT-040 — только web: в Scope нет API, а в DoD о ревизиях ничего нет. Что из этого следует:
  - ни один пункт не объявляет эндпоинт принятия или отклонения и не добавляет строки FEAT-049;
  - не описано, что делает принятие: включить pending-версии вопросов, архивировать заменённые, переключить `config.mediaId` и `media.task_id`, пометить старое медиа для FEAT-022;
  - повторный импорт опубликованного урока заходит в тупик, хотя SPEC §5 шаг 7 требует: «повторный импорт того же урока его обновляет»;
  - не закрыт пункт `spec/01` «нельзя… менять видео после начала просмотра». У `watch_progress` UNIQUE `(learner, task)`, поэтому после замены медиа процент, интервалы и `last_position` старого ролика применяются к новому.

  Fix:
  - в DoD FEAT-012 (после переноса за 013): `POST /api/admin/task-revisions/:id/acceptance` и `…/rejection` (admin, audit, строки FEAT-049); принятие выполняется одной транзакцией;
  - в FEAT-013 — `watch_progress` UNIQUE `(learner, task, media_id)`. Принятие ревизии с новым видео при существующих просмотрах без `confirmWatchReset` → 409;
  - в DoD FEAT-040 — экран ревизии: изменения вопросов, конфликты, «Принять / Отклонить»; e2e «переимпорт опубликованного → принять → ученик видит новые вопросы».
- MED: [FEAT-047, FEAT-011, FEAT-018] Остаток MED#8: при восстановлении теряются данные. FEAT-011 обещает: «картинки вопросов и загрузки идут в бэкап (FEAT-047)». А в DoD FEAT-047 — «БД + `uploads/`… Видео не копируются». Что не так:
  - картинки вопросов хранятся в `media` с `role=question_image`, в каталоге медиа, а не в `uploads/`. После восстановления пропадут 53 картинки сида и все импортированные картинки вопросов;
  - вернуть их можно только переимпортом, а для опубликованных уроков он идёт через ревизии;
  - модель загрузок задвоена: `media.role=upload` (FEAT-011) и отдельная таблица `uploads` (FEAT-018).

  Fix:
  - в DoD FEAT-047 архив = БД + `uploads/` + файлы `media` с `role≠video`;
  - проверка восстановления на чистой машине: картинка вопроса отдаётся;
  - одна модель загрузок: убрать `upload` из `media.role` либо хранить загрузки FEAT-018 как `media` с `role=upload`.
- MED: [FEAT-041, FEAT-043, FEAT-033, FEAT-042; API: FEAT-006, FEAT-007, FEAT-009, FEAT-010, FEAT-014, FEAT-020] Новое. Экраны админки и «Мои желания» используют чтения, которые не объявлены ни в одном API-пункте. В Scope web-пунктов API нет, поэтому исполнитель получит `blocked: scope expansion`. Чего не хватает:
  - 041 «По ученику: задания и состояния» — у FEAT-009 только действия `close`, `reopen`, `reset`;
  - 041 «детали попыток (вопросы из снимка, ответы)» — у FEAT-010 нет админского GET;
  - 041 «дела на проверку» — у FEAT-014 только одобрение и отклонение;
  - 041 «Начисления и их отмена» — у FEAT-007 только `/api/me/*`;
  - 043 «фильтры по ученику, типу и дате» — `GET /api/admin/audit` (FEAT-006) без фильтров, колонки ученика в `audit_log` нет, а фильтр по JSON payload запрещён правилом 1(б);
  - 033 «Мои желания… история» и 042 «Выдача» — у FEAT-020 только вставки.

  Fix — дописать в DoD API-пунктов вместе со строками FEAT-049 (learnerB → 404):
  - 009 — `GET /api/admin/learners/:l/progress`;
  - 010 — `GET /api/admin/attempts?learner=&task=`, `GET /api/admin/attempts/:id`, `GET /api/admin/retry-requests?status=open`;
  - 014 — `GET /api/admin/chore-completions?status=pending`;
  - 007 — `GET /api/admin/learners/:l/ledger`;
  - 006 — `audit_log.learner_id NULL`, индекс `(learner_id, at)`, фильтры `learnerId`, `action`, `from`, `to`;
  - 020 — `GET /api/me/wishes` и `GET /api/admin/wishes?status=open`.

- LOW: [FEAT-049] Матрица покрывает маршруты settings и secrets из FEAT-052, но FEAT-049 зависит только от FEAT-004. Добавить FEAT-052 в Depends on.
- LOW: [FEAT-011, FEAT-048, FEAT-023] `safePath()` пропускает только сегменты `[a-z0-9_-]`, а в именах картинок сида есть заглавные буквы (`a-9rj3EcFE3eQ-1-1.png`, `q-9rj3EcFE3eQ-1-school.png`). Заглавные есть и в id YouTube. Импорт ответит 400. Fix: нормализовать имена в FEAT-048 (lowercase или `q<n>-a<m>.png`) либо разрешить `[A-Za-z0-9_-]`.
- LOW: [FEAT-053, FEAT-045] Не сказано, откуда в CI и в контейнере Playwright берётся ffmpeg с `lavfi` для фикстур. Не сказано и то, что e2e в CI идёт в том же контейнере той же версии, что и `pnpm e2e:update`. Fix: указать `apt-get install ffmpeg` или devDependency `ffmpeg-static`, а также `container: mcr.microsoft.com/playwright:<версия>`.
- LOW: [FEAT-004] [lens: security] Отзыв доверенного устройства не завершает сессии учеников, созданные на нём: они живут до `session.learnerDays`=180. Fix: добавить `sessions.device_id`, при отзыве устройства отзывать его сессии, тест.
- LOW: [FEAT-009, FEAT-041, FEAT-013] [lens: ux] «Сбросить всё» работает без подтверждения и без идемпотентного `requestId`, хотя `spec/01` §2.26 требует: «повтор того же запроса — no-op». Кроме того, `watch_progress` не зависит от epoch, и после сброса видео пересматривать не нужно. Fix: `progress_resets.request_id UNIQUE`, диалог подтверждения в 041, явное правило для просмотра.
- LOW: [FEAT-054] В строке схемы `questions(…)` нет колонок `state` (active|pending) и `source` (import|admin), хотя на них опираются DoD FEAT-054 и FEAT-012. Fix: перечислить их явно.
- LOW: [FEAT-008] Предмет с историей получает 409 «архивировать», но поля архива у `subjects` нет (у заданий есть `status=archived`). Fix: добавить `archived_at`.
- LOW: [FEAT-002, FEAT-003, FEAT-017] Ошибка FK `RESTRICT` (`SQLITE_CONSTRAINT_FOREIGNKEY`) нигде не превращается в 409. Например, удаление купленного товара в админ-CRUD FEAT-017 даст 500. Fix: сопоставить её с 409 в `http/errors.ts`, тест.
- LOW: [FEAT-040, FEAT-031, FEAT-050] FEAT-040 зависит от 031 только ради предпросмотра evidence. Из-за этого все редакторы заданий, включая quiz и chore, ждут проверки из РФ (FEAT-050, решение пользователя). Fix: для предпросмотра хватит MediaPlayer или `<video>`, зависимость от 031 не нужна.
- LOW: [FEAT-001] В «Общих точках регистрации» есть `packages/ui/src/index.ts`, но нет `packages/shared/src/index.ts`. Fix: добавить его в список или объявить в FEAT-001 subpath-экспорт `"./*"`.
- LOW: [lens: performance] Мелкие остатки Critique 2, не блокирующие:
  - MED#5 — HTTP-тесты в FEAT-052, 004 и 012: после PUT секрета, смены пароля или PIN и создания токена импорта в `audit_log` нет сырого значения;
  - MED#9 — ученик может получить любую загрузку по id;
  - MED#10 — `assertTaskAvailable` не заявлен при создании сессии просмотра (FEAT-013) и при «Я сделал» (FEAT-014) для черновика или неназначенного задания;
  - MED#15 — уникальность имени предмета без учёта регистра и тест «`subjects.icon` есть в манифесте»;
  - MED#21 — в `scripts/load.mjs` нет загрузки чанками.

Итог: HIGH 1 · MED 6 · LOW 11. Вердикт: refine required (есть HIGH и MED). Итерация последняя, так что решает пользователь: точечно поправить пункты перед `execute-plan` или принять остаток как известные риски.

### Post-verdict patch (после Critique 3, без повторной критики)
- HIGH (012/013): FEAT-013 переставлен перед FEAT-012; FEAT-012 зависит от 013; в контракт типа добавлен хук `fromImport` (FEAT-008), его реализация для `video_lesson` — в FEAT-013; FEAT-022 зависит от 012.
- MED (trustedProxies): одна константа `DEFAULT_TRUSTED_PROXIES` (10/8, 172.16/12, 192.168/16) в shared; FEAT-005 подключает ключ в `clientIp.ts` (в Scope) и тестирует дефолт; FEAT-046 проверяет подсеть `shared_web`.
- MED (051/031): в Scope FEAT-051 добавлены `parity-check.mjs` и `FEATURE_PLAN.md`; FEAT-024 зависит от 051 (ворота перед фазой C); в Scope FEAT-031 добавлены `quiz/Result.tsx` и `features/attempts`.
- MED (Scope 015/022): `progress/service.ts` и `video_lesson/canStart.ts` добавлены в Scope.
- MED (ревизии): API ревизий (список, diff, acceptance, rejection) — в FEAT-012; экран ревизий — в FEAT-040; `watch_progress` уникален по `(learner, task, media_id)`.
- MED (бэкап, загрузки): бэкап включает все `media`, кроме `role=video`; отдельной таблицы `uploads` нет (FEAT-018 пишет в `media`).
- MED (чтение для админки): GET-эндпоинты добавлены в DoD FEAT-006 (фильтры, `learner_id`), 007 (ledger ученика), 009 (прогресс ученика), 010 (попытка, просьбы о пересдаче), 014 (дела на проверку), 020 (желания).

## Critic Verdict: halted at max iterations
Remaining issues: HIGH/MED из Critique 3 закрыты патчем выше, но повторно не проверялись. 11 LOW из Critique 3 — известные риски, разбираются при выполнении соответствующих пунктов.
