package stirling.software.proprietary.automation;

import java.util.List;

import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;

/**
 * Meters one client-side automation run - the Automate tool or the local classification pass. Both
 * run their work in the browser (calling each tool's normal endpoint), so no automation sub-step
 * reaches the billing interceptors; this biller is how those runs are charged instead. SaaS and a
 * linked self-hosted instance each provide an implementation; other flavors have no bean and the
 * run is recorded for audit but not charged.
 */
public interface AutomationRunBiller {

    /** Charge one run over {@code inputs} (page/byte facts of the original input files). */
    void recordAutomationRun(List<FileSize> inputs);
}
