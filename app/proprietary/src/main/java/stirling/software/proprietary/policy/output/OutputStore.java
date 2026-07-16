package stirling.software.proprietary.policy.output;

import java.util.List;
import java.util.Optional;

/** Stores {@link Output} definitions (persisted, reusable output destinations). */
public interface OutputStore {

    /** Create or update; a blank/absent id is assigned. Returns the stored output. */
    Output save(Output output);

    Optional<Output> get(String id);

    List<Output> all();

    /** Outputs owned by the given team, loaded scoped rather than fetched globally. */
    List<Output> findByTeam(Long teamId);

    /** Returns whether the output existed. */
    boolean delete(String id);
}
