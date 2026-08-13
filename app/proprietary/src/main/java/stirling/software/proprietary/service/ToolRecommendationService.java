package stirling.software.proprietary.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolRecommendationDismissalId;
import stirling.software.proprietary.repository.ToolRecommendationDismissalRepository;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;
import stirling.software.proprietary.service.ToolUsageSignalService.ToolChainSummary;

/**
 * Scores "what tool next". Transitions out of the current tool dominate, then the caller's own
 * usage, their team's, and the whole install's. Scoring is deliberately uncached - the costly
 * aggregates are cached inside {@link ToolUsageSignalService} and shared by everyone, so a
 * dismissal takes effect immediately without invalidating anyone else's data.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ToolRecommendationService {

    // Relative signal strengths; transition-from-current-tool dominates by design.
    static final double WEIGHT_TRANSITION_USER = 5.0;
    static final double WEIGHT_TRANSITION_TEAM = 3.0;
    static final double WEIGHT_TRANSITION_GLOBAL = 2.0;
    static final double WEIGHT_FREQUENCY_USER = 2.0;
    static final double WEIGHT_FREQUENCY_TEAM = 1.25;
    static final double WEIGHT_FREQUENCY_GLOBAL = 0.75;

    static final int DEFAULT_LIMIT = 6;
    static final int MAX_LIMIT = 20;

    /** A single tool is not a workflow; two is the shortest thing worth automating. */
    static final int MIN_WORKFLOW_TOOLS = 2;

    private final ToolUsageSignalService signals;
    private final ToolRecommendationDismissalRepository dismissalRepository;
    private final ApplicationProperties applicationProperties;

    public record ToolRecommendation(String toolKey, double score) {}

    /** Where an observed workflow was seen, narrowest scope first. */
    public enum WorkflowScope {
        USER,
        TEAM,
        GLOBAL
    }

    /**
     * A sequence of tools repeatedly applied to the same document - the raw material for turning a
     * habit into a pipeline.
     */
    public record ToolWorkflow(List<String> tools, long count, WorkflowScope scope) {}

    /**
     * The most repeated document workflows, the caller's own first and then topped up with their
     * team's and the install's. Chains already seen at a narrower scope are not repeated, so each
     * entry answers "who does this" as well as "what is it".
     */
    @Transactional(readOnly = true)
    public List<ToolWorkflow> getWorkflows(String principal, int minLength, int limit) {
        if (!ToolUsageTrackingService.isUsageDataAllowed(applicationProperties)
                || principal == null) {
            return List.of();
        }
        int capped = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        int minTools = Math.max(MIN_WORKFLOW_TOOLS, minLength);
        long cutoff =
                ToolUsageTrackingService.currentEpochDay()
                        - applicationProperties.getToolRecommendations().getWindowDays();

        List<ToolWorkflow> workflows = new ArrayList<>();
        Set<List<String>> seen = new HashSet<>();
        collect(
                workflows,
                seen,
                signals.userChains(principal, cutoff, minTools, capped),
                WorkflowScope.USER,
                capped);
        TeamScope team = signals.resolveTeamScope(principal);
        if (team.hasMembers() && workflows.size() < capped) {
            collect(
                    workflows,
                    seen,
                    signals.teamChains(team, cutoff, minTools, capped),
                    WorkflowScope.TEAM,
                    capped);
        }
        if (workflows.size() < capped) {
            collect(
                    workflows,
                    seen,
                    signals.globalChains(cutoff, minTools, capped),
                    WorkflowScope.GLOBAL,
                    capped);
        }
        return List.copyOf(workflows);
    }

    private static void collect(
            List<ToolWorkflow> into,
            Set<List<String>> seen,
            List<ToolChainSummary> chains,
            WorkflowScope scope,
            int limit) {
        for (ToolChainSummary chain : chains) {
            if (into.size() >= limit) {
                return;
            }
            if (seen.add(chain.tools())) {
                into.add(new ToolWorkflow(chain.tools(), chain.count(), scope));
            }
        }
    }

    @Transactional(readOnly = true)
    public List<ToolRecommendation> getRecommendations(
            String principal, String currentTool, int limit) {
        // Serving a ranking built from tracked history needs the same consent that recorded it.
        if (!ToolUsageTrackingService.isUsageDataAllowed(applicationProperties)
                || principal == null) {
            return List.of();
        }
        long today = ToolUsageTrackingService.currentEpochDay();
        long cutoff = today - applicationProperties.getToolRecommendations().getWindowDays();
        long recent = today - applicationProperties.getToolRecommendations().getRecentWindowDays();
        TeamScope team = signals.resolveTeamScope(principal);

        Map<String, Double> scores = new HashMap<>();
        if (currentTool != null) {
            merge(
                    scores,
                    signals.userTransitions(principal, currentTool, cutoff, recent),
                    WEIGHT_TRANSITION_USER);
            if (team.hasMembers()) {
                merge(
                        scores,
                        signals.teamTransitions(team, currentTool, cutoff, recent),
                        WEIGHT_TRANSITION_TEAM);
            }
            merge(
                    scores,
                    signals.globalTransitions(currentTool, cutoff, recent),
                    WEIGHT_TRANSITION_GLOBAL);
        }
        merge(scores, signals.userFrequency(principal, cutoff, recent), WEIGHT_FREQUENCY_USER);
        if (team.hasMembers()) {
            merge(scores, signals.teamFrequency(team, cutoff, recent), WEIGHT_FREQUENCY_TEAM);
        }
        merge(scores, signals.globalFrequency(cutoff, recent), WEIGHT_FREQUENCY_GLOBAL);

        Set<String> excluded = dismissedTools(principal, currentTool);
        if (currentTool != null) {
            excluded.add(currentTool);
        }
        return scores.entrySet().stream()
                .filter(e -> !excluded.contains(e.getKey()))
                .sorted(
                        Map.Entry.<String, Double>comparingByValue()
                                .reversed()
                                .thenComparing(Map.Entry.comparingByKey()))
                .limit(limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT))
                .map(e -> new ToolRecommendation(e.getKey(), round(e.getValue())))
                .toList();
    }

    /**
     * Adds one signal to the running scores, normalized against its own maximum so an install's
     * millions of runs cannot outweigh the handful that are personally the caller's.
     */
    private void merge(Map<String, Double> scores, Map<String, Double> signal, double weight) {
        double max = signal.values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
        if (max <= 0) {
            return;
        }
        signal.forEach((tool, value) -> scores.merge(tool, weight * (value / max), Double::sum));
    }

    private Set<String> dismissedTools(String principal, String currentTool) {
        Set<String> excluded = new HashSet<>();
        for (ToolRecommendationDismissal dismissal :
                dismissalRepository.findByPrincipal(principal)) {
            String context = dismissal.getContextTool();
            if (ToolRecommendationDismissal.ANY_CONTEXT.equals(context)
                    || context.equals(currentTool)) {
                excluded.add(dismissal.getDismissedTool());
            }
        }
        return excluded;
    }

    /**
     * Idempotent: the row is its own primary key. Two simultaneous dismissals (double click, or two
     * nodes) can still race to insert it, and losing that race already means the desired row
     * exists.
     */
    @Transactional
    public void dismiss(String principal, String contextTool, String dismissedTool) {
        try {
            dismissalRepository.save(
                    new ToolRecommendationDismissal(principal, contextTool, dismissedTool));
        } catch (DataIntegrityViolationException e) {
            log.debug("Dismissal {}/{} already stored", contextTool, dismissedTool);
        }
    }

    @Transactional
    public void undoDismiss(String principal, String contextTool, String dismissedTool) {
        dismissalRepository
                .findById(new ToolRecommendationDismissalId(principal, contextTool, dismissedTool))
                .ifPresent(dismissalRepository::delete);
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
