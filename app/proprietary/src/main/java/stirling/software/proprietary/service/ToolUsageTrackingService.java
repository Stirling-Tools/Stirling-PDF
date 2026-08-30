package stirling.software.proprietary.service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;

/**
 * Records completed tool runs into daily rollup rows. One completion is one increment of one usage
 * row plus one row per distinct input document chain, which is negligible next to the PDF work that
 * produced it.
 *
 * <p>The caller supplies the tools already applied to each input <em>document</em>, so a transition
 * means "this is what came next for this file", not "this is what the user happened to click
 * before". The full chains are kept as well, because a workflow worth automating is a sequence, and
 * pairs cannot tell {@code A->B->C} on one document from {@code A->B} and {@code B->C} on two.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ToolUsageTrackingService {

    private static final Pattern TOOL_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    /** Bounds the work one completion can trigger when many documents go in at once. */
    static final int MAX_CHAINS_PER_EVENT = 5;

    private final ToolUsageStatRepository usageRepository;
    private final ToolChainStatRepository chainRepository;
    private final ApplicationProperties applicationProperties;

    public static boolean isValidToolKey(String toolKey) {
        return toolKey != null && TOOL_KEY_PATTERN.matcher(toolKey).matches();
    }

    /** Per-principal usage is profiling, so admin analytics consent gates it too. */
    static boolean isUsageDataAllowed(ApplicationProperties properties) {
        return properties.getToolRecommendations().isEnabled()
                && properties.getSystem().isAnalyticsEnabled();
    }

    /** Lets the controller answer 501 so the browser stops posting on a declining install. */
    public boolean isRecordingEnabled() {
        return isUsageDataAllowed(applicationProperties);
    }

    /**
     * Counts one completed run of {@code toolKey} against each input document's history.
     *
     * @param priorChains the tools already applied to each input document, oldest step first and
     *     excluding this run. One entry per distinct input document; empty for a fresh upload.
     */
    public void recordUsage(String principal, String toolKey, List<List<String>> priorChains) {
        if (!isUsageDataAllowed(applicationProperties)
                || principal == null
                || !isValidToolKey(toolKey)) {
            return;
        }
        List<List<String>> chains = sanitiseChains(priorChains, toolKey);
        long epochDay = currentEpochDay();
        try {
            recordTransition(principal, toolKey, dominantPredecessor(chains), epochDay);
            for (List<String> prior : chains) {
                recordChain(principal, append(prior, toolKey), epochDay);
            }
        } catch (Exception e) {
            log.warn("Failed to record usage of {} for {}: {}", toolKey, principal, e.getMessage());
        }
    }

    /**
     * Normalises what the browser sent: drops anything that is not a tool key, keeps only the
     * trailing {@link ToolChainStat#MAX_CHAIN_TOOLS} steps (a chain that outgrows the key is still
     * a real subsequence), removes the run's own key from the tail so a re-run does not self-loop,
     * and de-duplicates so ten identically-processed inputs count as one workflow, not ten.
     */
    private static List<List<String>> sanitiseChains(
            List<List<String>> priorChains, String toolKey) {
        if (priorChains == null || priorChains.isEmpty()) {
            return List.of(List.of());
        }
        Set<List<String>> distinct = new LinkedHashSet<>();
        for (List<String> chain : priorChains) {
            distinct.add(sanitiseChain(chain, toolKey));
            if (distinct.size() >= MAX_CHAINS_PER_EVENT) {
                break;
            }
        }
        return List.copyOf(distinct);
    }

    private static List<String> sanitiseChain(List<String> chain, String toolKey) {
        if (chain == null) {
            return List.of();
        }
        List<String> valid =
                chain.stream().filter(ToolUsageTrackingService::isValidToolKey).toList();
        // Re-running the same tool is a correction, not a step: "compress, compress" is "compress".
        int end = valid.size();
        while (end > 0 && toolKey.equals(valid.get(end - 1))) {
            end--;
        }
        valid = valid.subList(0, end);
        // The chain grows by one when this run is appended, so leave room for it.
        int maxPrior = ToolChainStat.MAX_CHAIN_TOOLS - 1;
        if (valid.size() > maxPrior) {
            valid = valid.subList(valid.size() - maxPrior, valid.size());
        }
        return List.copyOf(valid);
    }

    /**
     * The predecessor credited in the pairwise table. Multi-input tools (merge) see several
     * documents at once; the longest chain is the most-processed document and so the best
     * representative of the workflow, with the key order breaking ties deterministically.
     */
    private static String dominantPredecessor(List<List<String>> chains) {
        // Reversed on the key so the tie-break picks the lowest one, since this takes the maximum.
        Comparator<List<String>> byLengthThenKey =
                Comparator.<List<String>>comparingInt(List::size)
                        .thenComparing(ToolChainStat::toChainKey, Comparator.reverseOrder());
        return chains.stream()
                .filter(chain -> !chain.isEmpty())
                .max(byLengthThenKey)
                .map(chain -> chain.get(chain.size() - 1))
                .orElse(ToolUsageStat.NO_PREVIOUS_TOOL);
    }

    private static List<String> append(List<String> prior, String toolKey) {
        List<String> full = new ArrayList<>(prior);
        full.add(toolKey);
        return full;
    }

    private void recordTransition(
            String principal, String toolKey, String fromTool, long epochDay) {
        if (usageRepository.incrementCount(principal, fromTool, toolKey, epochDay, 1) == 0) {
            try {
                usageRepository.insertCount(principal, fromTool, toolKey, epochDay, 1);
            } catch (DataIntegrityViolationException e) {
                // Another request inserted the row first; add to theirs instead of clobbering it.
                usageRepository.incrementCount(principal, fromTool, toolKey, epochDay, 1);
            }
        }
    }

    /** A one-tool chain is just a frequency count, which the usage table already carries. */
    private void recordChain(String principal, List<String> chain, long epochDay) {
        if (chain.size() < 2) {
            return;
        }
        String chainKey = ToolChainStat.toChainKey(chain);
        if (chainKey.length() > ToolChainStat.MAX_CHAIN_KEY_LENGTH) {
            log.debug("Skipping oversized tool chain of {} steps", chain.size());
            return;
        }
        if (chainRepository.incrementCount(principal, chainKey, epochDay, 1) == 0) {
            try {
                chainRepository.insertCount(principal, chainKey, epochDay, chain.size(), 1);
            } catch (DataIntegrityViolationException e) {
                chainRepository.incrementCount(principal, chainKey, epochDay, 1);
            }
        }
    }

    /** Daily retention sweep; both tables hold one row per principal, key and day. */
    @Scheduled(cron = "0 15 3 * * *")
    public void cleanupOldStats() {
        int retentionDays = applicationProperties.getToolRecommendations().getRetentionDays();
        if (retentionDays <= 0) {
            return;
        }
        long cutoff = currentEpochDay() - retentionDays;
        try {
            int deleted =
                    usageRepository.deleteOlderThan(cutoff)
                            + chainRepository.deleteOlderThan(cutoff);
            if (deleted > 0) {
                log.info("Tool usage retention sweep removed {} rows", deleted);
            }
        } catch (Exception e) {
            log.error("Tool usage retention sweep failed", e);
        }
    }

    static long currentEpochDay() {
        return LocalDate.now(ZoneOffset.UTC).toEpochDay();
    }
}
