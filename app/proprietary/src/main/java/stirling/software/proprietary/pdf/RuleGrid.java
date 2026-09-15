package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

/**
 * A page's ruling lines reduced to a grid: rules merged into levels, levels grouped into the
 * components that each describe one table. Both steps are bounded.
 */
@Slf4j
final class RuleGrid {

    /** Rules within this distance are the same drawn line (double strokes, overdraw). */
    static final float LEVEL_TOLERANCE = 2.5f;

    /** Slack when testing whether a horizontal and a vertical rule touch. */
    private static final float TOUCH = 3f;

    /** Segments at one position further apart than this belong to different tables. */
    private static final float CONTIGUOUS_GAP = 8f;

    /** Crossing tests past which a page is an operator flood rather than a readable grid. */
    private static final long MAX_CROSSING_TESTS = 4_000_000L;

    /** Rule components past which the extra blocks cannot be real tables. */
    private static final int MAX_COMPONENTS = 256;

    private RuleGrid() {}

    /** A group of rules at the same position: {@code pos} with the union of their extents. */
    record Level(float pos, float lo, float hi) {}

    /** One connected component of crossing rules: the levels of each family it spans. */
    record Component(List<Level> h, List<Level> v) {}

    /**
     * Merges rules at the same position into levels, but only while contiguous, so two tables
     * ruling at the same x are not bridged into one region.
     */
    static List<Level> cluster(List<PageRules.Rule> rules) {
        List<PageRules.Rule> sorted = new ArrayList<>(rules);
        sorted.sort(
                Comparator.comparingDouble(PageRules.Rule::pos)
                        .thenComparingDouble(PageRules.Rule::lo));
        List<Level> out = new ArrayList<>();
        int i = 0;
        while (i < sorted.size()) {
            float pos = sorted.get(i).pos();
            int j = i;
            while (j < sorted.size() && sorted.get(j).pos() - pos <= LEVEL_TOLERANCE) {
                j++;
            }
            List<PageRules.Rule> same = new ArrayList<>(sorted.subList(i, j));
            same.sort(Comparator.comparingDouble(PageRules.Rule::lo));
            float lo = same.get(0).lo();
            float hi = same.get(0).hi();
            for (int k = 1; k < same.size(); k++) {
                if (same.get(k).lo() <= hi + CONTIGUOUS_GAP) {
                    hi = Math.max(hi, same.get(k).hi());
                } else {
                    out.add(new Level(pos, lo, hi));
                    lo = same.get(k).lo();
                    hi = same.get(k).hi();
                }
            }
            out.add(new Level(pos, lo, hi));
            i = j;
        }
        return out;
    }

    /**
     * Connected components of crossing rules, read from one union-find array: an id array per
     * component is O(components x levels) a rule flood can exhaust.
     */
    static List<Component> partition(List<Level> hLevels, List<Level> vLevels) {
        int n = hLevels.size() + vLevels.size();
        if ((long) hLevels.size() * vLevels.size() > MAX_CROSSING_TESTS) {
            log.debug(
                    "ruled-table partition skipped: {}x{} rule levels",
                    hLevels.size(),
                    vLevels.size());
            return List.of();
        }
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) {
            parent[i] = i;
        }
        for (int i = 0; i < hLevels.size(); i++) {
            Level h = hLevels.get(i);
            for (int j = 0; j < vLevels.size(); j++) {
                Level v = vLevels.get(j);
                boolean crosses =
                        v.pos() >= h.lo() - TOUCH
                                && v.pos() <= h.hi() + TOUCH
                                && h.pos() >= v.lo() - TOUCH
                                && h.pos() <= v.hi() + TOUCH;
                if (crosses) {
                    union(parent, i, hLevels.size() + j);
                }
            }
        }
        Map<Integer, Component> byRoot = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            int root = find(parent, i);
            Component c = byRoot.get(root);
            if (c == null) {
                // Past the cap the page is line art, not tables; keep the components already
                // found whole rather than truncating them mid-scan.
                if (byRoot.size() >= MAX_COMPONENTS) {
                    continue;
                }
                c = new Component(new ArrayList<>(), new ArrayList<>());
                byRoot.put(root, c);
            }
            if (i < hLevels.size()) {
                c.h().add(hLevels.get(i));
            } else {
                c.v().add(vLevels.get(i - hLevels.size()));
            }
        }
        return List.copyOf(byRoot.values());
    }

    private static int find(int[] parent, int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private static void union(int[] parent, int a, int b) {
        int ra = find(parent, a);
        int rb = find(parent, b);
        if (ra != rb) {
            parent[rb] = ra;
        }
    }

    /**
     * Visible for testing: partitioning depends only on rule geometry, so tests can drive it from
     * synthetic rules.
     */
    static int componentCount(List<PageRules.Rule> horizontal, List<PageRules.Rule> vertical) {
        return partition(cluster(horizontal), cluster(vertical)).size();
    }
}
