# Развёртывание M13A (Stirling-PDF) в Docker

Практическое руководство: как поднять сервер, где лежат данные, как включить
вход и как обновляться без потери базы.

Всё ниже проверено по содержимому этого репозитория: имена образов взяты из
`README.md` и `docker/embedded/compose/`, переменные — из
`app/core/src/main/resources/settings.yml.template`, порты и тома — из
`docker/embedded/Dockerfile` и `scripts/init-without-ocr.sh`.

---

## 1. Что понадобится

- Docker Engine 24+ (или Podman с совместимым CLI) и Docker Compose v2.
- 2 ГБ ОЗУ для `ultra-lite`, 6 ГБ для `fat` — это лимиты из compose-файлов.
  У обычного образа лимит не задан — рассчитывайте на 4 ГБ.
- Свободный порт `8080` (внутри контейнера всегда `8080/tcp`).
- Файловая система с обычными правами — контейнер работает не от root.

Проверить установку:

```bash
docker --version
docker compose version
```

---

## 2. Быстрый старт

### Вариант A. Готовый образ (рекомендуется)

```bash
docker run -d \
  --name m13a \
  --restart unless-stopped \
  -p 8080:8080 \
  -v m13a-config:/configs \
  -v m13a-logs:/logs \
  -v m13a-tessdata:/usr/share/tessdata \
  docker.stirlingpdf.com/stirlingtools/stirling-pdf
```

Открыть: `http://<адрес-сервера>:8080`.

Варианты тега того же образа:

| Тег | Что внутри | Ограничение памяти |
|---|---|---|
| `latest` | LibreOffice, Tesseract, OCRmyPDF, Calibre | 4 ГБ |
| `fat` | то же плюс дополнительные конвертеры (`DISABLE_ADDITIONAL_FEATURES=false`) | 6 ГБ |
| `ultra-lite` | только Java + PDF-движок, без офисных конвертеров | 2 ГБ |

Для `ultra-lite` нужен ещё `-e ENDPOINTS_GROUPS_TO_REMOVE=CLI` — так задано в
`docker/compose/docker-compose.ultra-lite.yml` репозитория.

### Вариант B. Docker Compose (сборка из исходников)

Compose-файлы лежат в `docker/compose/`:

```bash
git clone <этот-репозиторий> && cd <репозиторий>
docker compose -f docker/compose/docker-compose.yml up -d --build
```

Полезные файлы:

| Файл | Назначение |
|---|---|
| `docker/compose/docker-compose.yml` | стандартный образ |
| `docker/compose/docker-compose.fat.yml` | полный набор функций |
| `docker/compose/docker-compose.ultra-lite.yml` | минимальный образ |
| `docker/compose/docker-compose-unified-backend.yml` | только backend API |
| `docker/compose/docker-compose-unified-frontend.yml` | frontend + внешний backend |
| `docker/compose/docker-compose-unified-both.yml` | frontend и backend вместе |

Логи и остановка:

```bash
docker compose -f docker/compose/docker-compose.yml logs -f
docker compose -f docker/compose/docker-compose.yml down
```

> **Важно.** Compose-файлы в `docker/compose/` монтируют данные в
> `stirling/latest/...` относительно самого файла. Для боевого сервера
> отредактируйте пути на абсолютные — иначе при обновлении репозитория
> `git clean` унесёт базу.

---

## 3. Куда монтировать тома

Внутри контейнера есть пять каталогов. Первые четыре создаёт
`scripts/init-without-ocr.sh` при старте, и они переживают перезапуск только
если смонтированы.

| Путь в контейнере | Что там | Нужен том |
|---|---|---|
| `/configs` | `settings.yml`, база H2 (`stirling-pdf-DB-*.mv.db`), heap dumps, кэш AOT | **Обязательно** — здесь вся база и настройки |
| `/logs` | журналы приложения | Да |
| `/usr/share/tessdata` | языковые пакеты OCR | Да, если ставите языки вручную |
| `/customFiles` | свои шаблоны, дисклеймеры, логотипы | По желанию |
| `/pipeline` | файлы автоматизаций | По желанию |
| `/storage` | файлы «умных папок» на сервере | По желанию, если используете серверные папки |

Пример с полным набором:

```bash
docker run -d \
  --name m13a \
  --restart unless-stopped \
  -p 8080:8080 \
  -e PUID=1000 -e PGID=1000 -e UMASK=022 \
  -v /srv/m13a/configs:/configs \
  -v /srv/m13a/logs:/logs \
  -v /srv/m13a/tessdata:/usr/share/tessdata \
  -v /srv/m13a/customFiles:/customFiles \
  -v /srv/m13a/pipeline:/pipeline \
  -v /srv/m13a/storage:/storage \
  docker.stirlingpdf.com/stirlingtools/stirling-pdf
```

`PUID`/`PGID` — владелец файлов на хосте. Если директории созданы от другого
пользователя, контейнер напишет об этом в лог и откажется писать в `/configs`.
Проверка прав:

```bash
sudo chown -R 1000:1000 /srv/m13a
```

База данных — встроенная H2 в файле внутри `/configs`. Отдельный сервер БД не
нужен. **Резервная копия = остановить контейнер и скопировать `/configs`**:

```bash
docker stop m13a
sudo tar czf m13a-backup-$(date +%F).tar.gz -C /srv m13a
docker start m13a
```

Копировать `.mv.db` на работающем контейнере нельзя — получите битую копию.

---

## 4. Настройка

Два способа, оба переопределяют друг друга в таком порядке: переменные
окружения → `/configs/settings.yml` → значения по умолчанию.

### 4.1. Через файл настроек

При первом старте `settings.yml` создаётся из шаблона
`app/core/src/main/resources/settings.yml.template`. Правьте
`/srv/m13a/configs/settings.yml` и перезапускайте контейнер.

Файл линейный: не комментируйте строки, а меняйте значение — `ConfigInitializer`
перегенерирует файл из шаблона и выкинет закомментированные ключи.

### 4.2. Через переменные окружения

Имя переменной = путь ключа в верхнем регистре через `_`:
`security.enableLogin` → `SECURITY_ENABLELOGIN`.

### 4.3. Основные переменные

| Переменная | По умолчанию | Зачем |
|---|---|---|
| `SECURITY_ENABLELOGIN` | `true` | Включить учётные записи и админку |
| `SECURITY_ALLOWANONYMOUSACCESS` | `false` | Пускать гостей к PDF-инструментам без входа (см. п. 5) |
| `SECURITY_INITIALLOGIN_USERNAME` | `admin` | Логин первого администратора |
| `SECURITY_INITIALLOGIN_PASSWORD` | `stirling` | Пароль первого администратора |
| `SECURITY_LOGINMETHOD` | `all` | `all`, `normal`, `oauth2`, `saml2` |
| `UI_APPNAMENAVBAR` | `M13A` | Имя в заголовке вкладки и в 2FA-приложении |
| `UI_LANGUAGES` | пусто = все | Белый список языков, напр. `["ru_RU","en_US"]` |
| `SYSTEM_DEFAULTLOCALE` | авто | Принудительный язык, напр. `ru-RU` |
| `SYSTEM_BACKENDURL` | — | Публичный адрес для SSO-колбэков |
| `SYSTEM_FRONTENDURL` | = backendUrl | Адрес для ссылок в письмах и QR |
| `SYSTEM_MAXFILESIZE` | — | Лимит файла в мегабайтах, 1–999 |
| `SYSTEMFILEUPLOADLIMIT` | — | То же, но строкой: `100MB`, `1GB` |
| `SYSTEM_GOOGLEVISIBILITY` | `false` | `false` = `robots.txt` запрещает индексацию |
| `METRICS_ENABLED` | `true` | Служебные `/api/v1/info/*` |
| `SYSTEM_ROOTURIPATH` | `/` | Публикация под подпутём, напр. `/pdf` |
| `PUID` / `PGID` / `UMASK` | `1000` / `1000` / `022` | Владелец файлов на хосте |
| `JAVA_CUSTOM_OPTS` | пусто | Дополнительные флаги JVM (память и т.п.) |
| `JAVA_BASE_OPTS` | из образа | Полная замена набора флагов JVM |
| `PROCESS_EXECUTOR_AUTO_UNO_SERVER` | — | `true` поднимает отдельный сервер LibreOffice |

Пример с ограничением памяти и русским языком по умолчанию:

```bash
-e JAVA_CUSTOM_OPTS="-Xmx2g" \
-e SYSTEM_DEFAULTLOCALE=ru-RU \
-e SYSTEM_MAXFILESIZE=200 \
-e SYSTEM_GOOGLEVISIBILITY=false
```

### 4.4. Языки OCR

Базовый образ уже содержит `eng`, `deu`, `fra`, `por`, `chi-sim` и `osd`
(см. `docker/base/Dockerfile`). Русского там нет. Чтобы добавить язык,
положите файл обученной модели в `tessdata`:

```bash
# на хосте, рядом со смонтированным томом
sudo curl -L -o /srv/m13a/tessdata/rus.traineddata \
  https://github.com/tesseract-ocr/tessdata_fast/raw/main/rus.traineddata
docker restart m13a
```

При старте `scripts/init.sh` копирует файлы из `/usr/share/tessdata` в
системный каталог Tesseract. Проверить, что язык виден:

```bash
docker exec m13a tesseract --list-langs
```

### 4.5. Первый вход

При `SECURITY_ENABLELOGIN=true` и пустой базе создаётся администратор:

- логин/пароль из `SECURITY_INITIALLOGIN_*`, если заданы;
- иначе `admin` / `stirling`.

**Смените пароль сразу после первого входа**, иначе `admin/stirling` останется
рабочей парой на вашем сервере. Задавать начальные данные лучше через
переменные окружения, а не через `settings.yml`: файл лежит на диске рядом с
базой.

---

## 5. Гостевой режим

По умолчанию выключен. Включается так:

```bash
-e SECURITY_ENABLELOGIN=true \
-e SECURITY_ALLOWANONYMOUSACCESS=true
```

Что получает гость без учётной записи:

| Доступно | Закрыто до входа |
|---|---|
| Все PDF-инструменты, конвертеры, OCR, подпись сертификатом | Настройки сервера и админка |
| Локальные файлы в браузере | Сохранённые файлы, «умные папки» |
| Одноразовые ссылки на общий файл по токену | Команды, приглашения, API-ключи |
| | Уведомления, аудит, политики, автоматизации |
| | Привязка аккаунта, биллинг |

В интерфейсе вместо карточки аккаунта гость видит предложение войти — в
«Настройках», в нижней строке сайдбара и на рейле быстрой навигации. Клик
ведёт на `/login`.

Практические следствия, которые стоит понимать до включения:

- Гость не получает 401-редирект на `/login` при обращении к закрытому
  эндпоинту — запрос просто отклоняется, интерфейс остаётся рабочим.
- Языковые пакеты OCR, лимит размера файла и очередь конвертации общие: гость
  расходует те же ресурсы, что и пользователь.
- Колокольчик уведомлений у гостя не показывается: список привязан к читателю,
  которого у гостя нет.
- Настройка игнорируется, если `SECURITY_ENABLELOGIN=false` — тогда анонимны
  все и так.

Если гостевой доступ не нужен, оставьте значение по умолчанию: сервер
потребует вход на любой странице.

---

## 6. Публикация наружу

Контейнер слушает plain HTTP на `8080`. Для доступа из интернета поставьте
перед ним reverse-proxy с TLS.

**nginx** (фрагмент):

```nginx
server {
    listen 443 ssl;
    server_name pdf.example.com;

    ssl_certificate     /etc/letsencrypt/live/pdf.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pdf.example.com/privkey.pem;

    client_max_body_size 0;          # ограничение задаётся в приложении
    proxy_read_timeout   600s;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

`client_max_body_size 0` важен: лимит задаёт `SYSTEM_MAXFILESIZE`, а прокси с
дефолтным 1 МБ обрежет загрузку раньше.

Если публикуете под подпутём (`https://example.com/pdf`), задайте
`SYSTEM_ROOTURIPATH=/pdf` — приложение само сдвинет маршруты и куки.

Для OAuth2/SAML задайте `SYSTEM_BACKENDURL` и `SYSTEM_FRONTENDURL`: без них
редиректы после входа уйдут на неверный адрес. `SYSTEM_FRONTENDURL` нужен ещё и
для ссылок в письмах, QR-кодов мобильного сканера и подписи с телефона.

---

## 7. Обновление

```bash
docker pull docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest
docker stop m13a && docker rm m13a
# повторить docker run с теми же томами
```

Перед обновлением сделайте копию `/configs` (п. 3). Миграции схемы H2
применяются автоматически при старте и назад не откатываются — откат
образа без отката тома может оставить базу в несовместимом состоянии.

Проверить, что сервер поднялся:

```bash
curl -fs http://localhost:8080/api/v1/info/status
```

Ответ должен содержать `UP`. Ровно эту проверку делает `healthcheck` в
compose-файлах, с интервалом 5 с и 16 попытками.

---

## 8. Диагностика

| Симптом | Причина и что делать |
|---|---|
| Контейнер перезапускается по кругу | Мало памяти (`ExitOnOutOfMemoryError`). Поднимите лимит или задайте `JAVA_CUSTOM_OPTS="-Xmx1g"` |
| В логе «Could not grant … write access» | Не совпали `PUID`/`PGID` с владельцем каталогов на хосте. `chown -R` или задайте свои значения |
| 502 от прокси | Контейнер ещё стартует: первый запуск дольше из-за распаковки OCR-данных. Смотрите `docker logs -f m13a` |
| Вход не работает, сразу пускает в приложение | `SECURITY_ENABLELOGIN=false` |
| После входа редирект на неверный адрес | Не заданы `SYSTEM_BACKENDURL` / `SYSTEM_FRONTENDURL` |
| Загрузка обрывается на 1 МБ | `client_max_body_size` в прокси |
| Гость видит админку | Проверьте, что `SECURITY_ENABLELOGIN` и `SECURITY_ALLOWANONYMOUSACCESS` — разные переменные, и логин включён |

Полезные команды:

```bash
docker logs -f m13a                       # журнал приложения
docker exec -it m13a sh                   # внутрь контейнера
docker inspect --format '{{.State.Health.Status}}' m13a
```

Внутри контейнера настройки лежат в `/configs/settings.yml`, журналы — в
`/logs`, база — `/configs/stirling-pdf-DB-*.mv.db`.

---

## 9. Ограничения этой сборки

- Сборка **proprietary**: доступны вход, команды, аудит, SSO. SaaS-профиль и
  облачные функции не входят.
- Только Docker. Развёртывание из исходников без Docker, Kubernetes и
  десктопные сборки в этот документ не входят.
- Проверка в репозитории покрывает backend и frontend тестами, но **не**
  поднимает контейнер: JDK и Docker в среде разработки нет. Прогон
  `docker run` на вашем хосте — единственное настоящее подтверждение.

---

## 10. Ссылки

- Документация upstream: <https://docs.stirlingpdf.com>
- API: <https://registry.scalar.com/@stirlingpdf/apis/stirling-pdf-processing-api/>
- Compose-файлы репозитория: `docker/compose/`, `docker/embedded/compose/`
- Эталон настроек: `app/core/src/main/resources/settings.yml.template`
