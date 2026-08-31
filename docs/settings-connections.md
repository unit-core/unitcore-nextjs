# ТЗ: права на запись, выданные пользователем, и страница `/settings/connections`

Статус: к реализации. Дата: 2026-08-31.
Связанный документ: `plan-mcp-server.md` в проекте Claude «unitcore-supabase».

---

## 1. Зачем

Сейчас право MCP-клиента писать в базу решает глобальная таблица
`public.oauth_clients_allowed`: одна строка на клиента, ключ — пара
`client_name` + `redirect_uri`, заполняет её владелец сервера руками. Отсюда две
проблемы.

**Подключить можно только Claude.** DCR открыт, любой клиент (Cursor, VS Code,
ChatGPT, MCP Inspector) зарегистрируется сам и получит чтение, но первая же
запись упрётся в restrictive-политику, пока строку для него не добавят вручную
через SQL.

**Права выбирает не тот, кто владеет данными.** У Supabase OAuth нет
кастомных скоупов — токен всегда даёт полный доступ к данным пользователя.
Пользователь на экране согласия не может сказать «только чтение», а владелец
сервера решает это за всех сразу.

Меняем модель: право писать выдаёт **пользователь конкретному клиенту**, в момент
согласия, и меняет позже на странице подключённых приложений. Глобальный
аллоулист уходит.

Побочный эффект, ради которого всё и затевается: новый клиент больше не требует
ручного вмешательства — подключился, на экране согласия выбрал права, работает.

---

## 2. Что уже есть (не переписывать)

| Файл | Роль |
|---|---|
| `app/api/mcp/route.ts` | MCP endpoint, `withMcpAuth`, клиент строится из токена вызывающего |
| `app/.well-known/oauth-protected-resource/route.ts` | RFC 9728 discovery |
| `lib/supabase/mcp.ts` | `verifySupabaseToken` (JWKS, требует claim `client_id`), `createUserClient` |
| `lib/mcp/tools.ts` | инструменты, `READ_TOOLS` / `WRITE_TOOLS`, хелперы `ok` / `fail` |
| `hooks/use-oauth-consent.ts` | загрузка authorization details, approve/deny |
| `components/oauth-consent.tsx` | карточка согласия |
| `app/[lang]/oauth/consent/page.tsx` | страница согласия |
| `lib/connectors.ts` | `MCP_URL`, `CONNECTOR_NAME`, `claudeInstallUrl` |
| `supabase/checks/security-invariants.sql` | инварианты БД, гоняется `npm run db:check` |

В базе (проект `qdyutoiziymqinzjyiew`):

- `private.mcp_client_id()` — читает claim `client_id` из JWT, `null` для веб-сессии.
- `private.mcp_can_write()` — сверяет клиента с `public.oauth_clients_allowed`.
- restrictive-политики на `budget.transactions`, `budget.transaction_items`,
  `budget.categories` (INSERT/UPDATE/DELETE), `public.spaces` (INSERT/UPDATE),
  `public.space_members` (INSERT), `public.profiles` (UPDATE) — все через
  `private.mcp_can_write()`.
- жёсткий запрет DELETE из-под любого OAuth-клиента на `spaces`, `space_members`,
  `profiles` — через `private.mcp_client_id() is null`. **Остаётся как есть.**

Миграции применяются через Supabase MCP `apply_migration`; каталога
`supabase/migrations/` в репозитории нет.

---

## 3. Модель данных

### 3.1 Новая таблица

Ключ — `(user_id, client_id)`, где `client_id` — UUID из `auth.oauth_clients`,
тот самый, что лежит в claim токена. Это принципиальное отличие от старой схемы:
раньше ключом была пара «имя + redirect_uri», потому что при глобальном
аллоулисте каждая перерегистрация клиента по DCR (а Claude перерегистрируется
при каждом переподключении — в базе уже восемь его строк) ломала бы запись и
требовала правки руками. Здесь строку создаёт сам пользователь в момент
согласия, а новая регистрация клиента всегда проходит через экран согласия
заново — значит новый `client_id` получает свою строку автоматически. Матч по
точному идентификатору из подписанного токена снимает и вопрос о самоназвании
клиента: `client_name` и `redirect_uri` клиент объявляет о себе сам, `client_id`
выдаёт auth-сервер.

```sql
create table public.oauth_grants (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  client_id    uuid not null,
  client_name  text not null,
  redirect_uri text not null,
  can_write    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, client_id)
);

comment on table public.oauth_grants is
  'Права, выданные пользователем конкретному OAuth-клиенту. client_name и '
  'redirect_uri денормализованы для отображения и аудита: решение принимает '
  'только client_id.';
```

`client_name` и `redirect_uri` — снимок на момент согласия, показываются в UI и
в аудите. В `mcp_can_write()` они не участвуют.

Внешнего ключа на `auth.oauth_clients` нет намеренно: `auth` — чужая схема, её
структуру Supabase меняет без нашего участия.

### 3.2 RLS

Пользователь распоряжается только своими строками:

```sql
alter table public.oauth_grants enable row level security;

create policy "oauth_grants_select_own" on public.oauth_grants
  for select to authenticated using (user_id = (select auth.uid()));

create policy "oauth_grants_insert_own" on public.oauth_grants
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "oauth_grants_update_own" on public.oauth_grants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "oauth_grants_delete_own" on public.oauth_grants
  for delete to authenticated using (user_id = (select auth.uid()));
```

**И главное — restrictive-политика, без которой вся конструкция бессмысленна:**

```sql
-- OAuth-токен даёт полный доступ к данным пользователя, включая эту таблицу.
-- Без этой политики любой подключённый клиент открывает /rest/v1/oauth_grants
-- и ставит себе can_write = true, минуя и экран согласия, и эту страницу.
-- Права меняются только из браузерной сессии.
create policy "oauth_grants_web_session_only" on public.oauth_grants
  as restrictive for all to authenticated
  using (private.mcp_client_id() is null)
  with check (private.mcp_client_id() is null);

grant select, insert, update, delete on public.oauth_grants to authenticated;
```

`private.mcp_can_write()` — `security definer`, поэтому RLS этой таблицы её не
касается: функция читает строку и под OAuth-токеном.

### 3.3 Новая `mcp_can_write()`

```sql
create or replace function private.mcp_can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when private.mcp_client_id() is null then true   -- веб-сессия
    else exists (
      select 1 from public.oauth_grants g
      where g.user_id = (select auth.uid())
        and g.client_id = private.mcp_client_id()
        and g.can_write
    )
  end;
$$;
```

Сигнатура не меняется — все существующие restrictive-политики продолжают
работать без правок. Возвращает скаляр, так что
`supabase/checks/security-invariants.sql` остаётся зелёным.

### 3.4 Бэкфилл и удаление старого аллоулиста

Одной миграцией, в этом порядке: создать таблицу и политики, перенести уже
выданные согласия, подменить функцию, удалить `oauth_clients_allowed`.

```sql
-- Уже подключённый Claude не должен сломаться в момент деплоя: всё, что старый
-- аллоулист разрешал писать, получает can_write = true.
insert into public.oauth_grants (user_id, client_id, client_name, redirect_uri, can_write)
select c.user_id,
       c.client_id,
       cl.client_name,
       btrim(split_part(cl.redirect_uris, ',', 1)),
       true
from auth.oauth_consents c
join auth.oauth_clients cl on cl.id = c.client_id
where c.revoked_at is null
  and cl.deleted_at is null
  and exists (
    select 1 from public.oauth_clients_allowed a
    where a.client_name = cl.client_name
      and a.redirect_uri = any (
        select btrim(u) from unnest(string_to_array(cl.redirect_uris, ',')) u
      )
      and a.can_write
  )
on conflict (user_id, client_id) do nothing;

drop table public.oauth_clients_allowed;
```

Имя миграции: `per_user_oauth_write_grants`.

---

## 4. Экран согласия: выбор прав

Меняются `hooks/use-oauth-consent.ts`, `components/oauth-consent.tsx`.

**UI.** В карточке согласия, под блоком `dl` с клиентом и redirect URI, —
радиогруппа из двух вариантов:

- «Чтение и запись» — предвыбрано;
- «Только чтение».

Формулировки короткие, с подписью, что именно даёт каждый вариант (см. § 6).

Предвыбранный вариант — запись: продукт про то, чтобы вести бюджет из
AI-клиента, и подключение, которое молча не умеет добавлять траты, читается как
поломка. Выбор при этом видимый, и переключить его — один клик здесь и в любой
момент позже на `/settings/connections`.

**Порядок операций при «Разрешить»:**

1. `upsert` в `public.oauth_grants` — `user_id` = текущий пользователь,
   `client_id` = `details.client.id`, `client_name` = `details.client.name`,
   `redirect_uri` = `details.redirect_uri`, `can_write` = выбор пользователя,
   `onConflict: 'user_id,client_id'`.
2. Только если upsert прошёл — `approveAuthorization`.
3. Ошибка upsert показывается в существующем месте под `role="alert"`,
   `approveAuthorization` не вызывается.

Именно в таком порядке: строка, созданная раньше токена, гарантирует, что первый
же вызов инструмента увидит верные права. Обратный порядок оставляет окно, в
котором клиент уже с токеном, а прав ещё нет.

При «Отказать» строка не создаётся.

Осиротевшая строка (upsert прошёл, approve сорвался) прав никому не даёт —
токена не существует — и убирается сверкой на странице подключений (§ 5.4).

**Ветка «согласие уже давали».** Хук уже обрабатывает ответ без
`authorization_id` немедленным редиректом. Логику не трогаем: этот путь бывает
только для того же `client_id`, для которого строка уже есть.

---

## 5. Страница `/settings/connections`

### 5.1 Файлы

| Файл | Что |
|---|---|
| `app/[lang]/settings/connections/page.tsx` | серверная обёртка: `lang()`, `isLocale` guard, `getDictionary()`, `<main>` |
| `components/oauth-connections.tsx` | клиентский компонент: список, переключатели, отзыв |
| `hooks/use-oauth-grants.ts` | загрузка, сверка, мутации |
| `components/ui/switch.tsx` | `npx shadcn@latest add switch` (style `base-nova`) |

Раскладка повторяет уже существующую тройку consent: страница — компонент —
хук, состояние и вызовы Supabase живут в хуке.

Маршрут защищён автоматически: `/settings` не входит в `PUBLIC_PREFIXES` в
`lib/supabase/middleware.ts`, неавторизованный посетитель уезжает на
`/{locale}/auth/login`. Ничего добавлять в middleware **не нужно** — и в
`PUBLIC_PREFIXES` этот путь попасть не должен.

Ссылка на страницу добавляется в `components/site-header.tsx` — только для
авторизованного посетителя.

### 5.2 Источники данных

Два, и у каждого своя роль:

| Источник | Что даёт | Чем является |
|---|---|---|
| `supabase.auth.oauth.listGrants()` | `client: { id, name, uri, logo_uri }`, `scopes`, `granted_at` | источник истины: что подключено на самом деле |
| `public.oauth_grants` (select через RLS) | `can_write`, `redirect_uri`, `created_at` | наше решение о правах |

Соединяются по `client.id` = `oauth_grants.client_id`.

Важное ограничение API: `listGrants()` **не отдаёт `redirect_uri`** — только
`id`, `name`, `uri`, `logo_uri`. Поэтому redirect URI показывается из нашей
строки, а если её нет (грант старше этой фичи) — не показывается вовсе.
Читать `auth.oauth_clients` из приложения не нужно и нельзя: схема `auth` не
выставлена в PostgREST, а `security definer`-функция, возвращающая строки,
запрещена инвариантами (`supabase/checks/security-invariants.sql`). Сервисный
ключ этой странице тоже не нужен — всё делается под сессией пользователя.

### 5.3 Что показываем

Одна карточка на грант из `listGrants()`, отсортированные по `granted_at`
по убыванию:

- имя клиента (`client.name`), крупно; если `logo_uri` есть — иконка, иначе
  инициал, как в `oauth-consent.tsx` (`getInitial`);
- `redirect_uri` из нашей строки, моноширинным, с переносом (`break-all`) —
  это то, по чему пользователь отличает настоящий клиент от подделки;
- дата подключения (`granted_at`), в локали страницы;
- переключатель «Запись» (`Switch`) — состояние из `oauth_grants.can_write`;
- кнопка «Отозвать доступ» (`variant="outline"`, деструктивный акцент).

Дубликаты по имени не схлопываем: восемь строк «Claude» — это восемь разных
регистраций, у каждой свой `client_id`, свои права и свой отзыв. Схлопывание
скрыло бы от пользователя, что именно он отзывает. Вместо этого — дата
подключения на каждой карточке.

Состояния:

- загрузка — `role="status"`, текст-заглушка;
- ошибка — `role="alert"`, текст ошибки Supabase;
- пусто — «Ни одно приложение не подключено» + ссылка на `/blog` с инструкцией
  подключения (та же, что в `lib/connectors.ts`);
- нет строки в `oauth_grants` при живом гранте — переключатель в положении
  «выключено» с подписью «права не выданы»; включение создаёт строку
  (`upsert` с `client_id` и `client_name` из гранта, `redirect_uri` — пустая
  строка, если неизвестен).

### 5.4 Операции

**Переключить запись.** `upsert` в `public.oauth_grants` по
`(user_id, client_id)`, обновляет `can_write` и `updated_at`. Оптимистичное
обновление UI с откатом при ошибке. Работает мгновенно: политики читают таблицу
на каждый запрос, кэша нет.

**Отозвать доступ.** Диалога подтверждения не делаем — операция обратима
переподключением, а модалка здесь только добавляет клик. Порядок:

1. `supabase.auth.oauth.revokeGrant({ clientId })`;
2. затем `delete` своей строки `public.oauth_grants`;
3. перезагрузить список.

Если шаг 2 упал — не страшно: грант уже мёртв, осиротевшая строка снимется
сверкой. Обратный порядок хуже: удалённая строка при живом гранте — это клиент
с токеном и без прав, то есть неверный экран у пользователя.

Обязательно показать текстом рядом с кнопкой: refresh-токен умирает сразу,
а уже выданный access-токен живёт до истечения — до часа. Это поведение
Supabase, точки отзыва токенов у него нет.

**Сверка.** При загрузке страницы удалить свои строки, чей `client_id` не
встречается в `listGrants()`: это осиротевшие записи от сорвавшегося согласия
или от отзыва, где не прошёл шаг 2. Удаление тихое, без уведомления —
пользователю нечего с этим делать. Только вперёд: грант без нашей строки не
трогаем, он показывается как «права не выданы».

---

## 6. i18n

Новые ключи в `dictionaries/en.json` и `dictionaries/ru.json`. Тип `Dictionary`
выводится из английского словаря, так что пропущенный ключ ломает сборку.

```
settings.connections.title            "Connected applications" / "Подключённые приложения"
settings.connections.subtitle         что это за страница, одной строкой
settings.connections.empty            пустое состояние
settings.connections.emptyCta         ссылка на инструкцию подключения
settings.connections.connectedOn      "Connected" / "Подключено"
settings.connections.redirectsTo      "Redirects to" / "Redirect URI"
settings.connections.write            "Write access" / "Запись"
settings.connections.writeHint        что даёт запись
settings.connections.readOnly         "Read only" / "Только чтение"
settings.connections.noGrant          "Permissions not set" / "Права не выданы"
settings.connections.revoke           "Revoke access" / "Отозвать доступ"
settings.connections.revoking         "Revoking..." / "Отзываем..."
settings.connections.revokeHint       про час жизни access-токена
settings.connections.loading          состояние загрузки
settings.connections.error            заголовок ошибки
consent.access.title                  "What this client may do" / "Что сможет клиент"
consent.access.readWrite              "Read and write" / "Чтение и запись"
consent.access.readWriteHint          добавлять и править траты, категории, пространства
consent.access.readOnly               "Read only" / "Только чтение"
consent.access.readOnlyHint           только смотреть, ничего не менять
nav.settings                          пункт меню в шапке
```

Отдельно: строки в `components/oauth-consent.tsx` сейчас захардкожены
по-английски, мимо словаря. В этом ТЗ через словарь идут **только новые**
строки; перевод остального экрана согласия — отдельная задача, чтобы не
раздувать диф.

---

## 7. Ошибки инструментов MCP

Сейчас клиент, которому не выдали запись, получает голый текст PostgREST вида
`new row violates row-level security policy for table "transactions"`. Модель на
том конце начинает гадать и ретраить.

В `lib/mcp/tools.ts`: обернуть возврат ошибок записи так, чтобы код `42501`
(и текст, содержащий `row-level security`) превращался в

> This client has read-only access to your Unitcore data. Turn on write access
> for it at https://unitcore.io/settings/connections and try again.

Реализация — общий хелпер рядом с `ok` / `fail`, например `failWrite(error)`,
применяется во всех инструментах из `WRITE_TOOLS`. Остальные ошибки идут как
есть.

В `lib/connectors.ts` добавить экспорт:

```ts
export const CONNECTIONS_URL = `${SITE_URL}/settings/connections`
```

Без локали: `proxy.ts` сам добавит префикс языка читателя.

---

## 8. Проверки

**SQL-инварианты.** Новый файл `supabase/checks/oauth-write-gate.sql`, в стиле
существующего `security-invariants.sql` (do-блок, `raise exception`), проверяет:

1. на `public.oauth_grants` включён RLS и существует restrictive-политика
   `for all`, содержащая `mcp_client_id() IS NULL` и в `using`, и в `with check`
   — это защита от того, что клиент сам себе выдаст запись;
2. `private.mcp_can_write()` существует, возвращает `boolean`, помечена
   `security definer` и `stable`;
3. таблицы `public.oauth_clients_allowed` больше нет;
4. набор restrictive-политик, ссылающихся на `mcp_can_write()`, покрывает те же
   таблицы и команды, что и до миграции (список — в § 2).

Добавить вызов в `npm run db:check` рядом с существующим файлом.

**Юнит/интеграция.** `tests/mcp-isolation.test.mts` не трогаем: он гоняет только
`READ_TOOLS` и не должен оставлять строк. Права на запись автоматизировать
дорого — нужен реальный OAuth-флоу с браузером, — поэтому ручная матрица:

| Сценарий | Ожидание |
|---|---|
| Подключить Cursor, на согласии выбрать «только чтение» | `list_transactions` работает, `create_transaction` возвращает человеческий текст со ссылкой на настройки |
| Включить «Запись» на `/settings/connections`, повторить | транзакция создаётся, без переподключения |
| Выключить обратно | следующая запись снова отклонена |
| Отозвать доступ | клиент получает 401, грант исчез из списка, строка из `oauth_grants` удалена |
| Переподключить Claude заново (новый `client_id` по DCR) | экран согласия показан снова, новая строка создана, старая осталась отдельной карточкой |
| Дёрнуть `PATCH /rest/v1/oauth_grants` с OAuth-токеном напрямую | отказ RLS |
| Открыть `/settings/connections` без сессии | редирект на логин |

Последние два — обязательные, это и есть проверка модели угроз.

**Регресс.** `npm run lint`, `npm run build`, `npm test`, `npm run db:check`.

---

## 9. Критерии приёмки

1. Новый клиент (не Claude) подключается без единой ручной операции в базе и
   после выбора «чтение и запись» на экране согласия сразу пишет.
2. Пользователь видит все свои подключения, для каждого может включить и
   выключить запись и отозвать доступ.
3. Ни один OAuth-клиент не может изменить свои права: прямой запрос к
   `oauth_grants` с его токеном отклоняется.
4. Удаление пространств, участников и профилей из-под OAuth-клиента по-прежнему
   невозможно вне зависимости от выданных прав.
5. Уже подключённый Claude после деплоя продолжает писать без действий
   пользователя.
6. `npm run db:check` и `npm run build` зелёные.

---

## 10. Вне скоупа

- Перевод существующих строк экрана согласия на словарь.
- Аудит вызовов (`public.mcp_tool_calls` из плана) — не реализован и в эту
  задачу не входит.
- Гранулярность прав тоньше, чем «чтение / запись» (например, отдельно траты и
  отдельно пространства).
- Страница `/docs/mcp`: инструкция подключения сейчас живёт в блоге, отдельной
  страницы не заводим.
