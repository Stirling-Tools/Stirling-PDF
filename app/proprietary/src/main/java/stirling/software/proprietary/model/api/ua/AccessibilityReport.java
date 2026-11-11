package stirling.software.proprietary.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

/**
 * A document's accessibility standing. The machine/human split is load-bearing: veraPDF covers only
 * about half of the Matterhorn Protocol, so a clean automated pass is not "accessible".
 */
@Data
@Schema(description = "Accessibility standing of a document")
public class AccessibilityReport {

    @Schema(description = "Profile the document was checked against, e.g. PDF/UA-1")
    private String profile;

    @Schema(description = "Whether the document has a structure tree at all")
    private boolean tagged;

    @Schema(description = "Whether the document declares PDF/UA conformance in its metadata")
    private boolean declaresConformance;

    @Schema(description = "Whether every automated check passed")
    private boolean passesAutomatedChecks;

    @Schema(
            description =
                    "Why the validator could not run, or null when it did. When set, issues and"
                            + " checks describe that failure rather than the document, so no"
                            + " score or pass/fail can be drawn from them.")
    private String validationError;

    @Schema(description = "Automated checks that failed, grouped by rule")
    private List<AccessibilityIssue> issues = List.of();

    @Schema(description = "Things a person still has to verify; automation cannot decide these")
    private List<String> humanChecks = List.of();

    @Schema(description = "How many of the failing checks the converter can fix on its own")
    private int automaticallyFixable;

    @Schema(description = "How many need information from the user, such as alternative text")
    private int needsInput;

    @Schema(
            description =
                    "Figures that need an alternative description. Each carries the key to pass"
                            + " back in the conversion request's altTextByFigure map, so a caller"
                            + " can enumerate what is missing and then supply it.")
    private List<FigureDescriptor> figuresNeedingDescription = List.of();

    @Schema(description = "Document-level facts that drive most failures")
    private Summary summary = new Summary();

    @Schema(description = "How many automated checks ran and how many failed")
    private Checks checks = new Checks();

    @Data
    @Schema(
            description =
                    "Check counts from the validator. A check is one rule applied to one object, so"
                            + " the counts scale with document size; rules count each rule once.")
    public static class Checks {
        private int total;
        private int failed;
        private int passed;
        private int rulesInProfile;
        private int rulesFailed;
    }

    @Data
    @Schema(description = "Quick document-level facts")
    public static class Summary {
        private int pages;
        private boolean hasTitle;
        private boolean displaysDocTitle;
        private boolean hasLanguage;
        private boolean allFontsEmbedded;
        private int unembeddedFonts;
        private int figures;
        private boolean encrypted;
    }
}
