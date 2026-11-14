# Опенсорсные основы: «клон Duolingo», LMS, трекеры с магазином (14.11.2026)

Звёзды, лицензии и даты последних коммитов взяты через `gh api` 14.11.2026.

Обозначения требований:
- R — роли админ/ученик;
- E — подключаемые типы заданий;
- P — прогресс, открытие по порядку, стрики;
- V — видео;
- $ — валюта и магазин;
- C — бытовые задания (chores).

Оценки: «+» есть, «~» частично, «−» нет.

| Проект | Лицензия · ★ · коммит | Стек | R E P V $ C | Вердикт |
|---|---|---|---|---|
| [LibreLingo](https://github.com/LibreLingo/LibreLingo) | AGPL-3.0 · 2.6k · **архив** с 06.2026 | Python + Svelte | R− E~ P+ V− $− C− | только идеи |
| [Lingo — Next.js-клон Duolingo](https://github.com/code-with-antonio/nextjs-duolingo-clone) | **без лицензии** · 03.2024 | Next 14, Drizzle, Clerk, Stripe | R~ E− (только SELECT/ASSIST) P+ V− $~ C− | только UI-паттерны, код брать нельзя |
| [sanidhyy/duolingo-clone](https://github.com/sanidhyy/duolingo-clone) | MIT · 713 · 11.2026 (dependabot) | Next 16, Drizzle/Postgres, Clerk, Stripe | то же | не база: 2 типа заданий, привязка к Clerk/Neon/Stripe |
| [Oppia](https://github.com/oppia/oppia) | Apache-2.0 · 7.0k · активен | Python + Angular + GAE | R+ E+ P~ V~ $− C− | идеи: модель interaction, подсказки |
| [Kolibri](https://github.com/learningequality/kolibri) | MIT · 1.2k · активен | Django + Vue 2.7, офлайн | R+ E~ P+ V+ $− C− | лучший офлайн-референс, но не база |
| [Frappe LMS](https://github.com/frappe/lms) | AGPL-3.0 · 3.4k · активен | Frappe + Vue 3 | R+ E~ P+ V+ $− C− | нет: портал взрослых курсов |
| [Moodle](https://github.com/moodle/moodle) + [Level Up XP](https://github.com/FMCorz/moodle-block_xp) | GPL-3.0 · активен | PHP | R+ E+ P+ V+ $~ C− | нет: тяжёлый детский UX |
| [ClassroomIO](https://github.com/classroomio/classroomio) | AGPL-3.0 · 1.7k | SvelteKit + Postgres | R+ E~ P+ V+ $− C− | нет: B2B |
| [Open edX](https://github.com/openedx/openedx-platform) | AGPL-3.0 · 8.2k | Django + React | R+ E+ P+ V+ $− C− | избыточен |
| [H5P Interactive Video](https://github.com/h5p/h5p-interactive-video) | MIT | jQuery в iframe | E+ (вопросы по таймкодам) | максимум один опциональный тип задания |
| [Habitica](https://github.com/HabitRPG/habitica) | GPL-3.0 (арт CC-BY-NC-SA) · 14.3k | Vue + Node + Mongo | R~ E− P+ V− $+ C+ | лучший источник идей для экономики |
| [OpenChore](https://github.com/liftedkilt/openchore) | MIT · 34 · 11.2026 | Go + SQLite + React | R+ (PIN) P+ $+ (ledger, магазин) C+ | референс по журналу начислений (ledger) и chores; MIT позволяет брать код |
| [Questly](https://github.com/mahansford/questly) | AGPL-3.0 · 4 | Flask + Mongo | R+ $+ (апрувы, сток) C+ | идеи для «билетиков» |
| [KinKudos](https://github.com/VooZ2/kinkudos) | MIT · 2 | Python | R+ $+ C+ | идеи |
| [Donetick](https://github.com/donetick/donetick) | AGPL-3.0 · 2.7k | Go + React | R~ C+ $~ | идеи для расписаний |
| [HabitTrove](https://github.com/dohsimpson/HabitTrove) | AGPL-3.0 · 695 | Next.js | P+ $+ C~ | идеи |

## Вывод
Опенсорсные клоны Duolingo есть, но как платформа не подходит ни один:
- LibreLingo заархивирован;
- Lingo — это туториал с двумя типами заданий, у оригинала нет лицензии;
- LMS дают уроки без экономики;
- приложения для бытовых заданий дают экономику без уроков;
- перекрасить зрелую LMS под свой визуал дороже, чем написать 10–15 своих сущностей, плюс у большинства AGPL.

**Рекомендация: писать своё и брать готовые библиотеки.**
- **Видео:** [Video.js 10](https://github.com/videojs/video.js) + [hls.js](https://github.com/video-dev/hls.js), либо [Media Chrome](https://github.com/muxinc/media-chrome) для полностью своих контролов. Vidstack и Plyr устарели и сами отправляют пользователей к Video.js 10. Трекинг просмотра свой: интервалы по `timeupdate`.
- **Задания:** свой реестр плагинов. Каждый тип задания — это `{zod-схема, Editor, Player, grade()}`; идея как у interactions в Oppia и виджетов Perseus. Для сопоставлений и сортировок — [dnd-kit](https://github.com/clauderic/dnd-kit).
- **Экономика:** append-only журнал (ledger) по образцу OpenChore и Questly. Стрики по модели дейликов Habitica. Покупки двух видов: виртуальный предмет или «билетик» со статусами requested → approved → fulfilled.
- **Auth:** [Better Auth](https://github.com/better-auth/better-auth). Ребёнок входит по аватару и PIN.
- **Без зарубежных CDN:** Fontsource для шрифтов, Serwist для PWA, Rive или lottie для анимаций. Никаких Clerk, Neon, Vercel, Stripe и Firebase.
