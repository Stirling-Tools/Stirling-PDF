# Stirling-PDF: Spring Boot → Quarkus Migration — Continuation Handoff

> **Purpose:** everything needed to resume this migration in a fresh session. Read this top-to-bottom
> before touching anything. Companion doc `migration-report.md` has the higher-level summary; this
> file is the working/continuation guide with the concrete state, commands, fixed bugs, remaining
> bugs, and the recurring patterns you need to apply.

---

## 0. TL;DR status

- **Branch:** `migration/run-01` (all work committed locally, **nothing pushed** — `origin` is the
  public `Stirling-Tools/Stirling-PDF` repo; do not push without the owner's say-so).
- **Default flavor (`proprietary`):** compiles, Quarkus-augments, boots, and serves real traffic in
  Docker. ✅
- **Cucumber API e2e (full-tool Docker image):** baselines, newest first:
  - **Run 2 (login off, this session's fixes, no JWT mechanism): 223 / 258 pass**, 35 failed, 80
    skipped. Up from the prior **183 / 258** baseline (+40). Eliminated buckets: split
    `PDF corrupted` 8→0, `FileAlreadyExists` 8→0, `Admin login failed (500)` 17→0.
  - **Run 3 (login off + `V2=true` + the new JWT Bearer mechanism): the 80 JWT/admin scenarios now
    RUN (0 skipped)** because the `login → /me` probe passes. See §6.E / "Session 2". Final tally
    recorded in §9.
- **Stack:** Quarkus 3.33.2 LTS, **Java 25** (mandatory — see §2), Hibernate ORM Panache,
  quarkus-rest (RESTEasy Reactive), quarkus-oidc, quarkus-undertow (servlet, for filters), OpenSAML 5.
- **`saas` flavor:** compiles but full augmentation has ~28 CDI issues (design-level follow-up).
- **JWT Bearer login:** ✅ now works end-to-end (token issue + validate → `SecurityIdentity`, role
  mapping, `@RolesAllowed`). **SAML/SSO + OIDC login:** still not wired (see §6.F). The default e2e
  Docker image + build helper are committed at `docker/quarkus/` (see §3.3).

---

## 1. Repo / flavor layout

Multi-module Gradle build, three selectable flavors via `STIRLING_FLAVOR` (or `ENABLE_SAAS` /
`DISABLE_ADDITIONAL_FEATURES`):

| Flavor | Modules included | Notes |
|--------|------------------|-------|
| `core` | `:common`, `:stirling-pdf` (core) | OSS only |
| `proprietary` (**default**) | + `:proprietary` | what all the e2e work targets |
| `saas` | + `:saas` | opt-in: `STIRLING_FLAVOR=saas`; not yet augmentable |

Module → directory:
- `:stirling-pdf` → `app/core` (the runnable Quarkus app; applies the `io.quarkus` gradle plugin)
- `:common` → `app/common` (library; CDI beans / JAX-RS / entities)
- `:proprietary` → `app/proprietary` (library)
- `:saas` → `app/saas` (library, only on saas flavor)

Quarkus only discovers beans/entities in dependency jars that carry a **Jandex index**; the library
modules are indexed via `quarkus.index-dependency.*` in
`app/core/src/main/resources/application.properties`.

---

## 2. Java 25 is mandatory (don't regress this)

- The build uses a **JDK 25 toolchain** (`build.gradle` `subprojects { java { toolchain = 25 } }`).
- The app is compiled to **class-file version 69 (Java 25)** — it will NOT run on JDK 21.
- **The host's default `java` on the PATH is JDK 21.** Use the toolchain JDK 25 explicitly:
  - `JAVA_HOME` points to a Temurin 25 JDK (`C:\Users\systo\scoop\apps\temurin25-jdk\current`).
  - In Git Bash run the jar with `"$JAVA_HOME/bin/java" -jar ...` (host `java` = 21 → `UnsupportedClassVersionError`).
- The Docker base image `stirlingtools/stirling-pdf-base:1.0.2` ships **Temurin 25.0.2** — so the
  container runtime is JDK 25 already. Keep it that way; do not switch the base image to a JRE < 25.
- Gradle build images / CI also pin `gradle:9.3.1-jdk25` and `eclipse-temurin:25-jre-noble`.

---

## 3. Build → package → run → test (the exact loop)

### 3.1 Build the runnable jar
```bash
./gradlew :stirling-pdf:quarkusBuild -x test --console=plain
```
- Produces the **runnable uber-jar** at: `app/core/build/stirling-pdf-2.12.0-runner.jar`
  - `Main-Class: stirling.software.SPDF.SPDFApplication`.
- ⚠️ **GOTCHA:** `app/core/build/libs/stirling-pdf-2.12.0.jar` is the *plain* (non-runnable) jar with
  an empty manifest. The upstream `docker/embedded/Dockerfile` copies `libs/*.jar` — that's now the
  WRONG jar. Always use the `-runner.jar`. (`quarkus.package.jar.type=uber-jar` is set in
  application.properties.)
- ⚠️ If the build fails with `Unable to delete .../-runner.jar`, a previous `java -jar` is still
  holding it. Kill it: PowerShell `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | ?{ $_.CommandLine -like '*stirling-pdf-2.12.0-runner*' } | %{ Stop-Process -Id $_.ProcessId -Force }`.

### 3.2 Run standalone for a quick boot check (host JDK 25, fastest)
```bash
SECURITY_ENABLELOGIN=false QUARKUS_HTTP_PORT=8095 \
QUARKUS_DATASOURCE_JDBC_URL="jdbc:h2:mem:t;DB_CLOSE_DELAY=-1;MODE=PostgreSQL" \
nohup "$JAVA_HOME/bin/java" -jar app/core/build/stirling-pdf-2.12.0-runner.jar > /tmp/boot.log 2>&1 &
# success line in log: "Stirling-PDF running on port: 8095"  (this app does NOT print Quarkus' "Listening on")
```
Health: `curl localhost:8095/api/v1/info/status` → `{"version":"2.12.0","status":"UP"}`.

### 3.3 The "normal" Docker image (full tools) — what the cucumber e2e uses
The upstream `docker/embedded/Dockerfile` is **Spring-Boot-specific** (uses
`java -Djarmode=tools -jar app.jar extract --layers` + `spring-boot-loader` layers) and does NOT
work with the Quarkus jar. For e2e I built an ad-hoc image layering the runner-jar on the prebuilt
**base image** (which already has Java 25 + LibreOffice + Tesseract + qpdf + Ghostscript + Calibre +
Python). **This Dockerfile lives in a temp dir and needs to be committed into the repo** (see §6 TODO).

Build context (currently ephemeral at the bash path `/tmp/sp-full` =
`C:\Users\systo\AppData\Local\Temp\sp-full`): `app.jar` (the runner jar), `fonts/*.ttf`, and this
Dockerfile:
```dockerfile
FROM stirlingtools/stirling-pdf-base:1.0.2          # Java 25 + all tools
WORKDIR /app
COPY --chown=1000:1000 app.jar /app/app.jar
COPY fonts/*.ttf /usr/share/fonts/truetype/
RUN fc-cache -f \
    && mkdir -p /storage \
    && chown stirlingpdfuser:stirlingpdfgroup /storage /app \
    && ln -sf /configs /app/configs && ln -sf /logs /app/logs \
    && ln -sf /customFiles /app/customFiles && ln -sf /pipeline /app/pipeline \
    && ln -sf /storage /app/storage \
    && chown -h stirlingpdfuser:stirlingpdfgroup /app/configs /app/logs /app/customFiles /app/pipeline /app/storage
ENV HOME=/home/stirlingpdfuser STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf TEMP=/tmp/stirling-pdf TMP=/tmp/stirling-pdf \
    SAL_TMP=/tmp/stirling-pdf/libre DBUS_SESSION_BUS_ADDRESS=/dev/null \
    JAVA_OPTS="-XX:+UseG1GC -Djava.awt.headless=true" \
    QUARKUS_HTTP_HOST=0.0.0.0 QUARKUS_HTTP_PORT=8080
EXPOSE 8080/tcp
STOPSIGNAL SIGTERM
USER stirlingpdfuser
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
```
Stage + build + run:
```bash
# stage (bash /tmp resolves to %LOCALAPPDATA%\Temp)
mkdir -p /tmp/sp-full/fonts
cp app/core/build/stirling-pdf-2.12.0-runner.jar /tmp/sp-full/app.jar
cp app/core/src/main/resources/static/fonts/*.ttf /tmp/sp-full/fonts/
# (write the Dockerfile above to C:\Users\systo\AppData\Local\Temp\sp-full\Dockerfile)
cd /tmp/sp-full && docker build -t stirling-pdf-quarkus:full .
docker rm -f sp-e2e
docker run -d --name sp-e2e -p 8080:8080 \
  -e SECURITY_ENABLELOGIN=false -e METRICS_ENABLED=true \
  -e SYSTEM_DEFAULTLOCALE=en-US -e SYSTEM_MAXFILESIZE=100 \
  stirling-pdf-quarkus:full
# wait for: curl localhost:8080/api/v1/info/status == 200
```
Base image was pulled with `docker pull stirlingtools/stirling-pdf-base:1.0.2`.

### 3.4 Run the cucumber (behave) suite
- Tests live in `testing/cucumber/` — Python **behave** (BDD), pure HTTP via `requests` (no browser).
- **Target URL is hardcoded `http://localhost:8080`** in `features/steps/step_definitions.py`
  (lines ~584/592/601) and `features/environment.py`. Easiest is to run the app on 8080.
- `behave.ini` excludes `features/(enterprise|payg)` and tag `~@manual` by default.
- `environment.py` probes `/api/v1/auth/login` (admin/stirling) at startup; if JWT/login is not
  functional (login disabled / V2) it **skips** all `@jwt @login @me @refresh @token @mfa @apikey
  @admin_settings @audit @signature @team @user_mgmt` scenarios → ~80 skips. That's expected.

Install deps + run:
```bash
cd testing/cucumber
pip install -r requirements.txt        # behave, requests, pypdf, reportlab, psycopg, pillow, ...
TEST_CONTAINER_NAME=sp-e2e TEST_REPORT_DIR=/tmp python -m behave --no-capture --format progress2
# single feature:  python -m behave features/general.feature
# one scenario:    python -m behave features/general.feature:22 --format plain
```
The official CI driver is `testing/test.sh` (builds images via `docker/embedded/Dockerfile.*` and
runs behave) — it will need the Dockerfile fixes from §6 before it works on Quarkus.

---

## 4. Bugs FIXED this session (with the *why*, so you can spot siblings)

### Session 2 (branch `claude/happy-chaplygin-906fe7`, fast-forwarded from `migration/run-01`)

Newest first. These took the login-off suite **183 → 223** and then wired JWT so the **80 skipped
JWT/admin scenarios run** (run 3, §9):

1. **JWT Bearer → `SecurityIdentity` was never populated** → every user-scoped endpoint that reads
   `SecurityIdentity.getPrincipal()` (folders, files, `/me`, user/team settings…) failed, and the
   `environment.py` probe (`login → /me`) failed so ~80 scenarios auto-skipped. Added a custom
   `HttpAuthenticationMechanism` + `IdentityProvider` in
   `app/proprietary/.../security/identity/` (`JwtBearerAuthenticationMechanism`,
   `JwtTokenIdentityProvider`): extract `Authorization: Bearer`, validate via the existing
   `JwtService` (jjwt + keystore), build a `QuarkusSecurityIdentity` and map the `role` claim
   (`ROLE_ADMIN` → also add `ADMIN` so `@RolesAllowed("ADMIN")` matches). Returns no identity when
   no Bearer is present, so the X-API-KEY / login-off open-endpoint path is unaffected. **This is the
   IdentityProvider that ~10 `// TODO: Migration required` comments across the security/storage code
   asked for.** Run with `V2=true`.
2. **No admin user was ever created** → all logins failed "No user found: admin". `InitialSecuritySetup`
   was a Spring `@Component` (eagerly constructed, `@PostConstruct` ran every boot); the migration
   made it a lazy `@ApplicationScoped` whose `@PostConstruct` never ran. Restored eager init via
   `@Observes StartupEvent`. **Pattern: any migrated `@PostConstruct`-on-`@ApplicationScoped` startup
   bean with no injector is dead code — grep for them.**
3. **Eager init then exposed two latent bugs** (both real, both now fixed):
   - `@Produces @ApplicationScoped DataSource` → Arc generated the client proxy in the JDK-sealed
     `javax.sql` package → `NoClassDefFoundError` on first use. Fix: `@Singleton` (pseudo-scope, no
     proxy). **Audit other `@Produces @ApplicationScoped` whose return type is a `java.*`/`javax.*`
     type.**
   - Panache `persist()` in the `StartupEvent` observer ran with no transaction (Spring Data wrapped
     `save()` implicitly). Fix: `@Transactional` on the observer.
4. **Login returned 500 instead of 401** for unknown user / bad password. `CustomUserDetailsService`
   threw `IllegalArgumentException`, but `AuthController` catches the migration shim
   `stirling.software.common.security.UsernameNotFoundException`. Made the service throw the shim
   type. **Sibling: the locked-account path still throws `IllegalStateException` — wire it similarly
   when needed.**
5. **`@Transactional` missing on policy-store reads** (`JpaPolicyStore.all()`,
   `findByTriggerType()`) → the scheduled folder-watch/schedule triggers threw
   `ContextNotActiveException` off-request (§6.C). The reads are reached via the CDI proxy so a
   method-level `@Transactional` applies even from the background virtual-thread executor.
6. **Split scenarios sent a duplicate `fileInput` text part** (`| fileInput | fileInput |` in
   `general.feature`) alongside the file part; Quarkus `@RestForm FileUpload` bound the *text* part
   ("fileInput", 9 bytes) → "PDF corrupted". Spring ignored the stray part. Removed the redundant
   rows (the file is already attached via the generate step). **Real clients send one part, so this
   is a test artifact, not a server tolerance gap worth chasing.**
7. **e2e Docker build is now first-class:** `docker/quarkus/Dockerfile` (+ `README.md`,
   `build-and-run.sh`) layers the runner-jar on the base image, and `.dockerignore` re-includes
   `app/core/build/*-runner.jar` (it was excluded by `**/build/`, so a clean `docker build` had been
   silently relying on BuildKit cache).

### Session 1

1. **`MultipartFile.transferTo` didn't overwrite** (`a30d524ec`).
   `app/common/.../model/MultipartFile.java` + `.../model/multipart/FileUploadMultipartFile.java`
   used `Files.copy(in, dest)` without `REPLACE_EXISTING`. Callers do
   `Files.createTempFile(...)` (creates the file) then `transferTo(thatPath)` → `FileAlreadyExistsException`.
   Spring's `transferTo` overwrites. **Fixed** by adding `StandardCopyOption.REPLACE_EXISTING`.
   Fixes the whole class of `/api/v1/misc/*` failures (scanner-effect, replace-invert, ocr,
   update-metadata, unlock-pdf-forms, repair, extract-image-scans, add-page-numbers, …).

2. **`maxDPI` defaulted to 0** (`a30d524ec`).
   `ApplicationProperties.System.maxDPI` is a primitive `int` (→ 0 when not bound from settings).
   Every DPI guard (`dpi > maxDPI`) then failed with *"maximum safe limit of 0"*. The
   `settings.yml.template` default is 500. **Fixed** by `private int maxDPI = 500;`.
   ⚠️ Root cause hint: this strongly suggests **settings.yml → ApplicationProperties config binding
   is incomplete in the Quarkus migration**. Other primitive/unset fields may also be silently
   wrong. Worth a dedicated audit (see §5).

3. **Request-path `HttpServletRequest` → `UT000048` "No request is currently active"** (`860bd6e63`,
   `4b572852c`). This was the dominant blocker. `quarkus-rest` (RESTEasy Reactive) runs handlers on
   reactive/worker threads where the undertow servlet request context is NOT active, so ANY
   `HttpServletRequest.getX()` throws. Fixed in:
   - `GlobalExceptionHandler` (an `ExceptionMapper` that threw while handling *every* error, masking
     the real cause) → `@Context UriInfo` + exception-safe `requestUri()`.
   - `ControllerAuditAspect`, `AuditAspect` → route through the already-guarded
     `AuditService.getCurrentRequest()` (returns null off-request) + a guarded `safeResponse()`.
   - `AutoJobAspect`, `JobExecutorService` → inject `io.quarkus.vertx.http.runtime.CurrentVertxRequest`,
     read query-param/method/path/attributes from the Vert.x request, degrade to null/no-op.
   - `AuthController`, `UserController`, `ConfigController` → `@Context UriInfo` / `HttpHeaders` /
     `io.vertx.core.http.HttpServerRequest`.
   This unblocked the entire `@AutoJobPostMapping` chain (most PDF endpoints).

4. **License singleton PK race** (`860bd6e63`). `UserLicenseSettings` has a manually-assigned
   `@Id = 1L`. Spring Data `save()` on a non-new (pre-set-id) entity does a **MERGE (upsert)**; the
   migration converted it to `persist()` (INSERT-only). The startup license sync raced the first
   request, both inserted id=1 → `JdbcSQLIntegrityConstraintViolationException` → app crash. **Fixed**
   in `UserLicenseSettingsService.getOrCreateSettings()` with a JVM lock +
   `io.quarkus.narayana.jta.QuarkusTransaction.requiringNew()` create-once, then reload into the
   caller's tx. **⚠️ This `save()`→`persist()`-should-be-`merge()` bug almost certainly exists for
   OTHER manually-`@Id`'d entities — audit them (see §5).**

5. **App couldn't boot without Redis** (`4665cceeb`).
   - `quarkus.oidc.enabled=false` default (quarkus-oidc aborts startup without `auth-server-url`;
     re-enable for an OAuth2 deployment).
   - Valkey backplane beans eagerly injected the inactive `RedisDataSource`. Gated all 7 with
     **build-time** `@io.quarkus.arc.properties.IfBuildProperty(name="cluster.backplane", stringValue="valkey")`
     (NOT `@LookupIfProperty` — that leaves the bean in the build, so `RedisDataSource` still has a
     consumer and Quarkus emits an eager startup observer that fails). Plus
     `quarkus.redis.health.enabled=false`.

6. **Runtime boot fixes** (`20b25ad76`): `quarkus.hibernate-orm.mapping.format.global=ignore` (JSON
   columns), Quartz cron `0 0 0 * * MON` → `0 0 0 ? * MON` (Quartz rejects `*` in both day fields),
   `@Scheduled(every="7d")` → `"P7D"`, `quarkus.arc.fail-on-intercepted-private-method=false`.

7. **CDI augmentation** (`185ac88b3`): interceptor bindings made `@InterceptorBinding`
   (`@EnterpriseEndpoint`, `@PremiumEndpoint`), a `tools.jackson.databind.ObjectMapper` producer
   added in `AppConfig` (92 injection points), ambiguous beans resolved (`@DefaultBean`),
   `Optional<X>`→`Instance<X>`, collection `List<X>`→`@All List<X>`, nested `SAML2` config producer.

8. **Test layer** (`d51228af6`): a content-based exclude in root `build.gradle subprojects` skips any
   test still importing `org.springframework`/`com.nimbusds` (self-maintaining), plus an explicit
   list for tests asserting changed production signatures.

---

## 5. Recurring patterns / gotchas (apply these everywhere)

- **HttpServletRequest is poison on reactive threads.** ~35 main-source files still reference
  `HttpServletRequest` (see §6 list). For each in the request path, replace with:
  - path/URI → `@Context jakarta.ws.rs.core.UriInfo` (`uriInfo.getRequestUri().getPath()`), or in a
    non-JAX-RS bean inject `io.quarkus.vertx.http.runtime.CurrentVertxRequest`
    (`currentVertxRequest.getCurrent().request().path()`), guarded in try/catch returning null/"".
  - headers → `@Context jakarta.ws.rs.core.HttpHeaders` (`getHeaderString(name)`).
  - remote addr / method → `@Context io.vertx.core.http.HttpServerRequest`.
  - request attributes (`get/setAttribute`) → Vert.x `RoutingContext.get/put` via `CurrentVertxRequest`.
  - In services that already have a guarded accessor, reuse `AuditService.getCurrentRequest()`.
- **Spring `save()` → Panache:** if the entity uses `@GeneratedValue` (new on insert) → `persist()`.
  If the entity has a **manually-assigned `@Id`** (caller sets the id, "upsert" semantics) →
  `getEntityManager().merge()` (NOT `persist()`), and consider concurrency.
- **Config gating:** runtime selection that must REMOVE a bean (so its deps don't get wired) →
  build-time `@IfBuildProperty`/`@UnlessBuildProperty`. `@LookupIfProperty` only disables *lookup*,
  the bean and its injection points stay in the build.
- **`quarkus.*` build-time props** (e.g. `quarkus.oidc.enabled`, `quarkus.hibernate-orm.*`,
  `quarkus.arc.*`) can't be overridden by env at runtime — they require a rebuild.
- **settings.yml binding is suspect** (see maxDPI). Audit `ApplicationProperties` for primitive
  fields that need non-zero/template defaults, and verify the settings.yml → ApplicationProperties
  binding path actually works in Quarkus (it was Spring `@ConfigurationProperties` + a custom YAML
  property source — see the `YamlPropertySourceFactory` / `ConfigInitializer` TODOs).
- **Augment gate:** `compileJava` passing ≠ working. `./gradlew :stirling-pdf:quarkusBuild` surfaces
  CDI wiring errors; only *running* surfaces the `UT000048` / config / race bugs. Always run.
- **Jackson 2 vs 3 coexist:** ~100 files use `tools.jackson` (Jackson 3, from Spring Boot 4); REST
  (de)serialization uses Quarkus' Jackson 2. Don't "fix" `tools.jackson` imports — there's a producer.

---

## 6. REMAINING WORK (prioritized)

### A. Make the e2e Docker build first-class (do this first)
- [ ] Commit the working Dockerfile from §3.3 into the repo (e.g. `docker/quarkus/Dockerfile`),
      and add fonts copy. It must use the runner-jar, not `libs/*.jar`.
- [ ] Rewrite/replace `docker/embedded/Dockerfile`, `Dockerfile.fat`, `Dockerfile.ultra-lite` for
      Quarkus: drop the Spring-Boot `-Djarmode=tools extract --layers` + `spring-boot-loader` layer
      copies; either copy the uber `-runner.jar` to `/app/app.jar` or use the Quarkus fast-jar
      (`quarkus-app/`) layout. The stage-1 `gradle clean build -PbuildWithFrontend=true` still builds
      the frontend (fine).
- [ ] Update `scripts/init.sh` / `init-without-ocr.sh` — they have Spring-loader fallbacks and AOT
      machinery; the primary `java -jar /app.jar` path works for the uber-jar, but verify the AOT
      cache + `restart-helper.jar` paths.
- [ ] Then `testing/test.sh` (the official cucumber driver) should work end-to-end.

### B. Real per-endpoint bugs surfaced by cucumber (login-off suite)
Last measured failure buckets (before the transferTo/maxDPI fixes — re-run to refresh):
- [ ] **`PdfCorruptedException` (~48)** on `convert/pdf/{word,vector,presentation,text,pdfa,...}`,
      `convert/{html,cbz}/pdf`. Investigate `CustomPDFDocumentFactory` (PDF loading) — is it
      misreporting valid PDFs as corrupted, or do these convert paths need LibreOffice/handling that
      errors first and gets wrapped? Check one: `python -m behave features/convert_new.feature:NN --format plain`
      then read `docker logs sp-e2e` for the real cause.
- [ ] **`ClassCastException: String cannot be cast to ...` (~6)** — form/param binding type mismatch.
      Likely a `@RestForm`/`@QueryParam` bound to the wrong type, or a Map/JSON form field. Check
      `form/fill`, `form_advanced.feature`.
- [ ] **Remaining `500`s** after A/B fixes — `misc/compress-pdf`, `general/split-pdf-by-chapters`,
      `misc/add-image`, etc. Triage each via container logs.
- [ ] **`400`s (~5)** — multipart `@RestForm` binding gaps. The migration left several request DTOs
      with `MultipartFile`/POJO-list fields not bound to RESTEasy `FileUpload` (AI/workflow/sign DTOs
      explicitly flagged). See `migration-report.md` "Representative deferred code".
- [ ] **temp-file collisions other than transferTo** — also check `GeneralUtils.createTempFile`
      (`app/common/.../util/GeneralUtils.java:79/85`) and any `Files.createFile`/`Files.copy`/
      `Files.move` without `REPLACE_EXISTING`. `temp<rand>genericNonCustomisableName.pdf` and
      `/tmp/stirling-pdf/stirling-pdf-<rand>.pdf` were two such names.

### C. Background scheduled-task errors (log noise, not request-breaking)
- [ ] `FolderWatchTrigger` (reconcile) and `ScheduleTrigger` (sweep) throw
      `jakarta.enterprise.context.ContextNotActiveException` ("neither a transaction nor a CDI
      request context is active") because they hit Panache/`PolicyRepository` off-request. Add
      `@Transactional` (and/or `@ActivateRequestContext`) to those scheduled methods, or wrap the EM
      access in `QuarkusTransaction.requiringNew()`. Files:
      `app/proprietary/.../policy/trigger/FolderWatchTrigger.java`,
      `.../policy/trigger/ScheduleTrigger.java`, `.../policy/store/JpaPolicyStore.java`.

### D. The remaining ~35 `HttpServletRequest` files (apply §5 pattern as they surface)
Not all are in the hot path; fix the ones that throw `UT000048` when their endpoints are exercised.
Get the list any time with:
```bash
grep -rln "HttpServletRequest" app/core/src/main app/proprietary/src/main app/common/src/main --include=*.java
```
Known-fixed already: GlobalExceptionHandler, ControllerAuditAspect, AuditAspect, AutoJobAspect,
JobExecutorService, AuthController, UserController, ConfigController. Everything else is unverified.
High-risk: security filters (`UserAuthenticationFilter`, rate-limit filters, `JwtAuthenticationFilter`),
anything reading headers/cookies/remote-addr per request.

### E. Auth / JWT / login (needed for the ~80 skipped scenarios)
- [ ] Bring up the app with login ENABLED + V2 (JWT) + a seeded `admin/stirling` user so
      `environment.py`'s JWT probe passes and the `@jwt/@login/...` scenarios run.
- [ ] Verify `AuthController.login` path end-to-end (it currently logs "No user found: admin" because
      there is no admin user when login is disabled — that's expected, but with login on it must work).
- [ ] JWT issuance/verification via jjwt + `KeyPersistenceService` (keys load from disk OK at boot).
- [ ] Security filter registration & ordering: the Spring `OncePerRequestFilter` chain
      (`UserAuthenticationFilter` + rate-limit + JWT) must be reproduced via Quarkus filter
      registration (servlet `@WebFilter`/`jakarta.ws.rs ContainerRequestFilter @Provider`) with
      correct ordering. Several `// TODO: Migration required` mark this.

### F. SAML / SSO (the `testing/compose` validate scripts) — NOT started
- [ ] SAML2 is rehosted on **OpenSAML 5** (deps pinned in `app/proprietary/build.gradle`) but the
      code wiring is incomplete (`SecurityConfiguration` notes the `org.springframework.security.saml2.*`
      glue was removed). Needs a Jakarta `@WebServlet` (quarkus-undertow) ACS/metadata endpoint per
      the dnulnets/quarkus-saml pattern.
- [ ] OIDC/OAuth2 login: re-enable `quarkus.oidc.enabled=true` + configure a provider; map the
      `CustomOAuth2*SuccessHandler` logic.
- [ ] The `testing/compose` SSO/SAML scripts (`docker-compose-keycloak-mcp.yml`, the saml validate
      scripts) need a Keycloak/IdP container + the above wired before they can pass.

### G. `saas` flavor full augmentation (optional, non-default)
- [ ] `STIRLING_FLAVOR=saas ./gradlew :stirling-pdf:quarkusBuild` → ~28 Arc deployment problems
      (Supabase second datasource via `quarkus.datasource."supabase".*`, `SecurityFilterChain`/
      `JwtDecoder` → `quarkus.http.auth.*`+OIDC, credit `HandlerInterceptor`/`@RestControllerAdvice`
      → JAX-RS `@Provider`/`ExceptionMapper`, `@ConfigurationProperties` → `@ConfigMapping`,
      RestTemplate → REST Client). ~90 `// TODO: Migration required` across 34 saas files.

### H. Test suite (unit/integration) re-enablement
- [ ] ~180 test files are excluded from compilation (content filter on `org.springframework`/
      `com.nimbusds` imports + an explicit list in `build.gradle`). Port them to `@QuarkusTest`
      incrementally; as a file's Spring imports go away it auto-re-enters the build.

### I. Loose ends
- [ ] `/q/openapi` returns 500 (`UT000048`) — known quarkus-undertow + smallrye-openapi interaction;
      swagger-ui works, live API works. Affects API-doc tooling only.
- [ ] Jackson 2/3 convergence (drop `tools.jackson`).
- [ ] ~437 `// TODO: Migration required` markers across the codebase document every deferred decision;
      `grep -rn "TODO: Migration required" app/*/src/main` to enumerate.

---

## 7. Quick reference — env vars used in e2e

| Var | Value | Why |
|-----|-------|-----|
| `SECURITY_ENABLELOGIN` | `false` | run without auth (most API tests); set `true` for the JWT suite |
| `METRICS_ENABLED` | `true` | enables `/api/v1/info/*` (info.feature) |
| `SYSTEM_DEFAULTLOCALE` | `en-US` | matches default-language change |
| `SYSTEM_MAXFILESIZE` | `100` | upload limit for tests |
| `QUARKUS_HTTP_PORT` | `8080` | cucumber steps hardcode 8080 |
| `QUARKUS_DATASOURCE_JDBC_URL` | `jdbc:h2:mem:...` | use a fresh in-mem DB for clean runs (avoids stale H2 file lock) |

Default datasource (in `application.properties`) is **H2 file** at
`./configs/stirling-pdf-DB-2.3.232` — fine in a container; for repeated host runs override to
`jdbc:h2:mem:...` to dodge the file lock (`Database may be already in use`).

---

## 8. Useful diagnostic one-liners

```bash
# container alive + real error (strip ANSI, drop known background noise)
docker logs sp-e2e 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -iE "ERROR|Caused by|Exception" \
  | grep -viE "Log4j|LogManager|ForkJoinPool|FolderWatch|ScheduleTrigger|policy-" | tail -30

# categorize cucumber failures
cd testing/cucumber && TEST_CONTAINER_NAME=sp-e2e python -m behave --no-capture --format plain --no-skipped > /tmp/behave.txt 2>&1
grep -oE "Expected status code [0-9]+ but got [0-9]+" /tmp/behave.txt | sort | uniq -c | sort -rn
grep -oE "features/[a-z_]+\.feature" /tmp/behave.txt | sort | uniq -c | sort -rn   # rough; use a junit reporter for precise

# what still touches the servlet request
grep -rln "HttpServletRequest" app/*/src/main --include=*.java

# enumerate deferred work
grep -rn "TODO: Migration required" app/*/src/main --include=*.java | wc -l
```

---

## 9. Measured cucumber results — newest first

**Run 3 — login off + `V2=true` + JWT Bearer mechanism (Session 2):**
```
17 features passed, 8 failed, 0 skipped
272 scenarios passed, 66 failed, 0 skipped     <-- 0 skipped: all JWT/admin scenarios now run
```
The JWT mechanism unskipped all 80 and added +49 passing over run 2 with no regressions. Remaining
66 failures, biggest buckets:
- **~38 = login-lockout cascade (FIXED, pending re-measure).** `loginAttemptCount` defaulted to 0
  (template = 5) → admin locked after one failed-login test → every later admin scenario blocked
  ("Admin login failed" 21×, "Folder list returned" 17×). Fixed the primitive default (same as
  maxDPI). **Re-run to confirm; expect ~300+.**
- 10×(200→403) feature-gated/disabled (mostly not bugs).
- 5×(200→401) + 2×(401→403) — auth scenarios asserting specific codes; triage individually.
- 3×(200→500) — real per-endpoint bugs (e.g. `user/get-api-key`). Triage via container logs.

**Run 2 — login off, Session 2 fixes, no JWT mechanism:**
```
16 features passed, 5 failed, 4 skipped
223 scenarios passed, 35 failed, 80 skipped
```

**Run 1 — original baseline (login off):**
```
183 scenarios passed, 75 failed, 80 skipped
```

Trajectory this session: **183 → 223 (boot/login/test fixes) → 272 (JWT mechanism), 0 skipped.**
