package stirling.software.saas.store;

import java.util.List;
import java.util.Map;

/**
 * What a listing carries and what an installer receives: the tool chain and its settings, nothing
 * about the publisher's environment. Built only by {@link StoreManifestSanitizer}. {@code
 * manifestSchemaVersion} is the format version of this JSON so old copies still import after the
 * app changes; it is not a listing version, listings have none.
 */
public record StoreManifest(
        int manifestSchemaVersion,
        String name,
        String description,
        String category,
        String icon,
        List<Step> steps,
        List<RequiredOnInstall> requiredOnInstall,
        String suggestedTrigger,
        String minimumStirlingVersion) {

    public static final int SCHEMA_VERSION = 1;

    /** One tool invocation: a Stirling endpoint path and its scalar settings. No file bindings. */
    public record Step(String operation, Map<String, Object> parameters) {}

    /**
     * Something the installer must supply before the copy can run. {@code kind} is {@code source},
     * {@code destination} or {@code parameter}; the last names the step and field that was cleared
     * and why ({@code secret}).
     */
    public record RequiredOnInstall(String kind, Integer stepIndex, String field, String reason) {

        public static RequiredOnInstall source() {
            return new RequiredOnInstall("source", null, null, null);
        }

        public static RequiredOnInstall destination() {
            return new RequiredOnInstall("destination", null, null, null);
        }

        public static RequiredOnInstall parameter(int stepIndex, String field, String reason) {
            return new RequiredOnInstall("parameter", stepIndex, field, reason);
        }
    }
}
