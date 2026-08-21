package stirling.software.saas.payg.model;

/** Coarse capability flags evaluated by the entitlement guard before letting a request proceed. */
public enum FeatureGate {
    OFFSITE_PROCESSING,
    AUTOMATION,
    AI_SUPPORT,
    CLIENT_SIDE
}
