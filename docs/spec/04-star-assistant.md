# 04 · Стар — учебный помощник (инвентаризация для будущей пересборки)

Источник: экспорт `QuestClass-Source` (Vinext + React 19 + Cloudflare Worker + D1 + R2). Состояние кода на 14.11.2026.
Документ только перечисляет, что есть. Модуль Стара будем строить позже, сейчас задача — ничего не потерять.
Пометки: **[код]** — проверено в коде; **[док]** — взято только из docs; **не проверено** — не удалось подтвердить.
Где docs расходятся с кодом, приоритет у кода (см. раздел 6.3).

---

## 1. Что такое Стар

- **Кто это.** Анимированная SVG-звёздочка «Стар» (Star Duo, без рта, мужской род). Персональный голосовой учебный наставник для Саши (ученик 3 класса, 10 лет) и помощник родителя (Марии). Характер: дружелюбный, терпеливый, «немного озорной». Правила общения учитывают трудности внимания (СДВГ-приёмы по CDC, без диагнозов).
- **Для ребёнка.** Плавающий персонаж в КвестКлассе. Говорит голосом, слушает по нажатию кнопки, объясняет урок и тест по шагам (без ответа в тесте). Напоминает открыть урок, договаривается о паузе, называет серию дней и награды. Может открыть урок или фрагмент объяснения.
- **Для родителя.** Кабинет `/star-brain` под PIN. Там чат «Обсудим занятия Саши» по реальному прогрессу и загруженным файлам. Ещё в кабинете: разовые поручения Стару, постоянные педагогические правила, настройки напоминаний, памяти, голоса и ПК, а также лаборатории для проверок.
- **Каналы.** (1) Веб и PWA на ноутбуке или телефоне: персонаж во вкладке, опрос раз в 30 с, Web Push с service worker. (2) Телефон: та же PWA, плюс Android-оболочка (иконка-настроение и уведомления; нативный TTS только для чтения уроков). (3) Windows: Electron-оверлей «Стар для Windows» (`/star-desktop`) — прозрачное окно 380×450 поверх окон с микрофоном и локальным «Эй, Стар».
- **ИИ.** OpenAI Responses API, модель `gpt-6-luna`, `store:false`, `reasoning:{effort:'none'}`, строгий JSON Schema. Опционально Azure OpenAI/Foundry deployment через таблицу `star_azure`. Ключ — env `OPENAI_API_KEY` или зашифрованная запись `star_service_credentials`.
- **Голос (TTS).** Основной — Azure Speech `ru-RU-DmitryNeural`. Опционально Azure MAI «Лев» (MAI-Voice-2.1 или Flash) с бюджетом. Без Azure — Cartesia Sonic 3.6 «Сергей». В коде лежат мёртвые ветки: OpenAI `gpt-4o-mini-tts`/alloy и ElevenLabs.
- **Слух (STT).** Если подключён Azure — Azure Speech short-audio `ru-RU`. Иначе на телефоне и в браузере — Web Speech API, а на ПК — Cartesia `ink-whisper`. Фраза вызова: в браузере Web Speech, в Windows — офлайн Vosk.
- **Хранение.** D1, около 20 таблиц `star_*`. Почти всё чувствительное зашифровано AES-GCM ключом `REPORT_ENCRYPTION_KEY`. Файлы родителя лежат в R2. Push — Web Push с VAPID.

---

## 2. Инвентарь фич

Сокращения: Р — ребёнок, М — мама/родитель, С — система. Пути: `app/…`, `lib/…`, `app/api/…`.

| Фича | Для кого | Что делает | Ключевые правила/лимиты | Файлы | Внешний сервис |
|---|---|---|---|---|---|
| Плавающий персонаж | Р | Звёздочка поверх интерфейса. Тянется pointer'ом и стрелками (шаг 20 px), Escape сворачивает. Позиция сохраняется на устройстве | Размер 68 px → при открытии 164 px; свёрнутый — 44 px; на низком экране 112 px. Поле от края 8 px; на десктопе по умолчанию right/bottom 24, на мобиле 16/96. Скрыт при блокирующих экранах (родитель, игры, награды, полноэкранный режим) | `app/star-assistant.tsx`, `app/star-assistant.css`, `lib/star-duo/*` | — |
| Док-режим (десктоп-раскладка) | Р | В десктоп-колонке Стар «припаркован». Подписи «Помощник на уроке» / «Твой помощник в КвестКлассе». Кнопка «На место» после перетаскивания | Включается при `lessonRefresh && !tutorialOpen` и ширине ≥1024 px. Якорь `[data-star-home-anchor]` (иконка `public/star-duo/star-home-nav.svg`) | `app/star-dock.css`, `app/focus-app.tsx:297` | — |
| Компактный диалог | Р | Один пузырь ответа. Кнопки в ряд: микрофон, клавиатура, звук, свернуть. Свёрнутая история «Наш разговор» (до 10 реплик) и «Новый разговор» | Без большого чата. «Ты: …» показывает распознанную фразу. Ошибки показываются с кнопкой «Повторить» | `app/star-assistant.tsx` | — |
| Первое знакомство | Р | При первом открытии на устройстве — `starIntroduction(name)`, дальше «Я здесь! Чем займёмся?» | Флаг `localStorage quest-star-introduction-v1` | `lib/star-assistant.ts` | — |
| Локальные команды | Р | Работают без ИИ: «помолчи / тихо / свернись / спрячься / закройся / отстань / не беспокой / не приставай» (сворачивает и, если идёт напоминание, отвечает `angry`); «повтори»; «покажи/открой игры·магазин·уроки» | Остальное уходит в ИИ-тьютор. Полный локальный движок `starReply` (4 шутки, арифметика до 999 без eval, «что умеешь») работает только при `localOnly` (`/star-test`) | `app/star-assistant.tsx:104-115`, `lib/star-assistant.ts` | — |
| Голосовой ввод ребёнка | Р | Микрофон только по нажатию. Распознанный текст отправляется автоматически | `ru-RU`, одна фраза, interimResults. Web Speech: 2 мин максимум. Azure: запись до 10 с ожидания начала, пауза 2,2 с, максимум 120 с. Прерывается при скрытии вкладки, сворачивании или блокировке; поздние результаты игнорируются | `lib/star-recognition.ts`, `lib/star-desktop-audio.ts`, `lib/star-speech-endpoint.ts` | Azure Speech STT или Web Speech API |
| Текстовый ввод | Р | Поле «Напиши мне…» | 500 символов в поле, 800 на сервер. Enter — отправить | `app/star-assistant.tsx` | — |
| Озвучка ответов Стара | Р | Каждая реплика Стара озвучивается через общий VoiceProvider. Кнопка динамика (mute) сохраняется на устройстве | Фраза ≤600 символов. Кэш вкладки — 8 фраз. Таймаут клиента 35 с. Без подмены на голос устройства. При речи Стара ставятся на паузу видео и чтение урока; перед микрофоном речь останавливается. «Готовлю голос…» во время загрузки | `lib/star-cloud-voice.ts`, `app/voice.tsx`, `app/api/star-voice/route.ts`, `lib/star-voice-service.ts` | Azure Speech (Dmitry/Lev) или Cartesia |
| Контекстный ИИ-тьютор | Р | Свободный разговор: учёба, поддержка, договорённости. Ответ — JSON с `text`, `emotion`, `intent`, `minutes`, `clipIndex`, `reason`, `visual`, `pageFocus`, `feedback` | Сообщение ≤800 символов. История ≤16 реплик по ≤700. Тело ≤28 000 байт. `text` ≤520 символов. `max_output_tokens` 1100. Таймаут 30 с (клиент 35 с). Выключается настройкой `enabled`. Проверки на 409: смена вопроса, режима тестирования или эпизода | `lib/star-tutor-service.ts`, `app/api/star-tutor/route.ts`, `lib/star-tutor-context.ts` | OpenAI Responses (`gpt-6-luna`) или Azure OpenAI |
| Помощь в тесте | Р | При открытии во время теста и при смене вопроса Стар сам просит ИИ объяснить условие на похожем примере | Ответ и ключ не передаются. Нельзя называть или исключать варианты. Распечатки и PDF в тесте отключены. На доске нельзя использовать числа из вопроса и вариантов | `star-tutor-service.ts` (prompt), `star-teaching-visual.ts`, `mostik-materials.ts:retrieveStudySources` | OpenAI |
| Кнопки помощи на уроке | Р | «Объясни этот момент проще», «Приведи пример по теме». В тесте есть набор «Объясни условие / Дай подсказку / Покажи похожий пример» (используется в `star-practice/lesson-help.tsx`) | Показываются на уроке вне теста | `lib/star-help-options.ts` | — |
| Доска объяснения | Р | Схемы, которые рисует приложение: весы `x + a = b` (3 кадра) и числовая линия ± (2 кадра). Кадры можно озвучить | a, b и результат в диапазоне 1..20. Для весов только `add`, 1 ≤ a < b ≤ 20. Отключается при `lessonHelp=false` | `lib/star-teaching-visual.ts`, `app/star-teaching-board.tsx/.css` | — |
| Учебные источники («Мостик» + учебники) | Р, М | Сервер подбирает страницы корпуса по теме и словам. Модели отдаётся текст и до 2 картинок страниц; ИИ может выделить область (`pageFocus`). Ребёнку показываются фрагмент, полная страница с зумом ×2 и ссылки «Учебные источники · N» | До 4 источников, 6500 символов всего, ≤2200 на источник. Картинки — WebP из манифеста, ≤1,2 МБ каждая и ≤1,8 МБ суммарно, загрузка 8 с, `detail:high`. Рамка 0–100%, минимум 10%. OCR-страницы весят ×0,4. В тесте источников нет | `lib/mostik-materials.ts/.json` (7,1 МБ), `lib/study-page-images.ts/.json`, `lib/study-page-vision.ts`, `app/star-source-pages.tsx`, `public/study-pages/` (2219 webp, 237 МБ), `public/study-sources/` (14 файлов, 15 МБ) | OpenAI (vision) |
| Факты субтитров к видео | Р | Фрагменты видео с таймкодами — «Материал урока» и «Фрагмент объяснения» | До 10 фактов на видео, до 6 цитат helpVideo. 176 фактов на 22 видео | `lib/subtitle-evidence-20261021.json`, `star-tutor-context.ts` | — |
| CTA «Открыть урок» / «Посмотреть объяснение» | Р | По `intent=openLesson` или `reviewClip` под ответом появляется кнопка. В новом плеере проигрывается фрагмент `startSeconds–endSeconds`, в классическом — видео разбора | `clipIndex` < 30, клипы только из контекста. ИИ не утверждает «я открыл» | `star-tutor-service.ts:75-76`, `focus-app.tsx (onTutorOpen)` | — |
| Проверенная арифметика | Р | Для `a op b` (числа до 999, `+ − × ÷`, слова «плюс/минус/умножить на/разделить на», «сложить X и Y») сервер считает результат и разложение и кладёт в инструкции | Только вне теста и при `lessonHelp`. Ответ не называть до попытки | `lib/star-brain.ts:starArithmetic` | — |
| Обратная связь о приёмах объяснения | Р→С | ИИ заполняет `feedback`, когда ребёнок ясно сказал, что приём помог или мешал. Сохраняется в `learningMethods` | Приёмы: example, steps, visual, slower, shorter, together. Нужна дословная цитата. Не больше 80 записей за 90 дней, одна на день, урок и приём. Предпочтение считается, если перевес ≥2 из последних 5 | `lib/star-dialogue-memory.ts` | — |
| Поручения в контексте ребёнка | Р | Активные поручения мамы (стадия: урок, покупка, списание, подтверждение) попадают в промпт тьютора | Стадии берутся только из данных приложения. Стар не начисляет и не списывает | `lib/star-assignments.ts:assignmentPrompt` | — |
| Серия и награды в речи | Р | Стар называет точные `count`, `nextRewardIn`, награду и предупреждает об обнулении и «запустении» | Каждые 5 дней — 200 монет, 200 XP, 3 искры. День засчитывается за урок с завершённым тестом. Пропуск до полуночи по Калининграду обнуляет серию, но не полученные награды | `lib/star-streak.ts`, `lib/lesson-streak.ts` (внешний модуль) | — |
| Напоминание в приложении | Р | Если в открытой вкладке подошёл срок, Стар раскрывается сам, показывает текст и (при `voice`) озвучивает | Опрос `tick` раз в 30 с и при focus/visibility, только видимая сфокусированная вкладка без открытого урока. Показ подтверждается через `claim` (60 с) и `ack`. Повтор не чаще 20 с. Во время урока раз в 30 с идёт `tick` (без показа) и heartbeat `lesson` раз в 25 с | `app/use-star-reminders.ts`, `app/api/star-reminders/route.ts`, `lib/star-presence.ts` | — |
| Ответы на напоминание | Р | Кнопки «Открыть урок», «Чуть позже»; в «Другой ответ»: «Я ещё играю», «Я устал», «Плохо себя чувствую», «Не беспокой», «Не хочу начинать», «Позови маму». При предложении — «Да, через N минут» | later/playing/tired/refuse уходят в ИИ как фразы. opened/agree/angry/unwell/mom/claimed обрабатываются контроллером | `app/star-assistant.tsx:93-101,158-161`, `lib/star-routine.ts:replyRoutine` | — |
| Договорённость об отсрочке | Р | Модель может предложить срок (`proposeDelay`). Срок вступает в силу только после отдельного явного «да» (`acceptDelay` + `explicitDelayConsent`) | Одна пауза — 5..120 мин (по умолчанию 45). Общий лимит на эпизод — до 180 (по умолчанию 60). Один встречный вариант при запросе >20 мин: `max(5, floor(x/10)*5)`, то есть 40 → 20. Молчание не считается согласием. «Да» с «не», «но» или «?» тоже не согласие. Кнопка уведомления «Через 15 минут» — прямое согласие | `lib/star-delay.ts`, `lib/star-tutor-actions.ts`, `lib/star-routine.ts` | — |
| Учебный день (эпизод) | С | Раз в день в выбранные дни с `time` до 22:00 по Калининграду создаётся эпизод о следующем уроке (назначенном или из авторотации). Повтор каждые 30 мин, пока нет урока с завершённым тестом | Лимит трёх доставок снят 11.11.2026. Свежее воспроизведение (<90 с) подавляет обращение. Если урок не начат, через 30 мин повтор. Пауза из-за `unwell` / `mom` / `angry` действует, пока родитель не возобновит. `escalated` восстанавливается | `lib/star-routine.ts`, `lib/star-routine-store.ts:tickRoutine` | — |
| Выбор подхода к обращению | С | 5 шаблонов: «Один маленький шаг», «Небольшой выбор», «Начать вместе», «Спокойное переключение», «Нейтральное приглашение». Шаблон выбирается по наблюдениям | Эмпирика начинается с ≥3 известных наблюдений, оценка `(helped+1)/(known+2)`. При `reason=playing` — transition. Родитель может запретить подход (хотя бы один остаётся) | `lib/star-routine.ts:chooseApproach/routineLine` | — |
| Сообщения родителю (отчёты) | М | `report`: kind `unwell`, `asked` (позвать маму) или `exhausted`. Отправляется push на устройства audience `parent`/`both` | Один отчёт на эпизод, дедупликация по `last_report` | `star-routine.ts:parentReport`, `star-routine-store.ts:dispatchStarRoutines` | Web Push |
| Web Push напоминания | Р, М | Фоновый диспетчер отправляет `star-reminder` или `star-parent`. Service worker перед показом перепроверяет `tick` и `claim`. Действия: «Открыть урок» / «Через 15 минут» | До 6 устройств на владельца. TTL push 3600 с. Topics `star-lesson-reminder` / `star-parent-report`. Принятие push-сервисом не считается доставкой. Если активен desktop-оверлей, ребёнку push не идёт | `lib/star-routine-store.ts`, `lib/web-push.ts`, `public/sw.js:18-80` | Web Push (VAPID) |
| Фоновый диспетчер | С | `POST /api/star-reminders/dispatch` обходит до 50 владельцев и пишет `{checked,accepted,failed,at}` | Вызывается внешним расписанием Sites раз в час с 06:00 до 22:00 (Калининград) **[док]**. Сервисный путь — env `STAR_REMINDER_PRIVATE_SERVICE=1`, ручной — родитель с PIN | `app/api/star-reminders/dispatch/route.ts` | Sites scheduler |
| Подтверждённые факты против слов | С | «Я сделал» (`claimed`) пишет только `claimedAt` и ответ «Одних слов недостаточно…». Начало и завершение определяются по `watch.lastPlayedAt`, тесту и `lessonStreakView` | Начало в течение 10 мин после показа даёт положительное наблюдение | `star-routine.ts:observeRoutine`, `star-routine-store.ts:tickRoutine` | — |
| Достижения от Стара | Р | «Алло, это тишина?» — 3 показанных напоминания подряд без ответа (≥60 с видимого внимания на каждое). «Ещё пять минуточек» — 3 согласованные отсрочки одного урока | Только сервер, не в testMode. Выдаётся через `unlockAchievement` в household | `lib/star-achievement-evidence.ts`, `lib/star-achievement-store.ts` | — |
| Присутствие поверхностей | С | Lease на `desktop` / `lesson` (heartbeat) | TTL 75 с. Пока desktop-оверлей держит lease, ребёнку не идёт push, и показать может только он | `lib/star-presence.ts` | — |
| «Эй, Стар» в браузере | Р | Опциональный вызов фразой в активной вкладке. Открывает Стара и сразу включает микрофон | Чекбокс в настройках ПК, `localStorage quest-star-voice-call`. Совпадение только полной фразы «эй стар». Пауза между сессиями распознавания 450 мс. Ошибка выключает функцию | `app/star-call.tsx`, `lib/star-wake-phrase.ts` | Web Speech API |
| Стар для Windows (оверлей) | Р | Electron-окно 380×450: прозрачное, без рамки, поверх всех окон, без фокуса, пропускает клики (кроме кнопки ×), в углу экрана с мышью. Сценарий встречи: появление (1100 мс) → приветствие по предмету → прослушивание → ИИ-ответ → уход | Опрос 25 с. Встреча начинается только при `ownsDesktop`, затем claim, reveal, ack. Слушает 5/7/10 с (настройка). Порог RMS 0,018. Одна встреча может включать несколько реплик, история 12. Отмена при блокировке, сне, открытом уроке или кабинете | `app/star-desktop/*`, `lib/star-desktop-*.ts`, `windows-shell/main.cjs, preload.cjs, policy.cjs` | Azure/Cartesia STT, TTS, OpenAI |
| «Эй, Стар» в Windows | Р | Локальное распознавание фразы | Vosk (`wake-runtime/python.exe` + `wake-offline.py`, грамматика) или запасной `wake.ps1`. Не чаще раза в 5 с. Аудио не пишется | `windows-shell/wake.cjs`, `wake-offline.py`, `wake.ps1` | — (офлайн) |
| Запоминание услышанного на ПК | С | Транскрипт или пометка «фон / тишина» сохраняется в `history[].heard` доставленного обращения | Текст ≤600 символов, в течение 180 с после показа, только владельцем lease. Фон не считается ни отказом, ни согласием | `lib/star-desktop-heard.ts` | — |
| Чат родителя | М | «Обсудим занятия Саши» — ИИ отвечает Марии по реальному прогрессу, файлам и корпусу. Может предложить coaching-правило или поручение (JSON-поля) | Сообщение ≤2000 символов, ≤4 файлов. В модель идут 16 последних реплик. Хранение: 30 реплик и ≤18 000 символов. Ответ ≤5000 символов, `max_output_tokens` 2200, таймаут 95 с. Ревизии (409). Идемпотентность по `requestId` | `app/api/star-parent-chat/route.ts`, `lib/star-parent-server.ts`, `lib/star-parent-context.ts`, `app/star-brain/parent-chat.tsx` | OpenAI |
| Файлы родителя и разбор | М | Загрузка PDF/JPG/PNG/WebP трёх видов: «Учебный материал», «Работа Саши», «Методика». Модель извлекает summary, coverage, warnings и chunks | ≤12 МБ. Summary ≤1800 символов, ≤12 предупреждений по 500, 1..40 фрагментов по ≤2400, JSON ≤30 000. `max_output_tokens` 12 000. Зависший разбор можно перезапустить через 150 с. Удаление стирает оригинал и разбор. Поиск — до 100 файлов, 10 фрагментов, 15 000 символов | `app/api/star-parent-files/route.ts`, `.../analyze/route.ts`, `app/star-brain/parent-workspace.tsx` | OpenAI (input_file / input_image), R2 |
| Педагогические правила (coaching) | М→Р | Постоянные пожелания мамы (строки) добавляются в промпт ребёнка. Правку можно сделать из чата (`coaching` edit) или вручную | Всего ≤2200 символов, одно правило ≤240. Нужна дословная цитата из сообщения. Ревизии. До ребёнка доходят ещё до 3 выдержек ×850 символов из файлов вида «method» | `lib/star-coaching-store.ts`, `lib/star-coaching.ts`, `lib/star-dialogue-memory.ts:editRules`, `app/star-brain/coaching.tsx`, `app/api/star-coaching` | — |
| Поручения Стару (assignments) | М→Р | Разовые поручения из чата мамы. Условия: урок (`watch` или `complete`), покупка билета, списание мамой. Закрываются автоматически по фактам или вручную (cancel/complete) | ≤20 активных, ≤300 всего, квитанций ≤300. Название ≤100 символов, текст для ребёнка ≤500. Срок в ISO; «сегодня» — до 23:59:59 по Калининграду. Скоупы `live` / `practice`. Запись поручения и чата атомарна | `lib/star-assignments.ts`, `lib/star-assignments-store.ts`, `app/api/star-assignments`, `app/star-brain/assignments.tsx` | — |
| Каталог материалов | М | `/star-materials`: поиск по корпусу с оригинальными страницами | Только родитель. Запрос ≤200, предмет ≤80, до 50 результатов по 1800 символов | `app/star-materials/*`, `app/api/star-materials` | — |
| Прогресс в кабинете | М | Вкладки «Прогресс» и «Материалы» (`StarParentWorkspace`), «Последние 7 дней» | — | `app/star-brain/parent-workspace.tsx`, `app/parent-progress.tsx` | — |
| Голосовой ввод для родителя | М | Диктовка в родительский чат | Через `createDesktopAudio` и `/api/star-desktop/transcribe` | `app/star-brain/parent-audio.tsx` | Azure / Cartesia STT |
| Настройки «мозга» | М | Включён ли разговор, тон (friendly/calm), длина (short/step), юмор (off/requested/rare), помощь (hints/worked), примеры (plain/space/games/potions), lessonHelp, лимиты переносов | Таблица `star_brain_settings` (не шифруется). `dailyLimit` всегда 0 (без дневного лимита) | `lib/star-brain.ts`, `lib/star-brain-store.ts`, `app/api/star-brain` | — |
| Настройки напоминаний | М | Вкл/выкл, время, дни, голос (по умолчанию выкл), память, запрет подходов, лимиты переносов. Подключение устройств (reminders/parent/both), «напомнить сейчас», возобновление, оценка и удаление наблюдений, очистка памяти | Время 06:00..22:00, по умолчанию будни, 11:00 | `app/star-brain/routine-settings.tsx`, `app/api/star-reminders` (parent actions) | Web Push |
| Настройки ПК | М | Автозапуск, микрофон, угол (left/right), громкость 0..1, время прослушивания 5/7/10, `wakeEnabled`, браузерный «Эй, Стар», проверка в браузере и нативная | Тело ≤2000. PUT только с PIN, ребёнок читает | `app/star-brain/desktop-settings.tsx`, `app/api/star-desktop/settings`, `lib/star-desktop-settings.ts` | — |
| Подключение голоса и слуха | М | `/star-voice-setup`: регион и ключ Azure Speech, проверка TTS→STT перед сохранением. Подготовка «Льва» (проба, активация, бюджет) | Ключ шифруется и в ответах не возвращается. Проба Льва — $0,10 суммарно. Живой лимит $0,01..$10, по умолчанию выключен | `app/star-voice-setup/*`, `app/api/star-speech-connection`, `app/api/star-lev`, `lib/star-lev*.ts` | Azure Speech |
| Idle-движения | Р | Редкие «оживления» в простое: spin, moon, heart, book | Первое — через 35–55 с, следующие — через 90–150 с. Не во время урока, разговора, напоминания или речи. Выключатель «Редкие превращения Стара» (`localStorage quest-star-idle-motion-v1`). Учитывается prefers-reduced-motion | `lib/star-duo/idle-play.js`, `star.js`, `app/star-motion-settings.tsx` | — |
| Реакции на события урока | Р | `reaction`: lessonStart на уроке, correct/error после теста. Эмоция ответа ИИ → анимация (neutral/curious → lessonStart, support → tired, happy → correct, playful → joke) | — | `app/focus-app.tsx:297`, `star-assistant.tsx:125` | — |
| Режим тестового прогресса (testMode) | С | Если в household включён `testMode`: напоминания выключены, действия ИИ не применяются, память пишется в `star-general-test:<owner>` | Сообщение «Это тестовый режим прогресса…» | `app/api/star-tutor/route.ts:29,38`, `star-routine-store.ts:29` | — |
| Песочница Стара (practice) | М | `/star-practice` и `/star-practice/class`: копия household `star-practice:<sha256(owner)>`. Там прогоняется урок, ИИ-тьютор (`?practice=1`), поручения `practice` и ИИ-встреча | Копия не трогает настоящий testMode и награды. PIN, сессии, устройства и сообщения мамы стираются | `lib/star-practice-store.ts`, `app/star-practice/*`, `app/api/star-desktop/dialogue` | OpenAI |

---

## 3. Данные

### 3.1 Таблицы D1 (все с ключом `owner` = `oai-authenticated-user-id`, если не указано иное)

🔒 — значение зашифровано `seal()`: AES-GCM, IV 12 байт, формат `base64(iv).base64(ct)`, ключ `REPORT_ENCRYPTION_KEY` (base64, 32 байта), `lib/quest-store.ts:49-51`.

| Таблица | Создание | Колонки | Содержимое payload | Шифр |
|---|---|---|---|---|
| `star_routine` | миграция 0006 | owner, revision, payload | `RoutineState`: `settings` {enabled, time, weekdays[], voice, memory, avoid[], maxSnoozeMinutes, maxTotalSnoozeMinutes}; `episode` {id, day, lessonId, title, subject, phase (due/waiting/snoozed/opened/started/paused/escalated/completed), delivered, nextAt, reason, offer, pendingMinutes, counterOffers, usedSnoozeMinutes, replyText, claimedAt, notice{id,text,approach,preparedAt,deliveredAt,presentation{id,until}}, report{id,kind,text,sent}}; `history[]` (Observation: id, at, approach, result, source app/user, rating auto/helped/avoid/neutral, heard{kind,text,at}) — ≤200 и ≤90 дней; `learningMethods[]` (method, effect, day, lesson, at) — ≤80 и ≤90 дней; `lastDay`; `presence` {desktop, lesson: {id, seenAt}}; `achievementEvidence` {episodeId, since, started, answered[], ignored[], snoozed[], attention, earned}. CAS по revision, 8 повторов | 🔒 payload |
| `star_routine_devices` | 0006 | id (sha256 endpoint), owner, subscription, audience (reminders/parent/both), active, created_at, last_report | Подписка Web Push | 🔒 subscription |
| `star_routine_clock` | 0007 | id=1, summary | `{checked, accepted, failed, at}` последнего прогона | нет |
| `star_brain_settings` | 0004 | owner, settings, updated_at | `StarBrainSettings` (см. §4.4) | нет |
| `star_brain_usage` | 0004 | owner, day (Калининград), requests, last_at | Счётчик ИИ-запросов тьютора, родительского чата, разбора файлов и лабораторий | нет |
| `star_controller_lab` | 0005 | owner, revision, state | Состояние симулятора (лаборатория) | нет |
| `star_voice_connections` | 0003 | owner, encrypted_key, voice_id, updated_at | Наследие (ElevenLabs). **В коде не используется** | (вероятно 🔒, не проверено) |
| `star_service_credentials` | 0008 | name, encrypted_value, updated_at | `OPENAI_API_KEY`, перенесённый из dev-копии | 🔒 |
| `star_promotion_receipt` | 0008 | id, summary | Квитанция разового переноса `from-star-copy-20261103` | нет |
| `star_parent_chat` | 0009 | owner, revision, payload | `ParentTurn[]` {role, text, at, sources[{name, page, url}]} — ≤30 и ≤18 000 символов | 🔒 payload |
| `star_parent_knowledge` | 0009 | owner, file_id, status (processing/ready/partial/error), payload, job, updated_at | `Knowledge` {summary, coverage, warnings[], chunks[{page, topic, text}]} | 🔒 payload |
| `star_assignments` | runtime | owner, scope (live/practice), revision, payload | `{items: Assignment[], receipts: [{key, message, notice}]}` | 🔒 payload |
| `star_coaching` | runtime | owner, rules, revision | Строки правил ≤2200 | 🔒 rules |
| `star_method_files` | runtime | owner, file_id | Какие файлы относятся к виду «method» | нет |
| `star_speech` | runtime | owner, config | `{region, speechKey}` Azure Speech | 🔒 config |
| `star_azure` | runtime | owner, config | Наследие: `{endpoint, deployment, modelKey, region, speechKey}`. Через него ИИ можно направить в Azure OpenAI | 🔒 config |
| `star_cartesia_connections` | runtime | owner, encrypted_key, voice_id, updated_at | Ключ Cartesia и ID голоса Sergei | 🔒 encrypted_key |
| `star_lev_preferences` | runtime | owner, model, style, active, budget_microusd, spent_microusd, sample_spent_microusd, verified_model, verified_style | Выбор и учёт расходов Льва (CHECK-ограничения в SQL) | нет (секретов нет) |
| `star_desktop_settings` | runtime | owner, settings | `DesktopSettings` {configured, updatedAt, wakeEnabled, autostart, microphone, corner, volume, listenSeconds} | нет |
| `star_voice_usage` | runtime | owner, day (UTC), requests, characters | Счётчик озвучки | нет |
| `star_mic_usage` | runtime | owner, day (UTC), requests, last_at | Счётчик распознаваний | нет |
| `star_voice_lab` | runtime | owner, revision, payload | `{selected, previous}` выбор в студии голосов | 🔒 payload |
| `star_voice_lab_usage` | runtime | owner, day (UTC), requests, characters, last_at | Лимит студии голосов | нет |
| `households` (чужая) | 0000 | — | Стар читает state. Пишет только достижения `hello_silence` / `five_more_minutes`. Создаёт копии `star-practice:<hash>`. Плюс служебный owner `star-general-test:<owner>` в `star_routine` | — |

R2 (`BUCKET`):
- `star-parent/<sha256(owner)>/<uuid>` — оригиналы файлов родителя, customMetadata {kind, name ≤160, note ≤400}. Не зашифрованы (не проверено, есть ли шифрование на стороне R2).
- `star-voice-lab/<sha256(owner)>/<sha256(choice+text)>.mp3` — кэш фиксированной фразы студии голосов на 30 дней.

localStorage клиента: `quest-star-duo-position-v1`, `quest-star-voice-v1` (on/off), `quest-star-introduction-v1`, `quest-star-idle-motion-v1`, `quest-star-voice-call`, `star-ai-test-session-v1` (тестовая ИИ-встреча).

Env и секреты: `REPORT_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `CARTESIA_API_KEY` (запасной), `REMINDER_VAPID_PUBLIC_KEY`, `REMINDER_VAPID_PRIVATE_JWK`, `STAR_REMINDER_PRIVATE_SERVICE`, `STAR_PROMOTION_TOKEN/UNTIL/OWNER` (разовый перенос). `STAR_VOICE_PROVIDER` и `ELEVENLABS_*` есть в `.env.example`, но кодом не читаются.

### 3.2 Лимиты и потолки расходов (по коду)

| Что | Лимит |
|---|---|
| ИИ-запросы (тьютор, родительский чат, разбор файлов) | Дневного потолка **нет** (`dailyLimit:0`, комментарий «a daily counter never blocks a lesson»). Пауза между запросами 1,5 с; лаборатория `/api/star-brain` — 3 с. Стоимость запроса 1..2 (у desktop dialogue) |
| Озвучка `/api/star-voice` | ≤600 символов, тело ≤4096 байт, таймаут 30 с, аудио ≤16 МБ (Cartesia) / ≤3 МБ (другие). Дневной счётчик есть, но **потолка нет** (в docs «100 запросов и 20 000 символов» — устарело) |
| Распознавание `/api/star-desktop/transcribe` | Пауза 2,5 с между записями. Тело ≤4 МБ (Azure PCM) или ≤1 МБ (webm/Cartesia). Меньше 300 байт — пустой текст. Текст ≤1800. Куски ≤55 с с разрезом по тишине. Таймаут 65 с (Azure) / 20 с (Cartesia) |
| Лев (Azure MAI) | $22 за 1 млн символов (MAI-Voice-2.1) или $15 (Flash), резерв до запроса. Пробы — $0,10 суммарно. Живой лимит необязательный, $0,01..$10. Неудачи не возвращают резерв, ничего не сбрасывается |
| Студия голосов OpenAI | 60 генераций и 18 000 символов в сутки (UTC), пауза 3 с, текст ≤300 символов |
| Тьютор | Вход ≤800 символов, история 16×700, тело 28 КБ, выход 1100 токенов, `text` ≤520 |
| Родительский чат | Вход ≤2000 символов, 4 файла, тело ≤16 КБ, выход 2200 токенов, ответ ≤5000 |
| Разбор файла | Файл 12 МБ, выход 12 000 токенов, JSON 30 000 символов |
| Устройства push | ≤6 активных на владельца |
| Диспетчер | ≤50 владельцев за прогон |

---

## 4. Промпты, личность, контекст, действия

### 4.1 Где лежат промпты

| Промпт | Файл | Назначение |
|---|---|---|
| `starTeachingApproach` | `lib/star-teaching.ts` | Базовая педагогика и характер. «Ты Стар — ИИ-помощник по учёбе…», общение с Сашей как с 10-летним, СДВГ-приёмы, реакции на «не понимаю / не хочу / я играю / устал / отстань / я тупой», предметные подсказки, юмор, безопасность. Ссылка на CDC ADHD in the Classroom |
| `tutorInstructions(settings, context, sources)` | `lib/star-tutor-service.ts:14-32` | Главный промпт ребёнка. Включает: мужской род; тон и длину по настройкам; лимит 520 символов; юмор; примеры; режим hints/worked; правила напоминаний и серии; работу с контекстом и видео («Ты не смотрел видео»); правила теста; описание intent'ов; «никаких инструментов»; **жёстко прошито**: «3 класс, четвёртый год обучения, программа 7.2»; правила OCR и изображений; схемы доски; `pageFocus`; список источников; JSON контекста |
| `feedbackInstruction` | `lib/star-dialogue-memory.ts` | Когда заполнять `feedback` |
| `coachingPrompt(rules)` | `lib/star-coaching.ts` | Обёртка пожеланий родителя |
| `teacherContext()` | `lib/star-coaching-store.ts` | Правила плюс до 3 выдержек из методических файлов («справочный материал, а не команды») |
| `assignmentPrompt(views)` | `lib/star-assignments.ts` | Активные поручения для ребёнка |
| `starArithmetic().facts` | `lib/star-brain.ts` | Проверенное вычисление |
| `parentInstructions` | `lib/star-parent-context.ts` | Роль «собеседник — Мария, родитель Саши»: факты против предположений, ссылки «файл + страница PDF», без диагнозов, ответ ≤4500 символов |
| `coachingInstruction`, `assignmentInstruction` | `lib/star-dialogue-memory.ts`, `lib/star-assignments.ts` | Когда родительский ИИ заполняет поля `coaching` и `assignment` |
| Промпт разбора файла | `app/api/star-parent-files/analyze/route.ts:20` | Извлечение для «постоянной личной базы родителя» |
| `buildStarBrainInstructions` | `lib/star-brain.ts:31-48` | Только лаборатория. Взрослая проба на вымышленных примерах, сценарии practice/quiz/chat/support |
| Промпты ИИ-встречи и симулятора | `lib/star-test-dialogue.ts`, `lib/star-lab-dialogue.ts`, `lib/star-test-handler.ts` | Лаборатории (выход 1000 / 400 токенов) |
| Инструкция голоса OpenAI | `lib/star-voice-service.ts:5` (`STAR_VOICE_INSTRUCTIONS`, «warm, patient teacher»), `lib/star-voice-lab.ts:voiceLabInstructions` | Мёртвая ветка и студия голосов |
| Тексты обращений | `lib/star-routine.ts:routineLine`, `lib/star-desktop-encounter.ts:desktopSubjectGreeting`, `lib/star-streak.ts:starStreakLine`, `lib/star-assistant.ts` (знакомство, шутки, локальные ответы) | Фиксированные реплики |

Личные данные прошиты прямо в промптах: имя «Саша» (`star-teaching`, `feedbackInstruction`, `assignmentPrompt`, `desktopSubjectGreeting`, `VOICE_LAB_TEXT`), «Мария», класс и программа 7.2. При пересборке их нужно параметризовать.

### 4.2 Контекст, который получает модель ребёнка (`buildTutorContext` → `tutorModelContext`)

- `lesson`: title (200), subject, description (1200, пусто во время теста), watched, completed, positionSeconds, progressPercent.
- `quiz`: question, options (без `correct`), index/total. `id` уходит только как ключ проверки.
- `review` после завершения: до 5 вопросов с selected, correct, wasCorrect.
- `materials` и клипы: факты субтитров и цитаты helpVideo с `startSeconds/endSeconds`.
- `routine` без id: phase, pendingMinutes, usedMinutes, maxMinutes, totalMinutes, counterOffers, canNegotiate.
- `streak`: today, todayDone, count, nextRewardIn, reward, missedDays, neglectEnabled.
- `learningMethods` (предпочтения приёмов), `approaches` {avoid, observations} (при `memory`), `testing`.
- Отдельно в instructions: найденные источники (без url), изображения страниц, правила coaching, выдержки из методик, поручения, арифметика.
- В явный контекст **не** попадают: имя из профиля, PIN, ключи, адреса доставки, диагноз, родительский чат, работы ребёнка. Docs: «uploaded works and parent chat are not sent to the child tutor». Но выдержки файлов вида «method» в детский промпт идут.

Контекст родительского чата: правила, время и часовой пояс, поручения и варианты выбора (уроки, билеты, nextLessonId), `parentProgressContext` (35 уроков, до 3 попыток и до 15 вопросов с ответами), документы (summary 600), выдержки, 3 источника корпуса.

### 4.3 Действия ИИ в приложении (`tutorIntents`)

Модель только предлагает действие. Приложение проверяет его (`applyTutorAction`) и само пишет подтверждение.

| intent | Что делает приложение | Проверки |
|---|---|---|
| `chat` | Ничего. Если идёт ожидание ответа на напоминание и названа причина, сохраняет `reason` (playing/tired/declined) | — |
| `proposeDelay` | Ставит `offer=true`, `pendingMinutes=min(minutes, остаток)`, повтор через 30 мин. Отвечает «Напомнить через N минут?» | `canNegotiate`, эпизод тот же, фаза due/waiting/snoozed/opened/escalated, minutes 1..1440, остаток лимита |
| `acceptDelay` | `replyRoutine('agree')`: фаза snoozed, `nextAt` = сейчас + N, растёт `usedSnoozeMinutes` | Явное «да» в сообщении, `pendingMinutes` совпадает, фаза waiting |
| `stopReminders` | Пауза эпизода (`asked_for_quiet`) | Фаза waiting или snoozed |
| `askMom` | Пауза плюс отчёт родителю «попросил позвать маму» | — |
| `unwell` | Пауза плюс отчёт «плохое самочувствие» | — |
| `claimed` | Пишет `claimedAt` и отвечает «не подтверждено, наград нет» | — |
| `openLesson` | Кнопка «Открыть урок» (на ПК урок открывается сам) | Урок доступен |
| `reviewClip` | Кнопка «Посмотреть объяснение» (клип) | `clipIndex` есть в контексте |

Дополнительные поля ответа, которые обрабатывает приложение: `visual` (доска), `pageFocus` (рамка на странице), `feedback` (память приёмов).
Действия родительского ИИ: `coaching` {before, after, quote} и `assignment` {operation create/cancel/complete, id, title, childText, quote, lessonMode, lessonId, ticketItemId, dueAt}.
Ответы контроллера (`routineReplies`): requestDelay, later, agree, fifteen, playing, tired, unwell, angry, refuse, opened, claimed, mom, resume.
Запрещено без исключений: начислять или списывать награды, отправлять ответы теста, менять уроки, расписание или настройки, засчитывать выполнение по словам.

### 4.4 Настройки личности (`star_brain_settings`, по умолчанию)

`enabled:true, tone:'friendly', length:'short', humor:'rare', help:'hints', examples:'games', lessonHelp:true, maxSnoozeMinutes:45, maxTotalSnoozeMinutes:60, dailyLimit:0`.
Устаревшие поля, которые читает только симулятор: `reminders:true, snoozeMinutes:15, maxReminders:3, quiet:false`.
Эмоции подачи: neutral, curious, support, happy, playful. Наличие эмоции не значит, что модель «распознала» настроение ребёнка.

---

## 5. Визуал, анимация, звук, оверлей

- **Движок персонажа Star Duo v2.** Файлы `lib/star-duo/star.js` (17 КБ, `StarDuo`, `StateController`, `AudioDriver`), `morphs.js` (24 КБ, 120-точечный силуэт), `idle-play.js`, `catalogue.ts`, `API.md` (полная документация движка). Один SVG `viewBox 0 0 320 320`. Палитры gold, solar, cobalt; в приложении используется gold. Опции: studyMode (23% амплитуды, без искр), decorative, reducedMotion (по умолчанию следует prefers-reduced-motion), idlePlay. Методы: `setConversation(silent|listening|thinking|speaking)`, `trigger(event)`, `triggerMorph`, `triggerComic`, `pause`, `destroy`. Событие DOM `starchange`.
- **Состояния (11).** idle, greeting, listening, speaking, thinking, happy, empathy, sly, surprised, reminder, celebrate. У каждого приоритет и автовозврат. Очередь — одно ожидающее событие с TTL 4 с.
- **События `trigger`.** correct→happy, error→empathy, tired→empathy, joke→sly, lessonStart→greeting, reward→celebrate, remind→reminder. Сердитой эмоции нет.
- **Превращения (20).** fries, coins, shooting, moon, spin, flip, bulb, question, exclamation, melt, balloon, steam, book, pen, gamepad, magnifier, hourglass, sleepy, rocket, heart.
- **Комичные реакции.** stretch, serious, joke, mock-surprise, deflate (плюс spin). Каждая ≤1,8 с, не чаще раза в 20 с.
- **Каталог «36 анимаций».** `STAR_ANIMATIONS`, просмотр на `/star-animations` и в «Посмотреть движения Стара» (`app/star-motion-preview.tsx/.css`).
- **Idle-игра.** `IDLE_MOVES = spin, moon, heart, book`. Первое движение через 35–55 с, следующие через 90–150 с.
- **Речь и звук.** `AudioDriver` (AnalyserNode, окно 1024, RMS) шевелит тело и лучи в такт громкости. Рта нет. На ПК уровень микрофона показывается полоской. Отдельных звуковых эффектов у Стара **нет**, только голос. `public/game/rooms/astro-audio-v1/events/star-chime.ogg` относится к игровой комнате, не к ассистенту.
- **Появление.** `StarArrival` — вспышка света 1100 мс (`app/star-arrival.tsx/.css`, `lib/star-arrival.ts`). Анимация `star-reply-in` для пузыря.
- **Стар-родитель.** `app/star-parent-look.tsx` — `star-idle.svg` с очками и галстуком в шапке кабинета.
- **Статичные ассеты.** `public/star-duo/star-idle.svg`, `star-home-nav.svg`; `public/icons/star-v1-{32,180,192,512,maskable-512}.png`; `windows-shell/star.ico`, `star.png`.
- **Маскот серии (смежный модуль, не сам ассистент).** `lib/star-mascot.ts` — 20 «настроений» по времени суток и пропускам (watching…monster), `app/lesson-streak.tsx`. Ассеты: `public/icons/stars-transparent-v7/` (40 файлов), `stars-cobalt-v5/` (40), `stars/` (28), `artwork/stars/transparent-atlas-v7.png`, `android-shell/res/drawable/star_*.png` (20), `android-shell/artwork/*atlas*`, `docs/star-mascot/` (README, emotions.png, halloween.png), `public/reminders/star-streak.png`. Также игровые персонажи `public/game/characters/star-{hero,pajamas,wizard}.webp` и комнаты `room-star-{night,studio}`.
- **UI-стили.** `app/star-assistant.css` (9,8 КБ), `star-dock.css`, `star-teaching-board.css`, `star-source-pages.css`, `star-desktop/star-desktop.css` (стадии `stage-arriving/appearing/speaking/listening/thinking/leaving/hidden/error`, пузырь «СТАР / СЛУШАЮ / УСЛЫШАЛ / ПРОВЕРКА»), `star-brain/*.css`.
- **Windows-оверлей (Electron 45.2.1, `windows-shell/`).** Окно 380×450: transparent, frame:false, alwaysOnTop, focusable:false, `setIgnoreMouseEvents(true,{forward:true})`, кнопка × делает его интерактивным при наведении. Угол экрана, где мышь, отступ 16 px. Отдельные окна: урок `?starLesson=<id>` 1220×860, кабинет `/star-brain` 1060×820, тестовый оверлей 960×760 (размеры по `main.cjs`, назначение окон не проверено). Сессия `persist:star-family`, трей-меню, автозапуск `--background`. Блокировка экрана и сон отменяют встречу. IPC-мосты: `starDesktop` (info, sync, reveal, hide, interactive, openLesson, openParent, onActivity), `starParent` (info, sync, test), `starLessonWake` (busy). Обновления подписаны RSA; проверка при старте, после входа и раз в 6 ч; загрузка частей через `/star-brain/updates`. Микрофон разрешён только для окон `/star-desktop`, урока и видимого `/star-brain`, только аудио (`docs/star-parent-microphone-fix.md`).

---

## 6. «Не переносить» — лаборатории, дубли, наследие

### 6.1 Лаборатории и пробы

| Что | Файлы | Рекомендация |
|---|---|---|
| `/star-test` — локальный демо-движок команд (`localOnly`, `starReply`, 4 шутки, арифметика) | `app/star-test/page.tsx`, большая часть `lib/star-assistant.ts` | Страницу не переносить. Оставить `starIntroduction` и маленький набор локальных команд (спрятаться, повторить, навигация). Шутки можно оставить как фолбэк при недоступном ИИ |
| Текстовый «мозг» для взрослых (вкладка «Проверка», сценарии practice/quiz/chat/support) | `lib/star-brain-service.ts`, `buildStarBrainInstructions`, POST `/api/star-brain` | Не переносить. GET/PUT настроек перенести |
| Симулятор контроллера и «быстрая проверка ситуаций» | `lib/star-controller.ts`, `lib/star-lab-dialogue.ts`, `app/api/star-controller-lab`, `app/star-brain/controller-lab.tsx`, таблица `star_controller_lab` | Не переносить. Заменить автотестами на `star-routine` |
| ИИ-встреча для взрослого (тест ПК) | `lib/star-test-dialogue.ts`, `star-test-handler.ts`, `star-test-client.ts`, `app/star-desktop/test-controls.tsx`, `/star-desktop?test=1`, POST `/api/star-desktop/dialogue` | Не переносить как отдельный движок. Если нужен «режим проверки», делать его на основном тьюторе с флагом sandbox |
| Студия голосов OpenAI | `lib/star-voice-lab*.ts`, `app/star-brain/voices.tsx/.css`, `app/api/star-voice-lab`, таблицы `star_voice_lab*`, R2 `star-voice-lab/` | Не переносить (OpenAI TTS отключается 06.01.2027) |
| Проба Дмитрия через браузерный speechSynthesis (Edge) | `lib/star-dmitry-trial.ts`, `?voice=dmitry` | Не переносить |
| Песочница `/star-practice` (копия household, поручения `practice`) | `lib/star-practice-store.ts`, `app/star-practice/*`, `?practice=1` | Решить отдельно. Идея «проверить на копии» ценна, но копировать household целиком тяжело. Рекомендация: единый sandbox-режим |
| Галерея анимаций `/star-animations` | `app/star-animations/page.tsx` | Оставить как dev-страницу или блок в кабинете родителя (не обязательно) |

### 6.2 Дубли провайдеров и мёртвый код

| Что | Состояние | Рекомендация |
|---|---|---|
| TTS OpenAI `gpt-4o-mini-tts`/alloy | Ветка в `star-voice-service.ts`, маршрут её не включает | Удалить |
| TTS ElevenLabs `eleven_v4` (Leonid Fomichev) и 16 текстов ошибок | Ветка в сервисе, маршрут не включает. `.env` `STAR_VOICE_PROVIDER` / `ELEVENLABS_*` не читаются. Таблица `star_voice_connections` (0003) не используется | Удалить |
| TTS Cartesia Sonic 3.6 «Сергей» + STT `ink-whisper` | Работающий фолбэк без Azure. UI ввода ключа **нет** (`star-voice-connection-service.ts` ни к чему не подключён). Ключ появляется только через `star-transfer` или env `CARTESIA_API_KEY` | Не переносить, если Azure — основной. Иначе сделать нормальный UI ключа |
| Azure Speech `ru-RU-DmitryNeural` (TTS, prosody +20% / +3%) + STT | Основной путь | **Оставить** как основной провайдер за абстракцией |
| Azure MAI «Лев» (11 стилей express-as, бюджет) | Работает опционально, public preview без SLA | Оставить опцией (решить) |
| `star_azure` + `/api/star-voice-connection` (Azure OpenAI GPT + Speech вместе) | UI не вызывает. `starAIConnection` ещё читает таблицу и может направить ИИ в Azure OpenAI | Решить: либо оставить «провайдер ИИ = OpenAI/Azure» явно в настройках, либо удалить |
| Web Speech API в браузере | Фолбэк распознавания без Azure | Оставить фолбэком |
| `lib/star-desktop-demo.ts` | Не импортируется | Удалить |
| `/api/star-transfer`, `star_promotion_receipt`, `STAR_PROMOTION_*` | Разовый перенос dev-копия → основной Site (03.11.2026) | Не переносить |
| Устаревшие поля настроек `reminders, snoozeMinutes, maxReminders, quiet, dailyLimit` | Читает только симулятор | Не переносить |
| `/star-brain/updates` + `public/native-updates` | Канал обновлений Windows/APK | Вынести в отдельный модуль нативных оболочек |

### 6.3 Расхождения docs и кода (при пересборке ориентироваться на код или явно решить)

1. Лимит трёх доставленных напоминаний снят 11.11.2026, сейчас повтор каждые 30 мин до 22:00. В `star-functional-spec.md` и `star-windows-overlay.md` ещё написано «до трёх».
2. Лимит озвучки «100 запросов и 20 000 символов в сутки» в коде не применяется: только счётчик.
3. Дневной лимит ИИ-запросов отсутствует (`dailyLimit` всегда 0). Есть только пауза 1,5–3 с.
4. Скорость Cartesia: в docs 1.1, в коде `STAR_CARTESIA_SPEED=1.0`.
5. Пауза окончания фразы: в docs ПК 1,2 с, в коде `createSpeechEndpoint` 2,2 с.
6. Встреча на ПК: в docs «максимум три короткие реплики», в коде при живом ИИ-диалоге цикл не ограничен (до `finished`, пока звучит речь). Лимит 3 действует только для локальных интентов.
7. В docs «15 минут по умолчанию», в коде по умолчанию 45 и 60 (гибкие задержки с 02.11). Фиксированные «15 минут» остались в текстах `routineLine` и в кнопке push-уведомления.
8. День серии засчитывается за урок с завершённым тестом (с 14.11). Простой просмотр больше не считается.

---

## 7. Чеклист паритета

### Персонаж и UI ребёнка
- [ ] Один SVG-персонаж Star Duo (тело, 5 лучей, 2 глаза, без рта), палитра gold
- [ ] 11 состояний с приоритетами и автовозвратом, очередь из одного события с TTL 4 с
- [ ] 7 событий `trigger` (correct, error, tired, joke, lessonStart, reward, remind)
- [ ] 20 превращений `morphs` с плавным возвратом к звезде
- [ ] 5 комичных реакций, cooldown 20 с
- [ ] Idle-движения spin, moon, heart, book: первое через 35–55 с, далее через 90–150 с, не во время урока, речи, слушания или напоминания
- [ ] Переключатель «Редкие превращения Стара» и учёт prefers-reduced-motion
- [ ] studyMode (тихая амплитуда) на уроке
- [ ] Синхронизация тела с громкостью голоса (AudioDriver, RMS)
- [ ] Плавающий режим: 68 → 164 px при открытии, свёрнутый 44 px, низкий экран 112 px
- [ ] Перетаскивание мышью и тачем, стрелки клавиатуры, Escape сворачивает, позиция сохраняется
- [ ] Док-режим на десктопе (≥1024 px), кнопка «На место», якорь в навигации
- [ ] Скрытие при блокирующих экранах и полноэкранном режиме; выход из fullscreen по вызову
- [ ] Пузырь ответа, «Слушаю тебя…», «Думаю над твоим вопросом…», «Готовлю голос…»
- [ ] Ряд кнопок: микрофон, клавиатура, звук, свернуть
- [ ] Свёрнутая история «Наш разговор» (10 реплик) и «Новый разговор»
- [ ] Первое знакомство на устройстве, затем короткое приветствие
- [ ] Локальные команды: спрятаться, «повтори», открыть уроки, игры или магазин
- [ ] Реакции на события урока (lessonStart, correct/error после теста) и эмоции ответа

### Голос (TTS) и слух (STT)
- [ ] Единый серверный endpoint озвучки: фраза ≤600, тело ≤4096, только same-origin и авторизованный пользователь
- [ ] Azure Speech Dmitry (основной), prosody +20% / +3%
- [ ] Опционально Лев (MAI-Voice-2.1 / Flash, 11 стилей), проба, активация, бюджет в микродолларах
- [ ] Без автоматической подмены провайдера и без отката на голос устройства
- [ ] Клиентский кэш на 8 фраз, отмена устаревших запросов, освобождение blob URL
- [ ] Mute на устройстве, «Повторить голосом» при ошибке, обработка NotAllowedError
- [ ] Пауза видео и чтения урока во время речи Стара; остановка речи перед микрофоном
- [ ] Микрофон только по явному нажатию, без скрытого фонового прослушивания
- [ ] Выбор STT по статусу (`/api/star-speech-status`): Azure или браузер
- [ ] Azure STT: PCM 16 кГц, куски ≤55 с с разрезом по тишине, пауза 2,2 с, максимум 120 с
- [ ] Web Speech: ru-RU, interim-результаты, стоп через 2 мин без отправки незаконченного
- [ ] Отмена записи при скрытии вкладки, сворачивании и размонтировании
- [ ] Страница подключения Azure Speech с проверкой TTS→STT перед сохранением

### Вызов «Эй, Стар»
- [ ] В браузере: опция на устройстве, только активная вкладка, точная фраза, автоотключение при ошибке
- [ ] В Windows: локальный Vosk или PowerShell, событие WAKE не чаще раза в 5 с, `wakeEnabled` из кабинета
- [ ] В окне урока Windows: мост `starLessonWake` и событие `quest:voice-call-star`

### ИИ-тьютор
- [ ] `/api/star-tutor`: Responses API, `store:false`, строгая JSON Schema (9 полей)
- [ ] Промпт: `starTeachingApproach` + `tutorInstructions` + feedback + coaching + поручения + арифметика
- [ ] Контекст: урок, вопрос без ключа, разбор ошибок, фрагменты субтитров, routine, streak, приёмы, подходы
- [ ] История 16 реплик в памяти вкладки, без серверной записи разговора
- [ ] Проверки на 409: смена вопроса, testMode или эпизода
- [ ] Тест: автообъяснение условия при открытии и смене вопроса, без ответа и исключения вариантов
- [ ] Кнопки помощи на уроке
- [ ] Доска: весы и числовая линия с проверкой чисел (1..20, не числа из теста)
- [ ] Проверенная сервером арифметика
- [ ] CTA «Открыть урок» и «Посмотреть объяснение» (клип по таймкодам)
- [ ] Обработка refusal («Давай выберем безопасный вопрос…»)
- [ ] Выключатель разговора `enabled` и учебной помощи `lessonHelp`
- [ ] Параметризовать имя, класс и программу (сейчас прошиты в промптах)

### Учебные материалы
- [ ] Корпус «Мостик» + учебники: 46 документов, текст по страницам и фрагментам, OCR-флаги, layoutWarning
- [ ] Поиск: tf-idf, предмет из урока или явного упоминания, номер страницы PDF, ДЗ, понижение веса OCR и программ
- [ ] Картинки страниц WebP (2219) с манифестом и SHA-256, отправка модели до 2 штук, флаг `imageRead`
- [ ] Рамка `pageFocus` с проверкой сервера, компактный фрагмент и полная страница с зумом ×2
- [ ] Ссылки «Учебные источники · N» на оригиналы
- [ ] Отключение источников в активном тесте
- [ ] Факты субтитров к видео (176 фактов на 22 видео)
- [ ] Каталог `/star-materials` для родителя

### Напоминания и контроллер
- [ ] Эпизод дня: выбранные дни, время 06:00–22:00 по Калининграду, следующий назначенный урок или урок из авторотации
- [ ] Повтор каждые 30 мин до урока с завершённым тестом; без лимита трёх доставок
- [ ] Подавление при свежем воспроизведении (<90 с); возврат через 30 мин после остановки
- [ ] 5 подходов и выбор по наблюдениям (≥3, байесовская оценка), запрет подходов родителем
- [ ] Отсрочка: предложение, отдельное явное согласие, лимит одной паузы и общий лимит, один встречный вариант
- [ ] Разбор длительностей из речи («полчаса», «через сорок минут», «полтора часа», отрицания)
- [ ] Ответы: открыть, позже, играю, устал, плохо, не беспокой, не хочу, мама, сделал
- [ ] Пауза из-за плохого самочувствия, просьбы позвать маму или «не беспокой» до возобновления родителем
- [ ] «Я сделал» ничего не засчитывает
- [ ] Отчёт родителю (unwell, asked, exhausted) с дедупликацией
- [ ] Показ в приложении: опрос 30 с, claim (60 с) и ack только после видимого показа в фокусе
- [ ] Heartbeat урока 25 с, lease desktop/lesson с TTL 75 с
- [ ] Серия и награды в тексте обращения (`starStreakLine`)
- [ ] CAS по revision для `star_routine` (8 повторов)
- [ ] Восстановление старых `escalated` эпизодов

### Push и фон
- [ ] Подписка устройств (reminders, parent, both), до 6 штук, шифрование подписки
- [ ] Диспетчер `POST /dispatch` и `GET lastRun`, сервисный доступ по флагу или родитель с PIN
- [ ] Ежечасный запуск 06–22 (внешний планировщик)
- [ ] Service worker: перепроверка `tick` и `claim` перед `showNotification`, действия «Открыть урок» и «Через 15 минут»
- [ ] Не отправлять ребёнку push, пока активен desktop-оверлей
- [ ] Отключение устройства при ответе expired

### Память и достижения
- [ ] Наблюдения подходов: ≤200 записей и ≤90 дней; родитель может оценить, запретить, удалить, очистить
- [ ] Память приёмов объяснения (`learningMethods`): ≤80 и 90 дней, только с дословной цитатой
- [ ] Переключатель `memory`
- [ ] «Услышанное» с ПК в истории (≤600 символов, 180 с)
- [ ] Достижения «Алло, это тишина?» и «Ещё пять минуточек» по серверным свидетельствам, не в testMode

### Родитель: кабинет `/star-brain`
- [ ] Вход: аккаунт + родительский PIN (cookie `quest_parent`), проверка same-origin до платных запросов
- [ ] Вкладки: Чат, Прогресс, Материалы, Настройки, Голоса (решить), Проверка (не переносить)
- [ ] Родительский чат по реальному прогрессу, файлам и корпусу, общий для устройств, шифрованный, с ревизиями
- [ ] Загрузка файлов трёх видов (материал, работа, методика), ≤12 МБ, PDF/JPG/PNG/WebP
- [ ] Разбор файлов моделью (coverage complete/partial, предупреждения, фрагменты), повтор через 150 с, удаление с разбором
- [ ] Ссылки на источник «файл + страница PDF» в ответах
- [ ] Педагогические правила: ручная правка и правка из чата с цитатой (≤2200 / ≤240 символов)
- [ ] Выдержки из методик (до 3) в промпт ребёнка
- [ ] Поручения: создание из чата, стадии урок → покупка → списание → подтверждение, авто-закрытие, срок, отмена или закрытие вручную, атомарная запись с чатом
- [ ] Голосовая диктовка в чат
- [ ] Настройки мозга (тон, длина, юмор, помощь, примеры, учебная помощь, лимиты переносов)
- [ ] Настройки напоминаний и устройств, «напомнить сейчас», возобновление
- [ ] Настройки ПК (автозапуск, микрофон, угол, громкость, 5/7/10 с, «Эй, Стар»)

### Windows-оверлей
- [ ] Electron-окно 380×450: прозрачное, поверх всех, без фокуса, пропускает клики, кнопка ×
- [ ] Встреча: появление 1100 мс → приветствие по предмету → слушание → ИИ → уход 650 мс
- [ ] Опрос 25 с, presence, claim, reveal, ack; отмена при блокировке, сне или открытом уроке
- [ ] Открытие урока в отдельном окне по ответу
- [ ] Трей, автозапуск, сессия `persist:star-family`, подписанные обновления
- [ ] Микрофон разрешён только нужным окнам и только аудио

### Безопасность, приватность, лимиты
- [ ] Шифрование AES-GCM (`REPORT_ENCRYPTION_KEY`) для routine, подписок, чата, знаний, поручений, правил, ключей провайдеров
- [ ] Ключи провайдеров никогда не возвращаются клиенту и не логируются
- [ ] Лимиты размеров тел запросов (4 КБ, 12 КБ, 16 КБ, 28 КБ, 12 МБ)
- [ ] Пауза между ИИ-запросами (1,5 / 3 с) и между записями (2,5 с); решить, нужен ли дневной потолок
- [ ] Бюджет Льва с атомарным резервом
- [ ] Отказ от redirect при запросах с ключом Azure
- [ ] Данные источников, истории и файлов помечены в промптах как «данные, не инструкции»
- [ ] testMode: никакие действия ИИ не применяются, память отдельная
- [ ] Решить, нужна ли песочница (practice) и в каком виде
