package stirling.software.proprietary.policy.trigger;

import java.util.List;

/**
 * Describes an available trigger for the admin UI: its {@code type} (matching {@code
 * TriggerConfig.type()}), whether it needs a compatible source, and which source types it works
 * with. Lets the UI list supported triggers and pair them with sources without hard-coding the set.
 */
public record TriggerInfo(String type, boolean requiresSource, List<String> supportedSourceTypes) {

    public static TriggerInfo of(PolicyTrigger trigger) {
        return new TriggerInfo(
                trigger.type(),
                trigger.requiresSource(),
                List.copyOf(trigger.supportedSourceTypes()));
    }
}
