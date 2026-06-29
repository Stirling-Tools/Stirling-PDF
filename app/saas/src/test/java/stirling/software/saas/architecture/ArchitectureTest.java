package stirling.software.saas.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Cross-module direction rules:
 *
 * <ul>
 *   <li>{@code :proprietary} must not import {@code :saas}.
 *   <li>{@code :common} must not import {@code :proprietary} or {@code :saas}.
 * </ul>
 */
class ArchitectureTest {

    // Sibling modules arrive as JARs on the saas test classpath; scan them for the rules below.
    private static final JavaClasses scanned =
            new ClassFileImporter()
                    .importPackages(
                            "stirling.software.common",
                            "stirling.software.proprietary",
                            "stirling.software.saas");

    @Test
    void proprietaryDoesNotDependOnSaas() {
        ArchRule rule =
                noClasses()
                        .that()
                        .resideInAPackage("stirling.software.proprietary..")
                        .should()
                        .dependOnClassesThat()
                        .resideInAPackage("stirling.software.saas..");
        rule.check(scanned);
    }

    @Test
    void commonDoesNotDependOnProprietary() {
        ArchRule rule =
                noClasses()
                        .that()
                        .resideInAPackage("stirling.software.common..")
                        .should()
                        .dependOnClassesThat()
                        .resideInAPackage("stirling.software.proprietary..");
        rule.check(scanned);
    }

    @Test
    void commonDoesNotDependOnSaas() {
        ArchRule rule =
                noClasses()
                        .that()
                        .resideInAPackage("stirling.software.common..")
                        .should()
                        .dependOnClassesThat()
                        .resideInAPackage("stirling.software.saas..");
        rule.check(scanned);
    }
}
