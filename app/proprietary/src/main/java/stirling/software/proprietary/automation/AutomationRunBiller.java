package stirling.software.proprietary.automation;

import java.util.List;

import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;

/**
 * Meters one client-side Automate run. The Automate tool runs its steps in the browser (calling
 * each tool's normal endpoint), so no automation sub-step reaches the billing interceptors - this
 * biller is how that run is charged instead. SaaS and a linked self-hosted instance each provide an
 * implementation; other flavors have no bean and the run is recorded for audit but not charged.
 *
 * <p>Charged on the input document set's doc-units, once per run, so an Automate workflow costs the
 * same as the equivalent server-side policy over the same inputs (see {@link
 * stirling.software.proprietary.billing.DocumentUnitCalculator}).
 */
public interface AutomationRunBiller {

    /**
     * Charge one Automate run over {@code inputs} (page/byte facts of the original input files).
     */
    void recordAutomationRun(List<FileSize> inputs);
}
