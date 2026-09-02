package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

/**
 * Resolves a {@link FailureActionId} to the bean that implements it. The startup check is the
 * point: because kinds declare action ids as data, one could name an action nobody implements,
 * which would otherwise show up as a button that 400s rather than as a failed boot.
 *
 * <p>Only {@link FailureActionId.Execution#SERVER} ids belong here: a bean for a client action is
 * refused, because dispatch could never reach it.
 */
@Slf4j
@ApplicationScoped
public class FailureActionRegistry {

    private final Map<FailureActionId, FailureAction> byId = new EnumMap<>(FailureActionId.class);

    public FailureActionRegistry(List<FailureAction> actions) {
        for (FailureAction action : actions) {
            if (!action.id().runsOnServer()) {
                throw new IllegalStateException(
                        "Action "
                                + action.id()
                                + " is run by the client, so "
                                + action.getClass().getName()
                                + " could never be dispatched");
            }
            FailureAction clash = byId.put(action.id(), action);
            if (clash != null) {
                throw new IllegalStateException(
                        "Two handlers registered for action "
                                + action.id()
                                + ": "
                                + clash.getClass().getName()
                                + " and "
                                + action.getClass().getName());
            }
        }
    }

    /** Names every gap rather than the first, so one boot tells you everything that is missing. */
    @PostConstruct
    void verifyEveryDeclaredActionHasAHandler() {
        List<String> gaps =
                Arrays.stream(FailureKind.values())
                        .flatMap(
                                kind ->
                                        kind.getActions().stream()
                                                .filter(FailureActionId::runsOnServer)
                                                .filter(action -> !byId.containsKey(action))
                                                .map(action -> kind.getId() + " -> " + action))
                        .toList();
        if (!gaps.isEmpty()) {
            throw new IllegalStateException(
                    "Failure kinds declare actions with no registered handler: " + gaps);
        }
        log.debug(
                "Failure action registry initialised with {} handler(s) for {} kind(s)",
                byId.size(),
                FailureKind.values().length);
    }

    public Optional<FailureAction> find(FailureActionId id) {
        return Optional.ofNullable(byId.get(id));
    }
}
