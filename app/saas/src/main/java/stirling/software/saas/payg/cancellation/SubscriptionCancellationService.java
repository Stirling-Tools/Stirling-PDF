package stirling.software.saas.payg.cancellation;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.model.SaasTeamExtensions;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.SubscriptionState;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;

/**
 * In-app cancellation for a team's Team and Processor subscriptions. Reads come from the Stripe
 * mirror; the only Stripe writes go through {@link CancellationEdgeClient}. Cancelling schedules
 * the end of the paid period and never ends anything early.
 *
 * <p>Every cancel, resume and "talk to us first" request is logged to {@code
 * subscription_cancellation_event} as product feedback. A request to talk goes to the churn Slack
 * channel and is capped per team per day.
 */
@Slf4j
@Service
@Profile("saas")
@RequiredArgsConstructor
public class SubscriptionCancellationService {

    static final String TEAM = "team";
    static final String PROCESSOR = "processor";
    static final int DAILY_CONTACT_LIMIT = 3;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public record SubscriptionView(
            String product,
            String subscriptionId,
            String status,
            boolean cancelling,
            String endsAt,
            String periodEnd) {}

    public record CancelRequest(
            String product, String reason, String detail, String competitor, String offerShown) {}

    public record ContactRequest(String product, String reason, String message, String replyTo) {}

    private final PaygTeamExtensionsRepository paygExtensions;
    private final SaasTeamExtensionsRepository teamExtensions;
    private final TeamRepository teamRepository;
    private final StripeSubscriptionDao subscriptions;
    private final CancellationEdgeClient edge;
    private final ChurnAlertPoster alerts;
    private final JdbcTemplate jdbcTemplate;

    public List<SubscriptionView> status(long teamId) {
        return live(teamId).entrySet().stream().map(e -> view(e.getKey(), e.getValue())).toList();
    }

    public List<SubscriptionView> cancel(long teamId, User actor, CancelRequest req) {
        CancelReason reason = reason(req.reason());
        String detail = text(req.detail(), 2000);
        String competitor = text(req.competitor(), 200);
        String offerShown = text(req.offerShown(), 64);
        String comment =
                Stream.of(competitor == null ? null : "Switching to: " + competitor, detail)
                        .filter(Objects::nonNull)
                        .collect(Collectors.joining("\n"));
        Map<String, SubscriptionState> live = live(teamId);
        List<CancellationEdgeClient.Target> targets = targets(scope(req.product()), live);
        String customer = customer(teamId);
        String team = teamName(teamId);
        List<CancellationEdgeClient.Result> results;
        try {
            results =
                    edge.change(
                            "cancel",
                            customer,
                            team,
                            targets,
                            reason,
                            comment.isEmpty()
                                    ? null
                                    : comment.substring(0, Math.min(500, comment.length())),
                            actor.getEmail());
        } catch (CancellationException e) {
            if (e.status().is5xxServerError()) {
                reportFailedCancel(teamId, team, actor, req.product(), reason, e.code());
            }
            throw e;
        }
        for (CancellationEdgeClient.Result r : results) {
            if (r.changed()) {
                record(
                        teamId,
                        actor,
                        r.product(),
                        r.subscriptionId(),
                        "cancelled",
                        reason,
                        detail,
                        competitor,
                        offerShown,
                        r.endsAt());
            }
        }
        return merge(live, results);
    }

    public List<SubscriptionView> resume(long teamId, User actor, String product) {
        Map<String, SubscriptionState> live = live(teamId);
        List<CancellationEdgeClient.Result> results =
                edge.change(
                        "resume",
                        customer(teamId),
                        teamName(teamId),
                        targets(scope(product), live),
                        null,
                        null,
                        actor.getEmail());
        for (CancellationEdgeClient.Result r : results) {
            if (r.changed()) {
                record(
                        teamId,
                        actor,
                        r.product(),
                        r.subscriptionId(),
                        "resumed",
                        null,
                        null,
                        null,
                        null,
                        null);
            }
        }
        return merge(live, results);
    }

    public void contact(long teamId, User actor, ContactRequest req) {
        String product = req.product();
        if (!TEAM.equals(product) && !PROCESSOR.equals(product)) throw bad("product_invalid");
        String message = text(req.message(), 5000);
        if (message == null) throw bad("message_required");
        String replyTo = Optional.ofNullable(text(req.replyTo(), 254)).orElse(actor.getEmail());
        if (replyTo == null || !EMAIL.matcher(replyTo).matches()) throw bad("reply_to_invalid");
        CancelReason reason = CancelReason.fromCode(req.reason()).orElse(null);

        Integer recent =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM stirling_pdf.subscription_cancellation_event"
                                + " WHERE team_id = ? AND action = 'contacted' AND created_at > ?",
                        Integer.class,
                        teamId,
                        Timestamp.from(Instant.now().minus(Duration.ofDays(1))));
        if (recent != null && recent >= DAILY_CONTACT_LIMIT) {
            throw new CancellationException(HttpStatus.TOO_MANY_REQUESTS, "contact_limit");
        }

        Map<String, SubscriptionState> live = live(teamId);
        String team = teamName(teamId);
        String quoted =
                ChurnAlertPoster.escape(message)
                        .lines()
                        .map(line -> "> " + line)
                        .collect(Collectors.joining("\n"));
        String text =
                "*At risk:* "
                        + ChurnAlertPoster.escape(team)
                        + " (team "
                        + teamId
                        + ") wants to talk before cancelling their "
                        + productLabel(product)
                        + ".\nPlan: "
                        + plan(teamId, live)
                        + "\nReason: "
                        + (reason == null ? "Not given" : reason.label())
                        + "\nReply to: "
                        + ChurnAlertPoster.escape(replyTo)
                        + "\n"
                        + quoted;
        if (!alerts.post(text)) {
            throw new CancellationException(
                    HttpStatus.SERVICE_UNAVAILABLE, "message_not_delivered");
        }
        SubscriptionState sub = live.get(product);
        record(
                teamId,
                actor,
                product,
                sub == null ? null : sub.id(),
                "contacted",
                reason,
                message,
                null,
                null,
                null);
    }

    /**
     * The dialog tells the leader to try again or email us, and this makes sure the team sees it
     * too, so a cancel that never reached Stripe is still honoured.
     */
    private void reportFailedCancel(
            long teamId,
            String team,
            User actor,
            String product,
            CancelReason reason,
            String code) {
        alerts.post(
                "*Cancel failed:* "
                        + ChurnAlertPoster.escape(team)
                        + " (team "
                        + teamId
                        + ") tried to cancel their "
                        + productLabel(product)
                        + " and Stripe could not be reached ("
                        + code
                        + "). Cancel it by hand at the end of the period and let "
                        + ChurnAlertPoster.escape(actor.getEmail())
                        + " know.\nReason: "
                        + (reason == null ? "Not given" : reason.label()));
    }

    private static CancelReason reason(String code) {
        if (code == null || code.isBlank()) return null;
        return CancelReason.fromCode(code).orElseThrow(() -> bad("reason_invalid"));
    }

    private String teamName(long teamId) {
        return teamRepository.findById(teamId).map(Team::getName).orElse("Team " + teamId);
    }

    private static String productLabel(String product) {
        if (TEAM.equals(product)) return "Team plan";
        if (PROCESSOR.equals(product)) return "Processor";
        return "Team plan and Processor";
    }

    /** The team's live subscriptions by product, Team first. */
    private Map<String, SubscriptionState> live(long teamId) {
        Map<String, SubscriptionState> live = new LinkedHashMap<>();
        subscriptions.findTeamState(teamId).ifPresent(s -> live.put(TEAM, s));
        paygExtensions
                .findById(teamId)
                .map(PaygTeamExtensions::getPaygSubscriptionId)
                .flatMap(subscriptions::findState)
                .filter(s -> !live.containsKey(TEAM) || !live.get(TEAM).id().equals(s.id()))
                .ifPresent(s -> live.put(PROCESSOR, s));
        return live;
    }

    private String customer(long teamId) {
        return paygExtensions
                .findById(teamId)
                .map(PaygTeamExtensions::getStripeCustomerId)
                .filter(c -> !c.isBlank())
                .orElseThrow(
                        () -> new CancellationException(HttpStatus.NOT_FOUND, "no_subscription"));
    }

    private static List<String> scope(String product) {
        if (TEAM.equals(product) || PROCESSOR.equals(product)) return List.of(product);
        if ("both".equals(product)) return List.of(TEAM, PROCESSOR);
        throw bad("product_invalid");
    }

    private static List<CancellationEdgeClient.Target> targets(
            List<String> products, Map<String, SubscriptionState> live) {
        List<CancellationEdgeClient.Target> targets =
                products.stream()
                        .filter(live::containsKey)
                        .map(p -> new CancellationEdgeClient.Target(p, live.get(p).id()))
                        .toList();
        if (targets.isEmpty())
            throw new CancellationException(HttpStatus.NOT_FOUND, "no_subscription");
        return targets;
    }

    /** The mirror trails the edge function's answer, so its fresh state wins where it has one. */
    private static List<SubscriptionView> merge(
            Map<String, SubscriptionState> live, List<CancellationEdgeClient.Result> results) {
        List<SubscriptionView> views = new ArrayList<>();
        live.forEach(
                (product, state) ->
                        views.add(
                                results.stream()
                                        .filter(r -> r.product().equals(product))
                                        .findFirst()
                                        .map(
                                                r ->
                                                        new SubscriptionView(
                                                                product,
                                                                r.subscriptionId(),
                                                                r.status(),
                                                                r.cancelling(),
                                                                r.endsAt(),
                                                                r.periodEnd()))
                                        .orElseGet(() -> view(product, state))));
        return views;
    }

    private static SubscriptionView view(String product, SubscriptionState s) {
        return new SubscriptionView(
                product,
                s.id(),
                s.status(),
                s.cancelling(),
                s.endsAt() == null ? null : s.endsAt().toString(),
                s.periodEnd() == null ? null : s.periodEnd().toString());
    }

    private String plan(long teamId, Map<String, SubscriptionState> live) {
        List<String> parts = new ArrayList<>();
        if (live.containsKey(TEAM)) {
            Integer users =
                    teamExtensions
                            .findByTeamId(teamId)
                            .map(SaasTeamExtensions::licensedUsers)
                            .orElse(null);
            parts.add(users == null ? "Team plan" : "Team plan, " + users + " users");
        }
        if (live.containsKey(PROCESSOR)) parts.add("Processor");
        return parts.isEmpty() ? "No live subscription" : String.join("; ", parts);
    }

    private void record(
            long teamId,
            User actor,
            String product,
            String subscriptionId,
            String action,
            CancelReason reason,
            String detail,
            String competitor,
            String offerShown,
            String endsAt) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO stirling_pdf.subscription_cancellation_event"
                            + " (team_id, actor_user_id, product, subscription_id, action, reason,"
                            + " stripe_feedback, detail, competitor, offer_shown, ends_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    teamId,
                    actor.getId(),
                    product,
                    subscriptionId,
                    action,
                    reason == null ? null : reason.code(),
                    reason == null ? null : reason.stripeFeedback(),
                    detail,
                    competitor,
                    offerShown,
                    endsAt == null ? null : Timestamp.from(Instant.parse(endsAt)));
        } catch (DataAccessException e) {
            // Stripe or Slack already has the change; a missing feedback row must not undo it.
            log.warn("Cancellation event not recorded for team {}: {}", teamId, e.getMessage());
        }
    }

    private static String text(String raw, int max) {
        if (raw == null) return null;
        String value = raw.trim();
        return value.isEmpty() ? null : value.substring(0, Math.min(max, value.length()));
    }

    private static CancellationException bad(String code) {
        return new CancellationException(HttpStatus.BAD_REQUEST, code);
    }
}
