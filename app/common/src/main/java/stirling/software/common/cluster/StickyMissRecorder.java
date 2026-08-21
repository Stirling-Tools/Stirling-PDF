package stirling.software.common.cluster;

/** Records one increment per sticky-session miss (a 410 Gone for a job owned by another node). */
@FunctionalInterface
public interface StickyMissRecorder {
    void recordStickyMiss();
}
