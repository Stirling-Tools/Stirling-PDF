package stirling.software.saas.payg.model;

/** Where a tool invocation originated. Drives per-source step limits on {@code pricing_policy}. */
public enum JobSource {
    WEB,
    API,
    PIPELINE,
    DESKTOP
}
