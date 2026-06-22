package stirling.software.proprietary.sources.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.sources.model.SourceDetailView;
import stirling.software.proprietary.sources.model.SourceView;
import stirling.software.proprietary.sources.model.SourcesKpi;
import stirling.software.proprietary.sources.model.SourcesResponse;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Assembles the portal's Sources overview from real backend data.
 *
 * <p>This first slice covers API clients only: every user that holds an API key becomes one {@code
 * apiclient} row, and its activity is the count of {@code PDF_PROCESS} audit events that originated
 * from an API-key request ({@code __origin == "API"}) attributed to that user. Other source types
 * (sessions, batch jobs) are layered on later.
 *
 * <p>The 30-day audit slice is loaded once and grouped in memory rather than parsed per user: the
 * API-vs-web origin lives in the event's JSON {@code data} blob, so it can't be filtered in the
 * query. Fine for an admin dashboard; revisit with a persisted origin column if the window grows.
 */
@Slf4j
@Service
@Profile("saas")
@RequiredArgsConstructor
public class SourcesService {

    private static final String PDF_PROCESS = AuditEventType.PDF_PROCESS.name();
    private static final Duration WINDOW_30D = Duration.ofDays(30);
    private static final Duration WINDOW_24H = Duration.ofHours(24);

    private final UserRepository userRepository;
    private final PersistentAuditEventRepository auditEventRepository;
    private final ObjectMapper objectMapper;

    public SourcesResponse overview() {
        Instant now = Instant.now();
        Instant from24h = now.minus(WINDOW_24H);

        List<User> apiUsers =
                userRepository.findAll().stream()
                        .filter(user -> isNotBlank(user.getApiKey()))
                        .toList();

        if (apiUsers.isEmpty()) {
            return new SourcesResponse(buildKpis(List.of()), List.of());
        }

        Map<String, List<Instant>> apiCallTimes =
                apiCallTimestampsByPrincipal(now.minus(WINDOW_30D), now);

        List<SourceView> sources =
                apiUsers.stream()
                        .map(user -> toSource(user, apiCallTimes, from24h, now))
                        .sorted(Comparator.comparingLong(SourceView::docs24h).reversed())
                        .toList();

        return new SourcesResponse(buildKpis(sources), sources);
    }

    /** Timestamps of API-origin PDF operations in the window, grouped by lower-cased principal. */
    private Map<String, List<Instant>> apiCallTimestampsByPrincipal(Instant from, Instant to) {
        List<PersistentAuditEvent> events =
                auditEventRepository.findAllByTypeAndTimestampBetweenForExport(
                        PDF_PROCESS, from, to);

        Map<String, List<Instant>> byPrincipal = new HashMap<>();
        for (PersistentAuditEvent event : events) {
            if (event.getPrincipal() == null || event.getTimestamp() == null) {
                continue;
            }
            if (!isApiOrigin(event)) {
                continue;
            }
            byPrincipal
                    .computeIfAbsent(
                            event.getPrincipal().toLowerCase(Locale.ROOT), key -> new ArrayList<>())
                    .add(event.getTimestamp());
        }
        return byPrincipal;
    }

    private SourceView toSource(
            User user, Map<String, List<Instant>> apiCallTimes, Instant from24h, Instant now) {
        String username = user.getUsername();
        List<Instant> times =
                username == null
                        ? List.of()
                        : apiCallTimes.getOrDefault(username.toLowerCase(Locale.ROOT), List.of());

        long docs30d = times.size();
        long docs24h = times.stream().filter(time -> time.isAfter(from24h)).count();
        Instant last = times.stream().max(Comparator.naturalOrder()).orElse(null);

        String owner = firstNonBlank(user.getEmail(), username, "unknown");
        String name = firstNonBlank(username, owner);

        return new SourceView(
                "apiclient-" + user.getId(),
                name,
                "apiclient",
                deriveStatus(user, docs24h),
                docs24h,
                docs30d,
                humanizeAgo(last, now),
                owner,
                buildDetail(user, owner, docs24h, docs30d, last, now));
    }

    private static String deriveStatus(User user, long docs24h) {
        if (Boolean.FALSE.equals(user.getEnabled())) {
            return "paused";
        }
        return docs24h > 0 ? "active" : "idle";
    }

    private static SourceDetailView buildDetail(
            User user, String owner, long docs24h, long docs30d, Instant last, Instant now) {
        return SourceDetailView.basic(
                List.of(
                        new SourceDetailView.Row("API key", maskKey(user.getApiKey())),
                        new SourceDetailView.Row("Owner", owner),
                        new SourceDetailView.Row(
                                "Access", user.isEnabled() ? "Enabled" : "Disabled"),
                        new SourceDetailView.Row("Docs via API (24h)", Long.toString(docs24h)),
                        new SourceDetailView.Row("Docs via API (30d)", Long.toString(docs30d)),
                        new SourceDetailView.Row("Last API call", humanizeAgo(last, now))));
    }

    private static List<SourcesKpi> buildKpis(List<SourceView> sources) {
        long total = sources.size();
        long active = sources.stream().filter(source -> source.docs24h() > 0).count();
        long docs24h = sources.stream().mapToLong(SourceView::docs24h).sum();
        long docs30d = sources.stream().mapToLong(SourceView::docs30d).sum();
        return List.of(
                new SourcesKpi(total, "with API access"),
                new SourcesKpi(active, total + " total"),
                new SourcesKpi(docs24h, "PDF operations"),
                new SourcesKpi(docs30d, "PDF operations"));
    }

    /** True when the event's JSON data marks it as API-key traffic (see AuditService origins). */
    private boolean isApiOrigin(PersistentAuditEvent event) {
        String json = event.getData();
        if (isBlank(json)) {
            return false;
        }
        try {
            Object parsed = objectMapper.readValue(json, Map.class);
            return parsed instanceof Map<?, ?> data
                    && "API".equals(String.valueOf(data.get("__origin")));
        } catch (JacksonException e) {
            log.trace("Skipping audit event with unparseable data", e);
            return false;
        }
    }

    private static String maskKey(String key) {
        if (isBlank(key)) {
            return "----";
        }
        String last4 = key.length() <= 4 ? key : key.substring(key.length() - 4);
        return "****" + last4;
    }

    /** Coarse "x ago" string for the table; computed at request time, so it is point-in-time. */
    private static String humanizeAgo(Instant time, Instant now) {
        if (time == null) {
            return "never";
        }
        long seconds = Math.max(0, Duration.between(time, now).getSeconds());
        if (seconds < 60) {
            return seconds + "s ago";
        }
        long minutes = seconds / 60;
        if (minutes < 60) {
            return minutes + "m ago";
        }
        long hours = minutes / 60;
        if (hours < 24) {
            return hours + "h ago";
        }
        return (hours / 24) + "d ago";
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isNotBlank(String value) {
        return !isBlank(value);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (isNotBlank(value)) {
                return value;
            }
        }
        return "unknown";
    }
}
