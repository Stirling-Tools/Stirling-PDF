# Migration Report: Stirling-PDF (Spring Boot 4 → Quarkus)

> **Status: IN PROGRESS.** This is a large, multi-session migration of a ~942-main-file
> multi-module application. The build layer is complete and validated; the code layer is
> partially converted (common-module DI). This report is a living document, updated per session.

## Summary

- **Strategy:** Full native Quarkus (not the spring-compat extensions). Chosen after confirming the
  `quarkus-spring-*` shims have no path for the `SecurityFilterChain`/`HttpSecurity` DSL, SAML2,
  OAuth2 login, or MVC interceptors. Native handles these via rewrite (`quarkus-oidc`,
  `quarkus-smallrye-jwt`, JAX-RS filters, Panache).
- **Agent:** claude
- **Model:** claude-opus-4-8[1m]
- **Quarkus version:** 3.33.2 LTS
- **Java:** 25 (kept - Quarkus 3.31+ fully supports JDK 25; needed for jpdfium native FFM)
- **SAML2:** No native Quarkus extension exists. Rehosted on OpenSAML 5 (already pinned at 5.2.1)
  following the [dnulnets/quarkus-saml](https://github.com/dnulnets/quarkus-saml) example
  (Jakarta `@WebServlet` + `quarkus-undertow`). **Not yet implemented in code.**
- **Branch:** `migration/run-01` (draft-PR workflow; never merged into `main`).
- **Modules completed:** 1 of 7 (build). Code module ~partial.

## Modules

| Module | Status | Notes |
|--------|--------|-------|
| Build (Gradle + config) | ✅ Done | Plugins, BOM, extension mapping, `application.properties`. `./gradlew :stirling-pdf:help` succeeds. |
| Code: DI/REST/scheduling | 🟡 ~80% of common | common: 62 of 77 Spring files converted (DI, scheduling, markers, AppConfig producers, MultipartFile shim). 15 hard residual files remain (Resource, ResponseEntity util, RestTemplate, StreamingResponseBody, AutoJob AOP, Spring config infra). core/proprietary/saas controllers not started. |
| Code: Data JPA → Panache | ⬜ Not started | Repositories/entities across proprietary + saas. |
| Code: Security/OAuth2/JWT/SAML | ⬜ Not started | ~200 files. SAML2 on OpenSAML 5; OAuth2→quarkus-oidc; JWT→smallrye-jwt; filters→JAX-RS. |
| Frontend (static/SPA routing) | ⬜ Not started | Move `static/`→`META-INF/resources/`; replace `ReactRoutingController`. |
| Testing → @QuarkusTest | ⬜ Not started | 371 test files. |
| Cleanup + verify + PR | ⬜ Not started | |

## Changes by area (this run)

### Build (committed: `266aed750`)
- `gradle.properties`: Quarkus 3.33.2 platform/plugin coordinates.
- `settings.gradle`: `pluginManagement` resolves `io.quarkus`; added `mavenCentral()`.
- `build.gradle` (root): removed `org.springframework.boot`, `io.spring.dependency-management`,
  `org.springdoc.openapi-gradle-plugin`. Quarkus BOM via `enforcedPlatform`. actuator→
  `smallrye-health`+`micrometer`; test→`quarkus-junit5`+RestAssured; `bootRun`/`bootJar`→
  `quarkusDev`/`quarkusBuild`.
- `app/common`: `webmvc`→`quarkus-rest`+`quarkus-undertow` (servlet bridge)+`hibernate-validator`;
  `springdoc`→`smallrye-openapi`; added `quarkus-scheduler`, `swagger-core-jakarta`; kept Jackson 3
  (`tools.jackson`) as a coexisting library.
- `app/core`: applies `io.quarkus` plugin; removed Jetty/devtools/`bootJar`; added `quarkus-jdbc-h2`.
- `app/proprietary`: `data-jpa`→`hibernate-orm-panache`; `security`→`quarkus-security`; oauth2→
  `quarkus-oidc`; mail→`quarkus-mailer`; cache→`quarkus-cache`; redis→`quarkus-redis-client`;
  SAML2→explicit OpenSAML 5 deps; micrometer-prometheus; `quarkus-jdbc-h2`/`-postgresql`.
- `app/saas`: security/jpa/oidc/flyway → Quarkus extensions.
- `app/core/.../application.properties`: rewritten to Quarkus keys + `quarkus.index-dependency`
  entries for the library modules.

### Code: common module (committed: `74474fa96`, `5dd6d7be6`)
- 20 `annotations/api/*` markers: removed `@RestController`/`@RequestMapping`, kept OpenAPI `@Tag`,
  documented the `@Path` each controller must now declare directly.
- `SchedulingConfig`: removed Spring `TaskScheduler` bean (quarkus-scheduler owns the pool).
- 17 DI files → CDI: `@Service`/`@Component`→`@ApplicationScoped`; `@Autowired`→constructor/`@Inject`;
  `@Value`→`@ConfigProperty`; `@Qualifier`→`@Named`; `@Scheduled(fixedRate=…)`→`@Scheduled(every=…)`;
  `DisposableBean`→`@PreDestroy`; `ApplicationRunner`→`@Observes StartupEvent`; optional
  `@Autowired(required=false)`→`Instance<>`; Spring `Environment`→MicroProfile `Config`.
- `AppConfig`: `@Configuration`/`@Bean`→`@Produces`/`@Named`; `@Profile("default")`→`@DefaultBean`;
  request-scoped primitives→`@Dependent`.

## Cross-cutting shims (low-ripple migration aids)

- **`MultipartFile`** → `stirling.software.common.model.MultipartFile` interface mirroring Spring's
  method surface, with `ByteArrayMultipartFile` and `FileUploadMultipartFile` (adapts Quarkus REST
  `FileUpload`) implementations. Converting a file is now just an import swap; controllers adapt
  inbound `FileUpload` at the boundary. Applied to all 23 common usages.
- **TODO (next):** a similar `Resource` strategy/shim for the 18 `org.springframework.core.io.Resource`
  usages, and a decision on `WebResponseUtils` (`ResponseEntity` → JAX-RS `Response`) which ripples
  into every controller and is best done alongside controller migration.

## Established conversion patterns (reusable for remaining modules)

| Spring | Quarkus / Jakarta |
|--------|-------------------|
| `@Service`/`@Component`/`@Repository` | `@ApplicationScoped` |
| `@Autowired` ctor / field | constructor injection / `@Inject` |
| `@Autowired(required=false)` | `Instance<T>` + `isResolvable()`/`get()` |
| `@Qualifier("x")` | `@Named("x")` |
| `@Value("${k:def}")` | `@ConfigProperty(name="k", defaultValue="def")` |
| `Environment.getProperty` | `Config.getOptionalValue(...)` |
| `@Configuration` + `@Bean` | bean class + `@Produces` |
| `@Bean(name="x")` | `@Produces @Named("x")` |
| `@Profile("default")` override bean | `@DefaultBean` (overridden by proprietary/saas producers) |
| `@Scope("request")` primitive | `@Dependent` (see TODO about true request scope) |
| `@Scheduled(fixedRate=5000)` | `io.quarkus.scheduler.@Scheduled(every="5s")` |
| `DisposableBean.destroy()` | `@PreDestroy` |
| `ApplicationRunner` | `void onStart(@Observes StartupEvent)` |
| `@RestController`+`@RequestMapping` | JAX-RS `@Path` on the class (NOT inheritable via meta-annotation) |

## Outstanding TODOs (code)

Tracked inline as `// TODO: Migration required` comments. Major items:
- **common**: `ApplicationProperties` (`@ConfigurationProperties`→`@ConfigMapping` or `@ConfigProperties`),
  `AutoJobAspect` (AspectJ→CDI interceptor), `RuntimePathConfig`/`PostHogConfig`/cluster `@Configuration`
  classes, 23 `MultipartFile` files (→Quarkus multipart / `@RestForm`), 11 `ResponseEntity` files
  (→JAX-RS `Response`), 15 `core.io.Resource` files.
- **TempFileCleanupService**: `@Scheduled` SpEL bean-property expression has no Quarkus equivalent;
  interval must be exposed as a config key.
- **Jackson**: converge 100 `tools.jackson` (Jackson 3) + 50 `com.fasterxml` (Jackson 2) files;
  Quarkus REST uses Jackson 2. `FAIL_ON_NULL_FOR_PRIMITIVES=false` needs an `ObjectMapperCustomizer`.
- **Security (proprietary)**: full rewrite - `SecurityConfiguration`/filters→Quarkus security +
  JAX-RS `ContainerRequestFilter`; OAuth2→`quarkus-oidc`; JWT→`quarkus-smallrye-jwt`; Spring Session→
  custom/undertow session; **SAML2→OpenSAML 5 servlet**.
- **App entry point**: `SPDFApplication` (`@SpringBootApplication`, `SpringApplication.run`, external
  `spring.config.additional-location`) → `@QuarkusMain` + SmallRye Config sources.
- **OpenAPI**: regenerate `SwaggerDoc.json` from `/q/openapi` if still needed for `swaggerhubUpload`.

## Removed code

| What | Where | Justification |
|------|-------|---------------|
| Spring Boot / dependency-management / springdoc Gradle plugins | root `build.gradle` | Replaced by `io.quarkus` plugin + BOM. |
| `spring-boot-starter-jetty`, jetty-http2/alpn | core, proprietary | Quarkus uses its own Vert.x HTTP server. |
| `spring-boot-devtools` | core | Quarkus dev mode (`quarkusDev`) replaces it. |
| `spring-session-core` | proprietary | No Quarkus equivalent; session handling to be rewritten (TODO). |
| `spring-security-saml2-service-provider` | proprietary | Rehosted on OpenSAML 5 (TODO). |
| `TaskScheduler` bean | `SchedulingConfig` | quarkus-scheduler owns the pool. |

## Validation (current)

| Check | Result | Notes |
|-------|--------|-------|
| Build scripts evaluate (`./gradlew :stirling-pdf:help`) | ✅ PASS | Quarkus plugin + BOM + extensions resolve. |
| `compileJava` | ❌ Expected FAIL | Code layer mostly still on Spring imports - by design mid-migration. |
| No Spring deps | ❌ Not yet | Spring removed from build; code references remain until ported. |
| Has Quarkus | ✅ PASS | BOM + many extensions present. |
| Tests pass | ⬜ N/A | Test migration not started. |
| Starts up | ⬜ N/A | |

## Skill improvement suggestions
- The dependency-map should note Quarkus JDK-25 support (3.31+) and the Jackson-2-only integration
  (Jackson 3 coexistence caveat).
- Add a "multi-module Gradle" recipe: app applies `io.quarkus`, libraries indexed via
  `quarkus.index-dependency` (this large-app case isn't covered by the single-module examples).
- Add explicit guidance for `@Configuration`/`@Bean`→`@Produces` including `@DefaultBean` for
  `@Profile` defaults and the CDI "can't proxy primitives" limitation vs Spring request scope.
- Note that JAX-RS does not honor `@Path` on Spring-style composed/meta-annotations.
