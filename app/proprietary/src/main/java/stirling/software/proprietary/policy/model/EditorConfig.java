package stirling.software.proprietary.policy.model;

/**
 * How a policy participates in the editor: it fires in the browser as each file passes through,
 * rather than being swept from a stored {@code Source} on a trigger.
 *
 * <p>An object rather than a bare flag so the moment it fires ({@code runOn}) travels with the
 * decision, and so later editor-only settings have somewhere to live.
 *
 * @param allowed whether the editor may run this policy at all
 * @param runOn which moment it fires on: {@code "upload"} or {@code "export"}
 */
public record EditorConfig(boolean allowed, String runOn) {

    public static final String UPLOAD = "upload";
    public static final String EXPORT = "export";

    public EditorConfig {
        runOn = EXPORT.equals(runOn) ? EXPORT : UPLOAD;
    }

    /** Not an editor policy: swept server-side, or run only on demand. */
    public static EditorConfig disabled() {
        return new EditorConfig(false, UPLOAD);
    }

    public static EditorConfig onUpload() {
        return new EditorConfig(true, UPLOAD);
    }

    public static EditorConfig onExport() {
        return new EditorConfig(true, EXPORT);
    }
}
