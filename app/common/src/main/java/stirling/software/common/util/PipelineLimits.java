package stirling.software.common.util;

import stirling.software.common.model.ApplicationProperties;

/**
 * The per-run limits {@code policies.maxSteps} and {@code policies.maxFilesPerStep}, shared by the
 * pipeline API, watched folders and policy runs so all of them refuse the same runs the same way. A
 * limit of 0 or less is unlimited.
 */
public final class PipelineLimits {

    private PipelineLimits() {}

    /** A run broke one of the limits; the message names the setting that allows more. */
    public static class LimitExceededException extends IllegalArgumentException {
        public LimitExceededException(String message) {
            super(message);
        }
    }

    public static boolean exceedsStepLimit(int steps, ApplicationProperties.Policies policies) {
        return policies.getMaxSteps() > 0 && steps > policies.getMaxSteps();
    }

    public static String stepLimitMessage(ApplicationProperties.Policies policies) {
        return "A pipeline may have at most "
                + policies.getMaxSteps()
                + " steps; raise policies.maxSteps to allow more";
    }

    public static void requireWithinStepLimit(int steps, ApplicationProperties.Policies policies) {
        if (exceedsStepLimit(steps, policies)) {
            throw new LimitExceededException(stepLimitMessage(policies));
        }
    }

    public static void requireWithinFileLimit(
            String operation, int files, ApplicationProperties.Policies policies) {
        int maxFilesPerStep = policies.getMaxFilesPerStep();
        if (maxFilesPerStep > 0 && files > maxFilesPerStep) {
            throw new LimitExceededException(
                    "Step "
                            + operation
                            + " produced more than "
                            + maxFilesPerStep
                            + " files; raise policies.maxFilesPerStep to allow more");
        }
    }
}
