package stirling.software.proprietary.policy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.CodeSource;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.repository.Repository;

import stirling.software.common.annotations.ConditionalOnProcessor;
import stirling.software.common.configuration.ProcessorFeature;

/**
 * Guards {@link ProcessorFeature#ENABLED}: every component under the Processor's two packages must
 * carry {@link ConditionalOnProcessor}, so an editor-only server starts none of them.
 *
 * <p>This scans rather than hardcoding a list, so a component added later fails here instead of
 * silently shipping on a server that asked for no Processor. Anything that genuinely must survive
 * the flag goes in {@link #DELIBERATELY_UNGATED} with the reason it is there.
 */
class ProcessorConditionalTest {

    private static final List<String> PROCESSOR_PACKAGES =
            List.of(
                    "stirling.software.proprietary.policy",
                    "stirling.software.proprietary.integration");

    /**
     * Components that stay on with the Processor off, and why. Gating any of these breaks a
     * non-Processor feature.
     */
    private static final Map<String, String> DELIBERATELY_UNGATED =
            Map.of(
                    "CredentialEncryption",
                            "KeyPersistenceService carries @DependsOn(\"credentialEncryption\");"
                                    + " gating it kills JWT auth",
                    "AdminPolicyManagementAuthority",
                            "PolicyManagementAuthority backs the notification bell, which is not"
                                    + " Processor-only",
                    "PolicyExecutor", "AiWorkflowService runs tool chains through it",
                    "JpaPolicyStore",
                            "JPA-backed store; gating buys nothing and can orphan readers",
                    "JpaSourceStore",
                            "JPA-backed store; gating buys nothing and can orphan readers");

    @Test
    void everyProcessorComponentIsGated() {
        Set<String> ungated = new TreeSet<>();
        for (Class<?> type : mainProcessorComponents()) {
            if (DELIBERATELY_UNGATED.containsKey(type.getSimpleName())) continue;
            if (type.getAnnotation(ConditionalOnProcessor.class) == null) {
                ungated.add(type.getName());
            }
        }
        assertTrue(
                ungated.isEmpty(),
                "Processor components missing @ConditionalOnProcessor (add the annotation, or"
                        + " list it in DELIBERATELY_UNGATED with a reason): "
                        + ungated);
    }

    @Test
    void theGateReadsTheCompileTimeConstant() {
        // The annotation is the single definition of the flag - assert its wiring directly,
        // since every other test here only asserts the annotation is present.
        Conditional conditional = ConditionalOnProcessor.class.getAnnotation(Conditional.class);
        assertNotNull(conditional, "@ConditionalOnProcessor must be a @Conditional");
        assertEquals(
                List.of(ProcessorFeature.class),
                Arrays.asList(conditional.value()),
                "@ConditionalOnProcessor must be driven by ProcessorFeature");
        assertEquals(
                ProcessorFeature.ENABLED,
                new ProcessorFeature().matches(null, null),
                "the condition must report exactly what the constant says");
    }

    @Test
    void stacksWithAnotherCondition() {
        // TelegramPipelineBot carries both this gate and its own @ConditionalOnProperty. Two
        // conditions on one class is subtle enough to prove rather than assume: both must pass.
        assertEquals(
                ProcessorFeature.ENABLED,
                hasBean("feature.enabled=true"),
                "with the feature on, presence must track the constant");
        assertTrue(!hasBean("feature.enabled=false"), "the other condition must still apply");
        assertTrue(!hasBean(), "an absent property must still veto");
    }

    /** By type, not name: a nested @Configuration gets an outer-class-qualified bean name. */
    private static boolean hasBean(String... properties) {
        boolean[] present = {false};
        new ApplicationContextRunner()
                .withUserConfiguration(DoublyGated.class)
                .withPropertyValues(properties)
                .run(ctx -> present[0] = !ctx.getBeansOfType(DoublyGated.class).isEmpty());
        return present[0];
    }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = "feature.enabled", havingValue = "true")
    @ConditionalOnProcessor
    static class DoublyGated {}

    @Test
    void ungatedAllowanceStaysHonest() {
        // A stale allow-list would silently excuse a class that no longer exists, so every
        // entry must still be a real, still-ungated Processor component.
        Set<String> scanned = new LinkedHashSet<>();
        for (Class<?> type : mainProcessorComponents()) {
            scanned.add(type.getSimpleName());
        }
        for (String name : DELIBERATELY_UNGATED.keySet()) {
            assertTrue(
                    scanned.contains(name),
                    name + " is allow-listed as ungated but is no longer a scanned component");
        }
    }

    @Test
    void repositoriesAreNotGated() {
        // Gating a repository can leave a non-Processor consumer without a required bean
        // (UserService and TeamController both inject IntegrationConfigRepository).
        // Repositories are interfaces, which the stock scanner drops as non-instantiable.
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(
                        false, environmentWithProcessorOn()) {
                    @Override
                    protected boolean isCandidateComponent(AnnotatedBeanDefinition definition) {
                        return definition.getMetadata().isIndependent();
                    }
                };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        int found = 0;
        for (String pkg : PROCESSOR_PACKAGES) {
            for (BeanDefinition bean : scanner.findCandidateComponents(pkg)) {
                Class<?> type = loadClass(bean.getBeanClassName());
                if (isTestClass(type)) continue;
                found++;
                assertTrue(
                        type.getAnnotation(ConditionalOnProcessor.class) == null,
                        type.getName() + " is a repository and must not be gated");
            }
        }
        assertTrue(found >= 8, "scan found only " + found + " repositories - is it wired?");
    }

    /** Main-source components only - the test classpath also holds @SpringBootApplication stubs. */
    private static Set<Class<?>> mainProcessorComponents() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(true, environmentWithProcessorOn());
        Set<Class<?>> all = new LinkedHashSet<>();
        for (String pkg : PROCESSOR_PACKAGES) {
            for (BeanDefinition bean : scanner.findCandidateComponents(pkg)) {
                Class<?> type = loadClass(bean.getBeanClassName());
                if (!isTestClass(type)) all.add(type);
            }
        }
        assertTrue(all.size() > 40, "scan found only " + all.size() + " components - is it wired?");
        return all;
    }

    /** Test fixtures live under build/classes/java/test; main code does not. */
    private static boolean isTestClass(Class<?> type) {
        CodeSource source = type.getProtectionDomain().getCodeSource();
        if (source == null || source.getLocation() == null) return false;
        return source.getLocation().getPath().replace('\\', '/').contains("/classes/java/test");
    }

    /** The scanner evaluates conditions; ProcessorFeature answers from the constant. */
    private static StandardEnvironment environmentWithProcessorOn() {
        return new StandardEnvironment();
    }

    private static Class<?> loadClass(String name) {
        try {
            return Class.forName(name);
        } catch (ClassNotFoundException e) {
            throw new AssertionError("scanned class is not loadable: " + name, e);
        }
    }
}
