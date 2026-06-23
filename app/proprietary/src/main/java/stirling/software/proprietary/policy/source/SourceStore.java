package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Optional;

/** Stores {@link Source} definitions (persisted, reusable input connections). */
public interface SourceStore {

    /** Create or update; a blank/absent id is assigned. Returns the stored source. */
    Source save(Source source);

    Optional<Source> get(String id);

    List<Source> all();

    /** Returns whether the source existed. */
    boolean delete(String id);
}
