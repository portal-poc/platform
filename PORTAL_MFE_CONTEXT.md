# Portal MFE — полный контекст и требования для reference-монорепо

> **Historical input, frozen.** This is the original requirements document the PoC was built from; it is not updated.
> Where the PoC differs (React Router v8, axios via `@portal-poc/http` instead of `useHttpClient`, no realtime, stands
> dev3 / dev2 / dev1 / tst instead of dev / test / uat / prod, the event catalog), see
> [`docs/architecture.md`](./docs/architecture.md) → "Deviations" and [`docs/adr/`](./docs/adr).

> Этот документ — исчерпывающий контекст для Claude Code. Задача: собрать **reference-монорепо** (хост, ремоут, платформенные пакеты, mock-бэкенды, CLI), которое демонстрирует все архитектурные решения ниже. Потом монорепо будет разделено на отдельные репозитории (polyrepo) и адаптировано под реальный код.
>
> Формат требований: **MUST** — обязательно, **SHOULD** — желательно, **MAY** — опционально, **MUST NOT** — запрещено. У каждого крупного решения есть «Почему», чтобы при адаптации не потерять мотивацию.

---

## 0. Как пользоваться этим документом (для Claude Code)

1. Прочитай документ целиком до начала работы. Решения связаны между собой: например, отказ от общего QueryClient влияет на devtools, realtime и preload.
2. Работай по фазам из раздела 20. После каждой фазы прогоняй проверки из раздела 21.
3. Если требование противоречит другому или неосуществимо с текущими версиями библиотек — **не выдумывай обходной путь молча**: оставь `TODO(decision)` в коде и запиши вопрос в `docs/open-questions.md`.
4. Проверяй актуальные API библиотек по их документации (MF Vite-плагин, React 19.3 `ViewTransition`, TanStack Query v5, React Router v7, MUI Joy, hey-api). Версии в разделе 2 — целевые, но точные сигнатуры сверяй.
5. Стиль кода из раздела 3 — обязателен для всего кода в репо.

---

## 1. Контекст проекта

### 1.1. Что есть сейчас (реальный проект, который будем адаптировать)

- Портал на микрофронтендах: **Module Federation + Vite + React 19**, TypeScript, **pnpm**, **MUI Joy UI** (через дизайн-систему-обёртку), **TanStack Query v5**, **React Hook Form**, **zod** (валидация форм через resolver), **React Router** (не TanStack Router), **React Compiler** (поэтому `useMemo`/`useCallback`/`memo` запрещены правилом линтера), линтер **oxlint**, тесты **Vitest**, CI **Azure DevOps**, Node пинится через **Volta**.
- Бэкенд: у хоста и у каждого ремоута **свой BFF** (Java). BFF получают **тот же bearer**, с которым авторизуется хост (MSAL / Entra ID). Java BFF обогащают данные из core-сервисов, на Java-стороне используется Temporal.
- Авторизация: **MSAL `PublicClientApplication`** живёт в хосте. Сейчас http-клиент, привязанный к MSAL, приходит из хоста через React-контекст (`useHttpClient()`), а его методы `get/post/put/patch/delete` инжектятся в фабрики `queryOptions`/mutation options внутри хуков.
- Сейчас **QueryClient — синглтон в хосте**, общий для ремоутов. Каждый ремоут вручную делает standalone-версию со своим QueryClient для разработки и для запуска вне хоста. Кросс-приложенческое обновление (например, букмарки) сделано хаками через общий QueryClient. **Это уходит** (см. раздел 9, 12).
- React — MF-синглтон. MF Bridge пока не используется.
- Приложение закрытое (внутреннее), за прокси с дополнительными проверками и многоуровневыми банковскими системами доступа. Фронтовое security-hardening ремоутов — **низкий приоритет сейчас** (см. 8.6).
- Ремоуты должны жить в **отдельных репозиториях (polyrepo)**: банк не хочет всех в одном репо, будут ремоуты от команд из других кластеров. Каждый ремоут публикует статическую сборку (Nexus или аналог), хост грузит её в рантайме.
- Команда утвердила **Feature-Sliced Design v2.1** (pages first): слои `app`, `pages`, `shared` — всегда; `entities`, `features`, `widgets` — по требованию.
- Бэкенд хочет **shared-репо с OpenAPI-спеками**, из которого генерируются Java-классы и TS-типы + zod-схемы; фронтовая часть публикуется npm-пакетом (см. раздел 15).

### 1.2. Цели reference-монорепо

- MUST показать рабочий хост + минимум один ремоут в **интегрированном режиме** (общий React, общий роутер, transitions/Suspense/ViewTransition через границу хост→ремоут работают).
- MUST показать **standalone-режим** ремоута тем же кодом `RemoteRoot`.
- MUST показать **изолированный режим (MF Bridge)** как fallback (может быть фаза-опция, см. раздел 20).
- MUST реализовать платформенные пакеты по контракту из этого документа.
- MUST содержать mock-бэкенды (BFF хоста, BFF ремоута, брокер событий вместо Kafka, realtime-каналы) для сквозных сценариев.
- MUST содержать CLI: генерация ремоута, добавление FSD-слайсов, `verify`.
- MUST покрыть сценарии из раздела 19 (они же — приёмочные критерии).

### 1.3. Не цели

- MUST NOT реализовывать реальную интеграцию с Entra ID как обязательную для запуска демо: по умолчанию mock-auth, MSAL-адаптер — реализован, но включается конфигом.
- MUST NOT делать общий кэш данных между приложениями.
- MUST NOT делать префетч данных ремоута из хоста сейчас — но архитектура MUST оставлять эту возможность (раздел 13).
- MUST NOT строить frontend-security-изоляцию ремоутов (iframe и т.п.).

---

## 2. Стек и версии (целевые)

| Что | Версия / выбор | Примечание |
|---|---|---|
| Node | LTS, пин через Volta в root `package.json` | если Volta недоступна (заблокированная машина, работа в WSL) — дублировать версию в `engines` и `.nvmrc` |
| Пакетный менеджер | pnpm workspaces | `.npmrc` с плейсхолдером реестра Nexus |
| React / React DOM | **19.3+** | `ViewTransition` стабилен с 19.3 (вышел 9 сентября 2026, без breaking changes относительно 19.2) |
| React Compiler | включён | `useMemo`/`useCallback`/`memo` запрещены |
| Сборка | Vite + `@module-federation/vite` | сверить актуальный плагин MF 2.0 для Vite |
| MF Bridge | `@module-federation/bridge-react` | только для изолированного режима |
| Роутинг | React Router v7, **data router** (`createBrowserRouter`) | data router нужен для `useNavigation`, `lazy`, `loader` (будущий preload) |
| UI | MUI Joy через пакет `@portal/ds` | emotion — синглтон |
| Данные | TanStack Query v5 | **не** MF-синглтон |
| Формы | React Hook Form + zod resolver | |
| Валидация | zod (целевой мажор указать явно, генерация под него) | |
| Кодоген API | hey-api (в репо `api-contracts`) | types + zod, без http-клиента |
| Тесты | Vitest + Testing Library; e2e — Playwright (MAY) | |
| Линт | oxlint + Steiger (FSD) | |
| Mock-бэкенды | Node.js + Express (или Fastify), TypeScript | |
| TS | `strict: true` в reference-монорепо | в реальном проекте strict сейчас выключен — пометить в docs как отличие |

---

## 3. Стиль кода (MUST для всего кода в репо)

- MUST NOT использовать `any`. Использовать дженерики библиотек для вывода типов (RHF field paths, `queryOptions` + DataTag для `setQueryData`, и т.д.). Где тип неизвестен — `unknown` + сужение.
- MUST выносить логику в именованные функции, а не писать её инлайном (обработчики, мапперы, предикаты, селекторы).
- MUST всегда ставить фигурные скобки вокруг тела `if`. Никаких однострочных `if (x) return y;`.
- MUST использовать стрелочные функции вместо `function`-деклараций (компоненты тоже: `export const Foo = () => ...`).
- MUST NOT использовать `useMemo`, `useCallback`, `React.memo` — работает React Compiler. Правило в oxlint (`no-restricted-imports` или аналог).
- RHF: SHOULD использовать `useWatch`/`useFormState`/`useController` вместо `watch()` (совместимость с React Compiler).
- Компонентные файлы — PascalCase, остальные — kebab-case.
- Публичные API пакетов и FSD-слайсов — только через `index.ts`.

---

## 4. Структура монорепо

```
portal-reference/
├─ package.json                 # pnpm workspaces, volta, общие скрипты
├─ pnpm-workspace.yaml
├─ .npmrc                       # registry=<NEXUS_PLACEHOLDER>
├─ docs/
│  ├─ architecture.md           # краткий обзор + ссылки на этот документ
│  ├─ adr/                      # ADR по ключевым решениям (раздел 22)
│  └─ open-questions.md
├─ apps/
│  ├─ host/                     # хост-приложение
│  ├─ tasks-remote/             # ремоут A (FSD 2.1), сгенерирован из шаблона CLI
│  └─ legacy-remote/            # (опц.) ремоут на другой версии React для bridge-демо
├─ packages/
│  ├─ platform-contract/        # @portal/platform-contract — только типы контракта
│  ├─ platform-runtime/         # @portal/platform-runtime — провайдеры, фабрики, хуки, devtools, realtime
│  ├─ ds/                       # @portal/ds — дизайн-система (Joy) + примитивы загрузки
│  ├─ mf-shared/                # @portal/mf-shared — (опц.) хелпер shared-конфига + константы exposes
│  ├─ presets/                  # @portal/presets — (опц.) tsconfig/oxlint/vitest/steiger пресеты
│  └─ portal-cli/               # portal-cli — create / add / verify
├─ api-contracts/               # симуляция shared-репо бэкенда с OpenAPI-спеками
│  ├─ specs/
│  │  ├─ host-bff.yaml
│  │  └─ tasks-bff.yaml
│  ├─ packages/
│  │  ├─ host-bff-api/          # @portal-api/host-bff  (сгенерировано: types + zod)
│  │  └─ tasks-bff-api/         # @portal-api/tasks-bff (сгенерировано: types + zod)
│  └─ scripts/                  # генерация, lint спек, oasdiff
└─ mock-backend/
   ├─ broker/                   # in-memory брокер событий вместо Kafka
   ├─ host-bff/                 # BFF хоста: букмарки-агрегат, realtime-канал хоста
   └─ tasks-bff/                # BFF ремоута: задачи, букмарки ремоута, realtime-канал ремоута
```

Правила:
- MUST: `apps/*` зависят от `packages/*` и `api-contracts/packages/*` через `workspace:*`, но **код приложений не должен знать, что он в монорепо**: никаких относительных импортов между приложениями, только пакеты. Это нужно, чтобы потом разрезать на polyrepo без переписывания.
- MUST: `apps/tasks-remote` должен быть **эквивалентен выходу `portal-cli create remote tasks`** (раздел 16). Идеально — сгенерирован им и затем дополнен демо-фичами.
- MUST: каждый `apps/*` собирается и запускается независимо (`pnpm --filter <app> dev|build|preview`).

---

## 5. Уровни доставки кода (кто что владеет)

| Уровень | Что | Доставка | Ремоут может менять? |
|---|---|---|---|
| Runtime-синглтоны | `react`, `react-dom`, `react-router`, `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal/ds` | MF shared, `singleton: true`, диапазон версий | Нет, только в пределах диапазона |
| Версионируемые пакеты (бандлятся в каждое приложение) | `@portal/platform-contract` (типы), `@portal/platform-runtime`, TanStack Query, RHF, zod | npm, своя версия у каждого приложения | Версию — да |
| API-контракт | `@portal-api/<bff>` (types + zod) | npm из shared-репо бэкенда | Версию — да; может писать типы руками |
| Контракт интеграции | имя ремоута, имена и сигнатуры exposes, список shared-синглтонов и диапазоны, версия `platform-contract` | шаблон CLI + `portal-cli verify` + рантайм-проверка хоста | Нет |
| Внутренние конфиги | tsconfig, oxlint, Steiger, Vitest, остальной Vite, пайплайн | шаблон CLI (генерируется один раз), пресеты — по желанию | Да, как угодно |

**Почему:** синглтоном делаем только то, где **идентичность объекта** должна совпадать между деревом хоста и деревом ремоута (React-контексты: роутер, тема emotion/Joy, DS). Всё, что можно передать значением — через контракт пропсами. Всё, что должно быть одинаковым, но не требует общей идентичности — версионируемые пакеты. Это минимизирует навязывание стека другим командам.

Отдельное напряжение: DS-синглтон означает, что все на одном мажоре DS. Ослабление: тема Joy на CSS-переменных, чтобы визуальная согласованность держалась на токенах (записать в `open-questions.md`).

---

## 6. Пакет `@portal/platform-contract` (только типы)

MUST содержать **только типы и одну константу версии контракта** (никакого другого рантайм-кода, ноль зависимостей от TanStack Query/MSAL/React). Это единственное, о чём обязаны договориться все команды.

```ts
// packages/platform-contract/src/index.ts

export const PLATFORM_CONTRACT_VERSION = 1 as const; // единственная константа; допустимо как const-тип
export type PlatformContractVersion = typeof PLATFORM_CONTRACT_VERSION;

export type PlatformContract = {
  contractVersion: PlatformContractVersion;
  auth: PlatformAuth;
  env: PlatformEnv;
  events: PlatformEventBus;
  telemetry: PlatformTelemetry;
  locale: PlatformLocale;
  devtools?: PlatformDevtools;
  bridge?: PlatformBridgeOptions; // только для изолированного режима (MF Bridge)
};

// ---------- auth ----------
export type PlatformAccount = {
  id: string;
  username: string;
  displayName: string;
  tenantId?: string;
  claims?: Readonly<Record<string, unknown>>;
};

export type PlatformAuthEvent =
  | { type: 'login'; account: PlatformAccount }
  | { type: 'logout' }
  | { type: 'account-changed'; account: PlatformAccount }
  | { type: 'token-refresh-failed'; reason: string };

export type PlatformAuth = {
  /** Возвращает access token под scopes. Scopes проверяются по allowlist ремоута. Никогда не запускает интерактив сама. */
  getAccessToken: (scopes: readonly string[]) => Promise<string>;
  getAccount: () => PlatformAccount | null;
  subscribe: (listener: (event: PlatformAuthEvent) => void) => () => void;
  /** Просит хост провести интерактивный логин/consent (redirect). Ремоут сам redirect/popup НЕ делает. */
  requestInteraction: (scopes: readonly string[]) => Promise<void>;
};

// ---------- env ----------
export type PlatformEnv = {
  name: 'local' | 'dev' | 'test' | 'uat' | 'prod' | (string & {});
  /** Адреса конкретных BFF ремоут берёт из своего runtime-конфига; хост их не знает. */
  hostOrigin: string;
};

// ---------- локальная шина событий (браузер, между приложениями) ----------
export type PlatformEventMap = {
  'bookmarks.changed': { source: string; correlationId?: string };
  // расширяется через declaration merging в приложениях
};

export type PlatformEventBus = {
  emit: <TName extends keyof PlatformEventMap>(name: TName, payload: PlatformEventMap[TName]) => void;
  subscribe: <TName extends keyof PlatformEventMap>(
    name: TName,
    listener: (payload: PlatformEventMap[TName]) => void,
  ) => () => void;
};

// ---------- telemetry ----------
export type PlatformTelemetry = {
  logError: (error: unknown, context?: Readonly<Record<string, unknown>>) => void;
  trackEvent: (name: string, properties?: Readonly<Record<string, unknown>>) => void;
};

// ---------- locale ----------
export type PlatformLocale = {
  language: string; // 'en' | 'fr' | ...
  subscribe: (listener: (language: string) => void) => () => void;
};

// ---------- devtools ----------
/** Ремоут монтирует СВОИ devtools в DOM-контейнер хоста. Хост не получает QueryClient. */
export type MountDevtoolsPanel = (container: HTMLElement) => () => void;

export type PlatformDevtools = {
  /** Регистрирует панель (вызывается при создании QueryClient ремоута). Возвращает функцию снятия регистрации. */
  registerPanel: (name: string, mount: MountDevtoolsPanel) => () => void;
  /** Помечает, что роуты приложения сейчас смонтированы (для автовыбора). Возвращает функцию «размонтирован». */
  markMounted: (name: string) => () => void;
};

// ---------- bridge (изолированный режим) ----------
export type PlatformBridgeOptions = {
  basename: string;
  navigateToHost: (path: string) => void;
};
```

Требования:
- MUST NOT включать `realtime` в контракт: у каждого приложения своё соединение к своему BFF (раздел 12).
- MUST NOT включать http-клиент в контракт: ремоут собирает его сам из `auth.getAccessToken` и адреса своего BFF (хост не должен знать адреса BFF ремоутов).
- MUST NOT включать QueryClient/типы TanStack в контракт.
- Эволюция контракта: SHOULD только аддитивные изменения; ломающее изменение → бамп `PLATFORM_CONTRACT_VERSION`, хост поддерживает диапазон версий (раздел 17).

---

## 7. Пакет `@portal/platform-runtime`

Бандлится в каждое приложение (НЕ синглтон). Контекст `PlatformProvider` **не обязан** быть синглтоном, потому что ремоут всегда сам оборачивает себя провайдером из пропсов (раздел 10.3).

### 7.1. Состав (публичный API)

```
@portal/platform-runtime
├─ provider/      PlatformProvider, usePlatform, usePlatformAuth, usePlatformEvents, ...
├─ auth/          createRemoteAuth (allowlist), createMsalPlatformAuth (адаптер MSAL),
│                 createMockPlatformAuth (для локалки/демо), useClearCacheOnAccountChange
├─ http/          createHttpClient
├─ query/         createPortalQueryClient (фабрика с общими дефолтами)
├─ realtime/      createRealtimeClient, RealtimeProvider, useInvalidateOnEvent, useRealtimeStatus
├─ events/        createPlatformEventBus
├─ telemetry/     createConsoleTelemetry (демо)
├─ devtools/      createDevtoolsRegistry, DevtoolsToolbar, createQueryDevtoolsMount, useMarkMounted
├─ standalone/    createStandalonePlatform
└─ compat/        isSameReactInstance, isContractVersionSupported
```

### 7.2. `createPortalQueryClient`

- MUST быть **фабрикой**, а не инстансом.
- Дефолты (SHOULD, обсуждаемо): разумный `staleTime` (например 30 с), `retry` — не ретраить 401/403/404 и ошибки zod-валидации, ретраить сетевые/5xx до 2 раз; `refetchOnWindowFocus: true` (страховка для пропущенных realtime-событий); общий `onError` в `QueryCache`/`MutationCache` → `telemetry.logError`.
- Принимает опции для переопределения.

### 7.3. `createHttpClient`

```ts
type HttpClientOptions = {
  baseUrl: string;
  scopes: readonly string[];
  auth: PlatformAuth;
  telemetry?: PlatformTelemetry;
};
// возвращает { get, post, put, patch, delete } с дженериками и обязательной zod-схемой ответа:
// get: <TSchema extends z.ZodType>(path: string, schema: TSchema, init?: RequestOptions) => Promise<z.infer<TSchema>>
```
- MUST добавлять `Authorization: Bearer <token>` из `auth.getAccessToken(scopes)`.
- MUST валидировать ответ zod-схемой (ответы с бэкенда — граница доверия).
- MUST на 401 один раз повторить запрос после повторного получения токена; если снова 401 и это `InteractionRequired` — вызвать `auth.requestInteraction(scopes)`.
- MUST поддерживать `X-Correlation-Id` (генерировать на мутации, раздел 12.5).
- MUST поддерживать `AbortSignal` (TanStack передаёт `signal` в `queryFn`).
- Методы инжектятся в фабрики `queryOptions`/mutation options внутри хуков (сохраняем текущую конвенцию проекта).

### 7.4. Auth-адаптеры

- `createMsalPlatformAuth(pca)` — реализация `PlatformAuth` поверх **одного** `PublicClientApplication`. `subscribe` — обёртка над `pca.addEventCallback`/`removeEventCallback` с маппингом в `PlatformAuthEvent`. `getAccessToken` — `acquireTokenSilent` с активным аккаунтом. `requestInteraction` — централизованный `acquireTokenRedirect` (в хосте одна точка интерактива).
- `createRemoteAuth(baseAuth, remoteName, allowedScopes)` — обёртка для каждого ремоута: проверяет scopes по allowlist, бросает ошибку при запрещённом scope; на `InteractionRequiredAuthError` не делает интерактив, а пробрасывает в `requestInteraction`.
- `createMockPlatformAuth({ account, tokenTtlMs })` — фейковые токены (непрозрачная строка с exp), события login/logout/account-changed по кнопке в демо-панели. Используется по умолчанию в демо.
- `useClearCacheOnAccountChange(platform, getQueryClient)` — на `logout`/`account-changed` делает `queryClient.clear()`.

Правила MSAL (MUST, задокументировать в `docs/adr`):
- Один `PublicClientApplication` на одну app registration на странице. Второй инстанс с тем же clientId → `interaction_in_progress` и сломанные redirect.
- Интерактивный логин — **только хост**.
- Токены MUST NOT попадать в URL (query string) ни в http, ни в realtime.

Ремоуты, которым «нужна своя авторизация» (реальная проблема: часть ремоутов интегрирована задним числом и использует авторизацию, отличную от глобальной хоста). Задокументировать как три случая:
1. **Тот же тенант, другой API.** Отдельная авторизация не нужна: хост получает токен под scopes их API через `getAccessToken`; app registration хоста выдаются права на их API (admin consent). Это MUST быть путём по умолчанию.
2. **Отдельная app registration у команды.** Предпочтительно свести к случаю 1. Если нельзя — второй PCA с **другим** clientId допустим только в тихом режиме: `ssoSilent` с `loginHint` из аккаунта хоста, никаких redirect/popup со стороны ремоута. `ssoSilent` использует скрытый iframe → проверить при блокировке сторонних cookies в браузере банка. В демо — MAY пример адаптера `createSecondaryMsalAuth`, выключенный по умолчанию.
3. **Другой IdP / другой кластер.** Задача бэкенда: фронт отдаёт токен хоста, BFF ремоута обменивает его через On-Behalf-Of. Это убирает «зоопарк» авторизаций из браузера. Долгосрочно для банка — обсудить BFF, держащий токены (cookie-сессия), чтобы токенов в браузере не было вовсе.

Источник правды по правам — бэкенд (пример: эндпоинт разрешённых действий `process-actions`). Access gates в UI — для удобства, не для защиты; реализуются suspense-запросами прав внутри приложения и используют тот же отложенный фоллбэк.

### 7.5. `createPlatformEventBus`

- Реализация `PlatformEventBus` на `EventTarget`/`CustomEvent` внутри вкладки. MAY опция `BroadcastChannel` для межвкладочной доставки (выключена по умолчанию: межвкладочное покрывает серверный realtime).
- Используется как **опциональный быстрый путь** (раздел 12.5), не как основной механизм инвалидации.

### 7.6. Realtime (раздел 12 — подробно)

`createRealtimeClient({ url, auth, scopes, telemetry, transport })`, `RealtimeProvider`, `useInvalidateOnEvent(topic, queryKeyOrPredicate, options)`, `useRealtimeStatus()`.

### 7.7. Devtools (раздел 11 — подробно)

`createDevtoolsRegistry()`, `DevtoolsToolbar`, `createQueryDevtoolsMount(queryClient)`.

### 7.8. `createStandalonePlatform(config)`

Собирает полный `PlatformContract` для standalone-режима ремоута: свой PCA (или mock-auth по конфигу), свой event bus, своя телеметрия, свой devtools-реестр. MUST возвращать тот же тип, что даёт хост, чтобы `RemoteRoot` не знал, где он запущен.

### 7.9. `compat`

- `isSameReactInstance(remoteCreateElement)` — сравнение **по ссылке** функции `createElement` хоста и ремоута. MUST NOT сравнивать строку `React.version` (одинаковая версия ≠ один инстанс).
- `isContractVersionSupported(version, supportedRange)`.

---

## 8. Пакет `@portal/ds` (дизайн-система + примитивы загрузки)

MF-синглтон. Обёртка над MUI Joy + токены + примитивы загрузки. Здесь же фиксируются все правила индикации загрузки.

### 8.1. Принципы паттерна загрузки

- До **300 мс** — никакого лоадера.
- После 300 мс — индикатор на месте действия (кнопка) или спиннер фоллбэка.
- После **2 с** — блокирующий оверлей региона.
- Индикация задерживается **CSS-средствами**, а не JS-таймерами, везде, где это возможно: ноль ререндеров, анимация только `opacity`/`transform` (компоризитор), работает и в Suspense-фоллбэках (у которых нет boolean для задержки).
- `minDuration` (защита от мигания) в CSS эмулируется коротким fade-in: если контент пришёл сразу после порога, спиннер успевает проявиться лишь на несколько процентов прозрачности.
- React 19 троттлит раскрытие Suspense-контента после коммита фоллбэка (~300 мс, `FALLBACK_THROTTLE_MS`, в dev и prod; `act()` его обходит, поэтому в unit-тестах не видно). Следствие: при задержке спиннера ≥ 300 мс быстрые загрузки спиннер не покажут никогда. Задокументировать в ADR.
- MUST уважать `prefers-reduced-motion`.

### 8.2. `Spinner`

- Проп `delay` (мс), по умолчанию **300**; записывается в CSS-переменную `--spinner-delay`. `delay={0}` — без задержки (когда задержка решена снаружи, например в кнопке).
- CSS:
  ```css
  .spinner {
    --spinner-delay: 300ms;
    animation:
      spinner-in 150ms var(--spinner-delay) both,
      spinner-rotate 800ms linear var(--spinner-delay) infinite;
  }
  @keyframes spinner-in { from { opacity: 0; } to { opacity: 1; } }
  ```
- MUST использоваться как дефолтный фоллбэк Suspense во всём портале (хост и ремоуты), чтобы «матрёшка» лоадеров хоста и ремоута выглядела как один лоадер.

### 8.3. `PendingRegion` + `AsyncButton` (стадии без лишних рендеров)

- `PendingRegion({ isPending, children })` ставит **один** атрибут `data-pending` и `aria-busy`; все стадии разводит CSS асимметричными `transition-delay` (задержка на входе, без задержки на выходе).
  ```css
  .btn-spinner { opacity: 0; transition: opacity 120ms; }
  [data-pending] .btn-spinner { opacity: 1; transition-delay: 300ms; }

  .pending-overlay { opacity: 0; visibility: hidden; transition: opacity 150ms, visibility 0s 150ms; }
  [data-pending] .pending-overlay { opacity: 1; visibility: visible; transition: opacity 200ms 2s, visibility 0s 2s; }
  ```
- `AsyncButton({ isPending, ... })`: MUST быть `disabled` **сразу** по `isPending` (защита от двойного сабмита в первые 300 мс), визуальный спиннер — через 300 мс. Спиннер в том же grid-слое, что и лейбл → ширина кнопки не прыгает.
- Пороги — CSS-переменные (`--pending-button-delay: 300ms`, `--pending-overlay-delay: 2s`), переопределяемые.
- Объявление «всё ещё загружается» для скринридеров: **единственное место**, где нужен JS — `aria-live`-регион, который включается через `useSpinDelay(isPending, { delay: 2000 })` (пакет `spin-delay`) или эквивалент.

### 8.4. `useLoadingStage` (JS-вариант, когда стадия нужна логике)

Для случаев, когда стадия влияет на логику/текст/аналитику (а не только на визуал):
```ts
type LoadingStage = 'idle' | 'button' | 'blocking';
// реализация: два useSpinDelay с разными delay поверх одного isPending, ssr: false
```
SHOULD использоваться редко; по умолчанию — CSS.

### 8.5. `AsyncBoundary`

Generic async boundary: `QueryErrorResetBoundary` + `ErrorBoundary` (react-error-boundary) + `Suspense` с `Spinner`-фоллбэком по умолчанию. Пропы для кастомного фоллбэка/ошибки. Ошибки рендерятся через DS `Alert` (в реальном проекте `Alert` принимает `title` пропом).

### 8.6. Безопасность (принятый риск)

Задокументировать в ADR: ремоуты исполняются в том же origin и JS-реалме; allowlist scopes защищает от ошибок, не от злого умысла. Сейчас — **осознанно принятый риск** (закрытое приложение, прокси, многоуровневый доступ, контролируемый Nexus). Минимум, который MUST быть: CSP с allowlist источников ремоутов (`script-src`/`connect-src`) в конфиге хоста.

---

## 9. QueryClient: у каждого приложения свой

**Решение:** общий QueryClient не нужен — хост и каждый ремоут ходят только в свой BFF; shared-кэш данных не нужен. Каждый ремоут **всегда** владеет своим QueryClient, в любом режиме.

- MUST: `getRemoteQueryClient(platform)` — ленивый **модульный синглтон** в `shared/api/query-client.ts` ремоута. Создаётся при первом обращении (не в теле `RemoteRoot`), через `createPortalQueryClient()`.
- MUST: при создании клиента ремоут регистрирует свою devtools-панель (`platform.devtools?.registerPanel`) — раздел 11.
- MUST: `useClearCacheOnAccountChange` в `RemoteRoot`.
- MUST: query keys начинаются с неймспейса приложения, затем доменный scope (`['tasks', 'list', filters]`, `['tasks', 'detail', taskId]`). После разделения кэшей это не обязательно для корректности, но MUST сохраняться ради читаемости в devtools.
- MUST: ключи — из фабрик `queryOptions(...)`, чтобы `setQueryData(options.queryKey, ...)` выводил тип через DataTag без `any`.
- MUST: отдельный `QueryClientProvider` ремоута внутри дерева хоста не ломает transitions/Suspense/ViewTransition — им нужен общий корень React, а не общий кэш. Проверить в демо.

---

## 10. Module Federation: режимы интеграции

### 10.1. Shared

- MUST синглтоны: `react`, `react-dom` (диапазон, например `^19.3.0`), `react-router` (+ `react-router-dom`, если используется), `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal/ds`.
  - **Почему `react-router`:** ремоут в интегрированном режиме рендерит свои `<Routes>` внутри роутера хоста; без общего объекта контекста `useNavigate` ремоута не видит роутер.
  - **Почему emotion/Joy:** тема Joy держится на контексте emotion; две копии → две темы и дубли стилей.
- MUST NOT синглтоны: `@tanstack/react-query`, `react-hook-form`, `zod`, `@portal/platform-runtime`. MAY: `@tanstack/react-query` как shared **без** singleton для дедупликации совпадающих версий — оптимизация, не требование.
- Нюанс MF (задокументировать): `singleton: true` при несовпадении версии обычно не подключает собственную копию ремоута — даёт предупреждение и использует общий инстанс; `strictVersion: true` → ошибка. Поэтому «шарить, если совместимо, иначе своя копия» конфигом не гарантируется → **решаем рантайм-проверкой** (10.4). Поведение конкретного Vite-плагина MF проверить на стенде и записать в docs.

### 10.2. Exposes ремоута (часть контракта интеграции)

| Expose | Что | Режим |
|---|---|---|
| `./RemoteRoot` | компонент `RemoteRoot({ platform })` | интегрированный (общий React) |
| `./RemoteBridge` | `createBridgeComponent({ rootComponent: RemoteRoot })` | изолированный |
| `./runtime` | `export const remoteCreateElement = createElement; export const contractVersion = ...` | проверка совместимости |
| `./preload` | заглушка `preload(platform, params)` | будущее (раздел 13) |

MUST: имена exposes фиксированы (константы в `@portal/mf-shared` или в шаблоне CLI) и проверяются `portal-cli verify`.

### 10.3. `RemoteRoot` — одинаковый для всех режимов

```tsx
type RemoteRootProps = { platform: PlatformContract };

export const RemoteRoot = ({ platform }: RemoteRootProps) => {
  useClearCacheOnAccountChange(platform, () => getRemoteQueryClient(platform));
  useMarkMounted(platform, REMOTE_NAME); // devtools autoselect

  return (
    <PlatformProvider value={platform}>
      <QueryClientProvider client={getRemoteQueryClient(platform)}>
        <RealtimeProvider client={getRemoteRealtimeClient(platform)}>
          <RemoteRoutes />
        </RealtimeProvider>
      </QueryClientProvider>
    </PlatformProvider>
  );
};
```

- MUST: контракт **всегда** приходит пропом во входную точку; ремоут **сам** поднимает `PlatformProvider` и всё остальное. Не полагаться на контекст хоста (в polyrepo `Provider` хоста и `useContext` ремоута могут ссылаться на разные объекты контекста → `undefined`).
- MUST: ремоут не знает, в каком режиме запущен. Разница только в том, кто собрал `platform` (хост или `createStandalonePlatform`) и кто дал роутер.
- Роутинг ремоута: в интегрированном режиме — `<Routes>` под роутом хоста `tasks/*`; в standalone — свой `createBrowserRouter`, оборачивающий те же роуты; в bridge — свой роутер с `platform.bridge.basename`.

### 10.4. Выбор режима в хосте (dual entry + проверка идентичности)

```ts
const isSameReactInstance = async (): Promise<boolean> => {
  const runtime = await import('tasks/runtime');
  return runtime.remoteCreateElement === createElement;
};

const loadTasksEntry = async () => {
  if (await isSameReactInstance()) {
    return import('tasks/RemoteRoot');      // интегрированный режим
  }
  return import('tasks/RemoteBridge');      // изолированный режим
};
```
- MUST: один компонент хоста `<RemoteApp name="tasks" />`, который прячет разницу сигнатур (bridge-ветка через `createRemoteAppComponent` с тем же лоадером).
- MUST: также проверять `contractVersion` (раздел 17). Несовместимо → понятная ошибка в `AsyncBoundary`, а не белый экран.
- Политика: команды в диапазоне `^19.3` автоматически получают интегрированный режим; остальные — изолированный. Никого не заставляем, совместимость поощряется лучшей интеграцией.

### 10.5. Ограничения изолированного режима (bridge) — задокументировать

- Bridge рендерит ремоут в **собственный корень** (`createRoot(info.dom)`). Даже при общем инстансе React — это другое дерево.
- Не пересекают границу: transitions (`isPending` хоста не ждёт данных ремоута), Suspense (фоллбэк хоста остаётся на стороне хоста, у ремоута свой boundary), React-контекст, ViewTransition хоста (анимирует только контейнер; ремоут рендерится асинхронно после коммита хоста).
- На документ одновременно может идти **один** view transition; новый прерывает текущий → хост и ремоут могут сбивать анимации друг друга.
- Bridge проксирует `react-router-dom` через alias в конфиге сборки → всё равно привязка к роутеру; проверить совместимость с Vite-плагином MF.
- Bridge — **исключение и только уровня роута** (легаси на другой версии React, другой фреймворк, купленный продукт). Всё, что встраивается внутрь страниц хоста (виджеты, формы, списки), — только интегрированный режим.
- Вес: каждая лишняя версия React — ещё один `react-dom-client` (~90+ КБ gzip).

---

## 11. Devtools TanStack Query в мульти-клиентной среде

**Решение:** хост **не получает** QueryClient ремоутов. Ремоут регистрирует **функцию монтирования** своих devtools; хост даёт только DOM-контейнер и переключатель.

**Почему:** передача клиента наверх связывает версии (devtools хоста другой версии + клиент ремоута другой версии) и даёт хосту управление чужим кэшем (кнопки refetch/reset/remove в devtools).

### 11.1. Ремоут

```ts
// shared/api/query-client.ts
let queryClient: QueryClient | null = null;

const createAndRegisterQueryClient = (platform: PlatformContract): QueryClient => {
  const client = createPortalQueryClient();
  platform.devtools?.registerPanel(REMOTE_NAME, createQueryDevtoolsMount(client));
  return client;
};

export const getRemoteQueryClient = (platform: PlatformContract): QueryClient => {
  if (!queryClient) {
    queryClient = createAndRegisterQueryClient(platform);
  }
  return queryClient;
};
```

`createQueryDevtoolsMount(client)` (в `platform-runtime`):
- MUST динамически импортировать devtools внутри `mount` (в prod-бандле это отдельный чанк, грузится только при открытии панели).
- Рендерит `ReactQueryDevtoolsPanel client={client}` в **отдельный корень** внутри контейнера (интеграция с деревом хоста не нужна) — или ванильный `TanstackQueryDevtoolsPanel` из `@tanstack/query-devtools` с `mount/unmount` (сверить параметры конструктора).
- MUST передавать `shadowDOMTarget` (контейнер с shadow root) — изоляция стилей разных версий devtools.
- Регистрация происходит **при создании QueryClient**, а не при монтировании роута (иначе не видно данных, загруженных до монтирования, например будущим preload).

### 11.2. Хост: реестр и тулбар

- `createDevtoolsRegistry()`: `Map<name, { mount, mountCount, registeredAt }>`, `registerPanel`, `markMounted` (счётчик, не boolean — StrictMode двойные эффекты, ремоут смонтирован в двух местах), `subscribe`, `getSnapshot` (иммутабельный снапшот для `useSyncExternalStore`).
- `DevtoolsToolbar`: собственная кнопка-тоггл + `<select>` клиентов + выдвижная панель-контейнер с shadow root. Плавающий кружок TanStack не используется — у всех `*Panel`-варианты, включая хост.
- Автовыбор:
  - ровно один смонтированный ремоут → он;
  - иначе (только страницы хоста или несколько виджетов-ремоутов) → `host`;
  - ручной выбор закрепляется (pin) и отключает автопереключение; pin хранится в `localStorage` с try/catch.
- Состояния в селекте: «● смонтирован», «○ загружен (кэш жив до gcTime)», «📌 закреплён». Незагруженные ремоуты в списке не показываются (MAY: серым из манифеста, без действия). **Не** загружать ремоут по клику в devtools.
- При смене выбора: `unmount()` предыдущей панели, `mount(container)` следующей.
- Хост регистрирует свой клиент под именем `host` один раз в корне.
- Prod/стенды: тулбар рендерится только в dev **или** за флагом (`?devtools=1` / ключ в `localStorage`); devtools-чанки ремоутов при этом грузятся лениво (production-вариант `@tanstack/react-query-devtools/production`).
- Standalone: `createStandalonePlatform` поднимает тот же `DevtoolsToolbar` и реестр.
- Bridge-ремоуты: работает без изменений (регистрация через пропсы, своя версия devtools).
- Тот же приём (функция монтирования вместо объекта) MAY использоваться для будущих dev-панелей (роутер, флаги, логи).

---

## 12. Realtime и межприложенческая инвалидация

### 12.1. Решение

- **Источник правды о «данные изменились» — бэкенд.** Покрывает другие вкладки, другие устройства, изменения от фоновых процессов (Temporal), чего хаки с общим QueryClient не умеют.
- **У каждого приложения своё соединение к своему BFF** (требование бэкенда — изоляция bounded context). Хост MUST NOT получать события, относящиеся к внутренним данным ремоутов.
- Бэкенд приложения **переводит** доменные события из Kafka в события **о данных своего клиента**. Правило: приложение получает события только о данных, которые само показывает.

### 12.2. Сценарий букмарков (эталонный)

1. Ремоут A (tasks) добавляет букмарк через **tasks-bff** (`POST /bookmarks`, с `X-Correlation-Id`).
2. tasks-bff сохраняет и публикует в брокер (Kafka; в демо — `mock-backend/broker`) доменное событие `bookmark.added { userId, resource, correlationId, eventId }`.
3. tasks-bff сам шлёт в соединение ремоута A событие `tasks.bookmarks.changed` (если ремоут показывает свои букмарки).
4. **host-bff** подписан на `bookmark.*` в брокере, переводит в событие о своих данных `bookmarks.changed { userId, eventId, correlationId }` и шлёт **только сессиям этого пользователя** в соединение хоста.
5. Хост в виджете букмарков на главной: `useInvalidateOnEvent('bookmarks.changed', bookmarksQueryOptions().queryKey)` → инвалидация → рефетч (данные хоста приходят из host-bff, который агрегирует букмарки из BFF).
6. Ремоут A для своего UI обновляет свой кэш сразу (`setQueryData`), не дожидаясь события.

### 12.3. Формат событий

```ts
type RealtimeEnvelope = {
  topic: string;            // 'bookmarks.changed'
  eventId: string;          // уникальный, для дедупликации
  occurredAt: string;       // ISO
  scope?: { userId?: string; entityId?: string };
  correlationId?: string;   // из X-Correlation-Id мутации-источника
  version?: number;         // MAY: версия ресурса
};
```
- MUST: **тонкие** события — без данных и **без query keys** (бэкенд не знает ключей фронта). Каждое приложение само сопоставляет топик своим ключам.
- MUST (FSD 2.1): подписки живут в сегменте `api` страницы (или слайса), которая показывает данные — `useInvalidateOnEvent` вызывается там, где данные отображаются. Отдельный центральный файл «топик → ключ» не нужен.

### 12.4. Клиент `createRealtimeClient`

- Транспорт: по умолчанию **SSE на `fetch`** (нативный `EventSource` не умеет заголовки → нужен `Authorization` через fetch-стрим). MAY: WebSocket-транспорт за тем же интерфейсом. Токен MUST NOT в URL; для WS — первым сообщением/субпротоколом.
- Жизненный цикл: соединение открывается при монтировании `RealtimeProvider` (= монтировании `RemoteRoot`) или при первой подписке; закрывается при размонтировании с **grace-задержкой** (например 5–10 с), чтобы быстрые переходы туда-обратно не дёргали переподключение. Ref-count подписок.
- Переподключение: экспоненциальный backoff с jitter. **При подключении и переподключении** — инвалидировать все топики, на которые есть подписки (события, пришедшие пока соединения не было, потеряны; доставку никто не гарантирует).
- Токен: соединение живёт дольше access-токена → переподключение со свежим токеном до истечения (по `exp`) или по закрытию сервером. Сервер в демо закрывает поток при истечении токена.
- Дедупликация по `eventId` (LRU последних N).
- `useRealtimeStatus()` — `connecting | open | reconnecting | closed` (для отладки/индикатора в devtools-тулбаре).
- Страховка: `refetchOnWindowFocus` в дефолтах QueryClient.

### 12.5. Опциональный быстрый путь и дедупликация

- MAY: для мгновенной реакции на той же странице ремоут после успешной мутации эмитит в локальную шину `platform.events.emit('bookmarks.changed', { source: 'tasks', correlationId })`; хост инвалидирует сразу.
- MUST (если быстрый путь включён): хост запоминает обработанные `correlationId`, а серверное событие с тем же `correlationId` пропускает → нет двойного рефетча.
- По умолчанию в демо: быстрый путь **выключен** флагом; задержка «серверного» пути (обычно < 1 с) достаточна для букмарков.

### 12.6. Инфраструктурные риски (задокументировать, проверить)

- **Лимит соединений:** если все BFF за прокси на одном origin, SSE по HTTP/1.1 занимает слоты из лимита 6 соединений на origin и может блокировать обычные запросы. Нужен HTTP/2 через прокси или WebSocket. В демо: dev-прокси Vite + отдельные порты BFF; в `docs` — чек-лист для банковского прокси (WS upgrade, долгие соединения, буферизация SSE).
- Буферизующий прокси ломает SSE → заголовки `Cache-Control: no-cache`, `X-Accel-Buffering: no` (или аналог), heartbeat-комментарии каждые ~15 с.

---

## 13. Preload (не делаем сейчас, но архитектура готова)

- MUST сейчас: `query-client.ts` и фабрики `queryOptions` — **отдельные модули**, не внутри компонентов; QueryClient создаётся лениво через `getRemoteQueryClient(platform)`.
- MUST сейчас: expose `./preload` зарезервирован (заглушка `export const preload = async (_platform, _params) => {}` с `TODO`), имя — в константах exposes и проверяется `verify`.
- Будущее устройство:
  - `preload` сам загружает ремоут: `import('tasks/preload')` подтянет `remoteEntry` и маленький чанк; дальше `preload` вызывает `getRemoteQueryClient(platform).prefetchQuery(...)`.
  - `./preload` — маленький expose: только `query-client`, фабрики `queryOptions`, http-клиент; без UI/DS/роутов.
  - MUST: `query-client.ts` — **один экземпляр модуля** на оба expose (`./preload` и `./RemoteRoot`), иначе префетч наполнит один клиент, а UI прочитает из другого. Проверить на сборке Vite-плагина MF (общий чанк).
  - Триггеры: hover/focus ссылки; `loader` роута в data router (статический `loader` + `lazy` для компонента выполняются параллельно); прогрев `remoteEntry` в idle (MF runtime `preloadRemote` — проверить поддержку плагином).
  - Devtools: ремоут появится в селекте как «загружен» с момента префетча (регистрация при создании клиента).
- В демо MAY: включаемый флагом пример preload по hover, чтобы проверить, что архитектура действительно готова.

---

## 14. Transitions, мутации, навигация, ViewTransition

### 14.1. Suspense-запросы и смена ключей

- `useSuspenseQuery` не имеет `placeholderData`. Чтобы при смене ключа (фильтр, страница, выбранная сущность) не показывался фоллбэк, обновление ключа MUST идти в `startTransition` (или через `useDeferredValue`).
- Фоллбэк Suspense появляется только при первой загрузке региона.
- Пример в демо: фильтр списка задач в `startTransition`, индикация через `isPending` → `PendingRegion`.

### 14.2. Мутации — правило по умолчанию

- Источник pending для кнопки — `mutation.isPending`.
- Если нужно дождаться обновления данных на этой же странице — **вернуть промис** из `onSuccess`: `onSuccess: () => queryClient.invalidateQueries(...)` (мутация остаётся pending до конца рефетча).
- Transition вокруг мутации нужен **только** если после мутации идёт **саспендящее** обновление: смена ключа/выбор новой сущности/навигация на саспендящий экран, либо нужны `useOptimistic`/`useFormStatus`.
  - Ловушка: апдейты после `await` в async transition MUST быть снова обёрнуты в `startTransition`.
  - Ошибка, брошенная внутри transition (`mutateAsync` бросает), уходит в ближайший Error Boundary → ловить внутри action и показывать через `mutation.error`/состояние формы.

### 14.3. Мутация → редирект на список (реальный кейс проекта)

Сценарий: создание задачи → 200 → редирект на страницу списка, который в этот момент рефетчится.

- MUST: класть ответ в кэш списка до навигации, инвалидацию не ждать:
  ```ts
  const addTaskToList = (list: Task[] | undefined, task: Task): Task[] | undefined => {
    if (!list) {
      return list; // кэша нет → список честно саспендит с отложенным фоллбэком
    }
    return [task, ...list];
  };

  // onSuccess:
  queryClient.setQueryData(tasksListOptions(http, defaultFilters).queryKey, (prev) => addTaskToList(prev, task));
  void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() });
  navigate(tasksRoutes.list());
  ```
- Если у списка фильтры/сортировка/пагинация — вставлять только туда, где запись точно должна быть (первая страница при дефолтной сортировке), остальное — инвалидация.
- MUST: стадии кнопки привязаны к **общему** флагу: `const isBusy = mutation.isPending || navigation.state !== 'idle'` (`useNavigation()` data router). Иначе в холодном случае кнопка «гаснет» на 200, а страница ещё не сменилась → повторный клик.

### 14.4. ViewTransition (React 19.3)

- Анимацию запускают только апдейты в `startTransition`, раскрытие `<Suspense>` и обновления `useDeferredValue`. Обычный `setState` не анимируется.
- MUST: **хост владеет** view transitions уровня роутов (навигация хоста идёт в transition, `addTransitionType('nav-forward' | 'nav-back')`, классы через `enter`/`exit`). Ремоуты используют `<ViewTransition>` только для локальных изменений внутри себя.
- MUST NOT смешивать с собственным флагом `viewTransition` роутера и MUST NOT вызывать `document.startViewTransition` вручную — React сам назначает `view-transition-name` и вызывает API.
- Suspense-раскрытие: обернуть границу в `<ViewTransition>` → кросс-фейд фоллбэк → контент.
- Фоновые ревалидации: `default="none"`.
- **Данные из TanStack Query:** подписка через `useSyncExternalStore` → апдейты синхронные, не transition → сами не анимируются. Для анимации списка:
  ```tsx
  const TaskList = () => {
    const { data } = useSuspenseQuery(tasksListOptions(http, filters));
    const tasks = useDeferredValue(data);
    return (
      <ul>
        {tasks.map((task) => (
          <ViewTransition key={task.id}>
            <TaskRow task={task} />
          </ViewTransition>
        ))}
      </ul>
    );
  };
  ```
- Именованные (shared element) VT MUST иметь префикс ремоута (`name="tasks-task-42"`) — имена уникальны на весь документ.
- Смена `key` у `ViewTransition`, оборачивающего `<Suspense>`, перемонтирует границу и рефетчит — избегать.
- Длительности 150–250 мс (во время перехода старое состояние — статичный снимок, спиннер в уходящем фоллбэке «замирает»).
- MUST: под `prefers-reduced-motion` отключать анимации групп.
- Браузеры без View Transitions API — анимация пропускается, апдейт проходит.

### 14.5. Прочее из React 19.2+

- `<Activity>` SHOULD для табов/панелей задач: скрытое поддерево сохраняет состояние, suspense-запросы внутри hidden Activity прогреваются заранее.
- Performance Tracks в Chrome DevTools — для проверки, что смены ключей идут как transition, а не blocking. Упомянуть в docs.
- Без водопадов: `useSuspenseQueries` для параллельных запросов; по одной Suspense-границе на независимый регион.

---

## 15. API-контракты (симуляция shared-репо бэкенда)

### 15.1. Решение

- Бэкенд держит **shared-репо со всеми OpenAPI-спеками**. Генерация в нём производит Java-классы и TS-типы + zod-схемы. Фронтовая часть публикуется npm-пакетами в Nexus.
- Генерация типов/схем — **ответственность ремоута в смысле выбора**: ремоут тянет пакет своего BFF и сам контролирует версию; либо пишет типы руками.
- В монорепо: `api-contracts/` симулирует этот репо.

### 15.2. Требования к пакетам

- MUST: **по пакету на BFF** (`@portal-api/host-bff`, `@portal-api/tasks-bff`), независимое версионирование.
- MUST: в пакете **только типы + zod-схемы** (+ MAY метаданные операций: метод, путь, operationId). MUST NOT генерировать http-клиент/SDK, привязанный к транспорту.
- MUST: `zod` — **peerDependency** с диапазоном под мажор, под который сделана генерация.
- MUST: семвер выставляется машиной — `oasdiff` сравнивает новую спеку со старой (удаление поля / optional→required = major; добавление поля = minor).
- MUST: линт спек (Spectral или аналог) — правила на `required` и уникальные имена схем. Реальная спека сейчас: все поля optional, дублирующиеся имена схем → без линта zod-схемы пропускают всё, типы с `| undefined` везде. Демо-спеки сделать «правильными» и добавить правила, которые ловят эти проблемы.
- MUST: пререлизы для параллельной разработки фронта и бэка: PR со спекой публикует `x.y.z-next.N` под dist-tag `next`; после мержа — стабильная версия. В монорепо — скрипт, имитирующий это (MAY: changesets).
- Скрипты: `pnpm api:lint`, `pnpm api:diff`, `pnpm api:generate`.

### 15.3. Потребление в приложении

- MUST: пакет подключается **только в `shared/api`** приложения; остальной код импортирует схемы и типы оттуда. Тогда переход «пакет ↔ ручные типы» или мажорный апдейт затрагивает одну точку.
- MUST: если команда пишет типы руками — ответы всё равно валидируются zod-схемами в `shared/api` (граница доверия).
- CLI спрашивает: «подключить `@portal-api/<bff>` или писать типы вручную».

---

## 16. Ремоут: структура (FSD 2.1) и CLI

### 16.1. FSD 2.1

- Модель **pages first**: код живёт в странице, пока не начал переиспользоваться; `entities`/`features`/`widgets` выносятся только при переиспользовании. Слои `app`, `pages`, `shared` — всегда.
- Steiger (официальный линтер FSD) в CI; правило `insignificant-slice` предлагает влить слайс, используемый на одной странице, обратно в страницу.
- `@x`-нотация кросс-импортов — **только** на слое `entities`, минимально.
- Self-contained слайсы: фича владеет своим состоянием, мутациями и диалогами; виджеты/конфиги только композируют фичи, не импортируя их внутренности.
- MUST NOT: CLI не создаёт пустые `entities/`, `features/`, `widgets/`.

### 16.2. Структура ремоута

```
tasks-remote/
├─ src/
│  ├─ app/
│  │  ├─ exposes/
│  │  │  ├─ RemoteRoot.tsx       # провайдеры, devtools markMounted, сброс кэша
│  │  │  ├─ RemoteBridge.tsx     # createBridgeComponent({ rootComponent: RemoteRoot })
│  │  │  ├─ runtime.ts           # remoteCreateElement, contractVersion
│  │  │  └─ preload.ts           # заглушка (раздел 13)
│  │  ├─ standalone/
│  │  │  ├─ main.tsx             # createStandalonePlatform + свой router + DevtoolsToolbar
│  │  │  └─ config.json          # runtime-конфиг окружений (BFF url, auth mode, scopes)
│  │  ├─ providers/              # Platform, QueryClient, Realtime
│  │  └─ routes/                 # дерево роутов ремоута (одно для всех режимов)
│  ├─ pages/
│  │  ├─ task-list/              # ui/ api/ model/ index.ts
│  │  ├─ task-create/
│  │  └─ task-details/
│  └─ shared/
│     ├─ api/
│     │  ├─ contracts.ts         # реэкспорт из @portal-api/tasks-bff (единственная точка)
│     │  ├─ http-client.ts       # createHttpClient(auth, bffBaseUrl, scopes)
│     │  ├─ query-client.ts      # getRemoteQueryClient(platform) + регистрация devtools
│     │  ├─ query-keys.ts        # неймспейс 'tasks'
│     │  └─ realtime.ts          # getRemoteRealtimeClient(platform) — своё соединение к tasks-bff
│     ├─ config/                 # env, runtime-конфиг (одна сборка → любой стенд)
│     ├─ routes/                 # константы путей
│     ├─ lib/
│     └─ ui/                     # только то, чего нет в DS
├─ vite.config.ts                # MF: name, exposes, shared (контракт интеграции)
├─ tsconfig.json                 # внутреннее, можно менять
├─ .oxlintrc.json                # внутреннее (вкл. запрет useMemo/useCallback/memo)
├─ steiger.config.ts             # внутреннее
├─ vitest.config.ts              # внутреннее
├─ azure-pipelines.yml           # build → test → steiger → portal-cli verify → publish в Nexus
├─ mocks/auth.ts                 # mock-авторизация для локальной разработки
├─ docs/                         # правила работы с React и данными
└─ .claude/skills/               # скиллы команды для Claude Code
```

- Runtime-конфиг: **собрали один раз — разворачиваем на любой стенд**. Сборка из Nexus MUST NOT вшивать окружение. Standalone читает `config.json`; встроенный режим получает `env` из контракта и адрес своего BFF из своего runtime-конфига (или конвенции относительно `hostOrigin`).

### 16.3. `portal-cli`

Команды:
- `portal-cli create remote <name>` — генерирует ремоут по структуре 16.2. Вопросы:
  - подключить пакет API `@portal-api/<bff>` или писать типы вручную;
  - вписать внутренние конфиги в проект или наследовать из `@portal/presets` (по желанию);
  - включить bridge-entry (по умолчанию да).
- `portal-cli add page|widget|feature|entity <name>` — слайс с сегментами и `index.ts`.
- `portal-cli verify` — проверка **контракта интеграции** (раздел 17.1). Запускается в CI ремоута.
- MAY: `portal-cli doctor` — расширенные проверки конвенций; подсказка «вынести из страницы» при переиспользовании.

Принципы:
- Сгенерированный код — собственность команды, шаблон после генерации никто не синхронизирует.
- Внутренние конфиги (TS, линт, тесты, Vite кроме MF-секции, пайплайн) — меняются как угодно.
- **`verify` — единственный постоянный механизм согласованности**, вкладываться в него, а не в обновление шаблонов.

---

## 17. Совместимость и проверки

### 17.1. `portal-cli verify` (CI ремоута)

Читает собранный `mf-manifest.json` (и `package.json`) и проверяет:
- MUST: имя ремоута соответствует конвенции.
- MUST: exposes `./RemoteRoot`, `./RemoteBridge`, `./runtime`, `./preload` присутствуют.
- MUST: синглтоны объявлены как `singleton: true` с диапазонами, пересекающимися с поддерживаемыми хостом (список и диапазоны — в `@portal/mf-shared` или в конфиге verify).
- MUST: `@tanstack/react-query` **не** объявлен синглтоном.
- MUST: версия `@portal/platform-contract` в поддерживаемом диапазоне.
- SHOULD: сборка не содержит токенов/секретов, `config.json` не содержит окружение-специфичных значений сверх шаблона.
- Выход: человекочитаемый отчёт + ненулевой код при нарушениях.

### 17.2. Проверка в хосте при загрузке

- Идентичность React (`./runtime`) → интегрированный или bridge-режим.
- `contractVersion` → поддерживается или понятная ошибка в `AsyncBoundary`.
- Ошибка загрузки ремоута (сеть, 404 remoteEntry) → `AsyncBoundary` с retry, без падения хоста.

---

## 18. Хост-приложение

- `apps/host`: React 19.3, data router, `@portal/ds`, свой QueryClient (`createPortalQueryClient`), один PCA (или mock-auth по конфигу), `createRemoteAuth` на каждый ремоут со своим allowlist scopes.
- Сборка контракта: `buildPlatformForRemote(remoteName)` → `{ contractVersion, auth: createRemoteAuth(...), env, events, telemetry, locale, devtools: registry (dev/флаг), bridge? }`.
- Роуты: `/` — главная с **виджетом букмарков** (данные из host-bff, `useInvalidateOnEvent('bookmarks.changed', ...)`); `/tasks/*` — ремоут tasks через `<RemoteApp name="tasks" />` (lazy, `AsyncBoundary`, `Spinner`-фоллбэк); MAY `/legacy/*` — bridge-ремоут.
- Навигация хоста — в transition, `addTransitionType` для направления, `<ViewTransition>` на уровне layout.
- Realtime хоста — своё соединение к host-bff.
- `useClearCacheOnAccountChange` для QueryClient хоста.
- `DevtoolsToolbar` (dev или флаг); хост регистрирует свой клиент как `host`.
- Демо-панель (dev): переключить аккаунт / logout (mock-auth), включить быстрый путь событий, переключить искусственную задержку BFF (для проверки 300 мс / 2 с стадий), включить preload-демо.
- CSP-конфиг (meta или заголовки dev-сервера) с allowlist источников ремоутов.

---

## 19. Демо-сценарии = приёмочные критерии

Каждый сценарий MUST быть воспроизводим вручную (описание в `docs/demo.md`) и SHOULD покрыт тестом (unit/integration на Vitest; e2e Playwright — MAY).

1. **Стадии загрузки кнопки.** Создание задачи с задержкой BFF 100 мс → спиннера нет; 800 мс → спиннер на кнопке после 300 мс; 3 с → оверлей региона после 2 с. Кнопка `disabled` с первого мгновения.
2. **Отложенный Suspense-фоллбэк.** Первый заход на `/tasks` с задержкой 150 мс → спиннер не появляется; 1 с → спиннер появляется плавно. Фоллбэки хоста (загрузка ремоута) и ремоута (данные) выглядят одинаково.
3. **Смена фильтра без фоллбэка.** Фильтр списка → старый список остаётся, `PendingRegion` показывает pending по порогам.
4. **Создание → редирект.** Список в кэше: после 200 список сразу содержит новую задачу, без спиннера и без «впрыгивания». Кэша нет (прямой заход на форму): список саспендит с отложенным фоллбэком; кнопка остаётся busy, пока навигация не завершилась.
5. **Анимация списка.** Новая задача, пришедшая фоновым рефетчем, плавно появляется (`useDeferredValue` + `ViewTransition`), под `prefers-reduced-motion` — без анимации.
6. **Букмарки через бэкенд.** В ремоуте tasks добавить букмарк → виджет букмарков хоста обновляется через realtime host-bff (< 1–2 с). Хост не получает событий `tasks.*`. Во второй вкладке виджет тоже обновляется.
7. **Быстрый путь + дедупликация.** С включённым флагом: виджет хоста обновляется мгновенно, серверное событие с тем же `correlationId` не вызывает второго рефетча.
8. **Переподключение.** Остановить host-bff, добавить букмарк через tasks-bff, поднять host-bff → после переподключения виджет инвалидируется и показывает актуальные данные.
9. **Истечение токена.** Mock-токен с коротким TTL → realtime переподключается со свежим токеном без потери подписок.
10. **Смена аккаунта.** Logout/смена аккаунта в демо-панели → кэши хоста и ремоута очищены, данные перезагружены под новым аккаунтом.
11. **Scope allowlist.** Попытка ремоута запросить токен под чужой scope → ошибка с понятным сообщением в телеметрии.
12. **Devtools.** На главной — devtools хоста; на `/tasks` — автоматически devtools ремоута; вернуться на главную — ремоут в списке как «○ загружен»; pin ремоута отключает автопереключение и переживает перезагрузку; незагруженные ремоуты не показаны.
13. **Standalone.** `pnpm --filter tasks-remote dev:standalone` поднимает тот же `RemoteRoot` со своим PCA/mock-auth, своим роутером и тем же тулбаром devtools.
14. **Режимы интеграции.** Ремоут с тем же React → интегрированный режим (transitions хоста ждут данных ремоута). (Опц.) `legacy-remote` на другой версии React → bridge-режим автоматически; задокументированные ограничения видны (свой фоллбэк, нет общих transitions).
15. **Несовместимый контракт.** Ремоут с `contractVersion` вне диапазона → понятная ошибка в `AsyncBoundary`, хост работает.
16. **verify.** Удалить expose `./preload` или сделать `@tanstack/react-query` синглтоном → `portal-cli verify` падает с понятным отчётом.
17. **API-контракты.** Изменить спеку (удалить поле) → `pnpm api:diff` определяет major; линт спек ловит optional-везде и дубли имён.
18. **(Опц.) Preload-готовность.** С флагом: hover по ссылке на `/tasks` грузит `./preload`, данные в кэше до перехода, `useSuspenseQuery` не саспендит; ремоут виден в devtools как «загружен» до монтирования.

---

## 20. Фазы реализации

0. **Скелет.** pnpm workspaces, Volta, `.npmrc`, базовые пресеты, `docs/` (architecture, adr, open-questions).
1. **Контракт и рантайм.** `platform-contract` (типы), `platform-runtime`: provider, auth-адаптеры (mock + MSAL), `createRemoteAuth`, http-клиент, `createPortalQueryClient`, event bus, telemetry, compat. Unit-тесты.
2. **DS.** Joy-тема, `Spinner`, `PendingRegion`, `AsyncButton`, `AsyncBoundary`, `useLoadingStage`, токены задержек, reduced motion. Тесты (fake timers + проверка атрибутов/классов).
3. **API-контракты.** Спеки host-bff и tasks-bff, генерация types+zod, lint, diff, пакеты с peer zod.
4. **Mock-бэкенды.** broker, host-bff (букмарки-агрегат, SSE-канал хоста, перевод событий), tasks-bff (задачи, букмарки, SSE-канал ремоута), управляемая задержка, проверка токена, закрытие потока по exp.
5. **Ремоут tasks** (FSD 2.1): `RemoteRoot`, exposes, standalone, страницы list/create/details, сценарии 1–5.
6. **Хост**: роутинг, `<RemoteApp>` с dual entry, контракт, виджет букмарков, ViewTransition уровня роутов, демо-панель.
7. **Realtime**: `createRealtimeClient`, `useInvalidateOnEvent`, сценарии 6–9.
8. **Devtools**: реестр, тулбар, mount-функции, сценарий 12.
9. **CLI**: `create remote` (шаблон = tasks-remote), `add`, `verify`; сценарии 16. Проверить, что свежесгенерированный ремоут проходит `verify` и запускается.
10. **(Опц.) Bridge-демо** (`legacy-remote`), preload-демо (флаг).
11. **Документация**: `docs/demo.md`, ADR, чек-лист для банковского прокси, отличия reference от реального проекта.

---

## 21. Проверки после каждой фазы

- `pnpm -r typecheck`, `pnpm -r lint` (oxlint + Steiger для приложений), `pnpm -r test`, `pnpm -r build`.
- Нет `any`, нет `useMemo`/`useCallback`/`memo`, все `if` со скобками, только стрелочные функции.
- Приложения не импортируют друг друга напрямую (только пакеты).
- Для фаз 5+: ручной прогон соответствующих сценариев из раздела 19.
- `portal-cli verify` проходит для `tasks-remote`.

---

## 22. ADR, которые нужно записать в `docs/adr/`

1. Синглтоны MF: минимальный список и почему (идентичность контекстов).
2. Интегрированный режим по умолчанию, bridge — исключение уровня роута; dual entry + проверка идентичности React.
3. Контракт платформы передаётся пропсами; ремоут сам поднимает провайдеры.
4. Свой QueryClient у каждого приложения; фабрика в рантайм-пакете.
5. Auth: один PCA, интерактив только в хосте, allowlist scopes, токены не в URL; принятый security-риск + CSP.
6. Паттерн загрузки: CSS-задержки, стадии 300 мс / 2 с, троттлинг Suspense в React 19.
7. Transitions и мутации: когда `mutation.isPending`, когда transition; `setQueryData` перед редиректом; общий busy-флаг с навигацией.
8. ViewTransition: хост владеет роутами, `useDeferredValue` для данных TanStack, префиксы имён.
9. Devtools: mount-функции вместо передачи клиента.
10. Realtime: соединение на приложение, перевод событий на бэкенде, тонкие события, инвалидация при переподключении, транспорт и прокси.
11. Preload: модульная готовность без реализации.
12. API-контракты: пакет на BFF, types+zod без клиента, peer zod, oasdiff, Spectral, пререлизы.
13. FSD 2.1 pages first, Steiger, CLI без пустых слоёв.
14. CLI: шаблон — собственность команды; `verify` — единственный постоянный механизм согласованности.

---

## 23. Открытые вопросы (перенести в `docs/open-questions.md`)

- Политика версий React/DS: кто апгрейдится первым (хост), срок для ремоутов, что с отстающими (автоматически bridge или блок).
- Критерии допуска bridge и кто их утверждает.
- DS-синглтон vs свобода стека: переход темы на CSS-переменные?
- Версионирование контракта: только аддитивные изменения или явная поддержка нескольких `contractVersion` хостом.
- Транспорт realtime через банковский прокси: HTTP/2? WS upgrade? буферизация SSE?
- Где живёт realtime-шлюз каждого BFF (в самом BFF или отдельный сервис на кластер) — решение бэкенда.
- Где жить сгенерированному API-коду окончательно (пакет из репо спек — предпочтительно).
- Нужен ли `portal-cli doctor` / codemods при изменениях контракта.
- Поведение `singleton`/`strictVersion` в выбранном Vite-плагине MF и общий чанк для `query-client.ts` между exposes.
- Статус `@tanstack/react-devtools` (была alpha) — используем ли единую оболочку или только свой тулбар (текущее решение: свой тулбар, без зависимости от alpha).

---

## 24. Отличия reference-монорепо от реального проекта (зафиксировать в docs)

- Монорепо вместо polyrepo — только для удобства; границы пакетов и приложений соблюдены как в polyrepo.
- `strict: true` в TS (в реальном проекте выключен).
- Mock-auth по умолчанию вместо реального Entra ID.
- Mock-брокер вместо Kafka, Node mock-BFF вместо Java BFF.
- Пакеты API публикуются через `workspace:*`, а не из Nexus.
- Реальный проект: общий QueryClient хоста и хаки с ним для букмарков — **удаляются** при миграции на эту схему.
