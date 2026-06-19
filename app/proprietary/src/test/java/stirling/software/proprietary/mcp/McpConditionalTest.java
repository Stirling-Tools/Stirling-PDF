package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;

import org.jboss.jandex.AnnotationInstance;
import org.jboss.jandex.ClassInfo;
import org.jboss.jandex.DotName;
import org.jboss.jandex.Index;
import org.jboss.jandex.Indexer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingDownloadTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.mcp.tools.StirlingUploadTool;

/**
 * Verifies MCP beans are gated behind the runtime property {@code mcp.enabled=true}.
 *
 * <p>MIGRATION (Spring -&gt; Quarkus): gating moved from Spring {@code @ConditionalOnProperty} to
 * Quarkus {@code @io.quarkus.arc.lookup.LookupIfProperty}, and the category tools are now
 * individually-gated CDI beans (they were previously plain {@code @Component}s wired only into the
 * gated controller). The annotation is read from bytecode via Jandex rather than reflection because
 * Arc lookup annotations are not guaranteed to be runtime-retained.
 *
 * <p>Two assertions from the Spring-era test were intentionally not carried over: that {@code
 * McpSecurityConfig} itself carries the gate, and that no MCP bean is profile-restricted. The MCP
 * security wiring is dormant pending a Quarkus re-implementation (see the {@code McpSecurityConfig}
 * "Migration required" TODOs), and some MCP beans now legitimately use {@code @IfBuildProfile}.
 * This test guards the gating that exists today.
 */
class McpConditionalTest {

    private static final DotName LOOKUP_IF_PROPERTY =
            DotName.createSimple("io.quarkus.arc.lookup.LookupIfProperty");

    private static final Class<?>[] GATED_BEANS = {
        McpServerController.class,
        DescribeOperationTool.class,
        StirlingConvertTool.class,
        StirlingPagesTool.class,
        StirlingMiscTool.class,
        StirlingSecurityTool.class,
        StirlingAiTool.class,
        StirlingUploadTool.class,
        StirlingDownloadTool.class
    };

    private static Index index;

    @BeforeAll
    static void indexBeans() throws IOException {
        Indexer indexer = new Indexer();
        for (Class<?> bean : GATED_BEANS) {
            String resource = bean.getName().replace('.', '/') + ".class";
            try (InputStream in = bean.getClassLoader().getResourceAsStream(resource)) {
                assertNotNull(in, "class bytes not found for " + bean.getName());
                indexer.index(in);
            }
        }
        index = indexer.complete();
    }

    @Test
    void serverController_isGatedByMcpEnabled() {
        assertGatedByMcpEnabled(McpServerController.class);
    }

    @Test
    void categoryTools_areGatedAndImplementMcpTool() {
        for (Class<?> bean : GATED_BEANS) {
            if (bean.equals(McpServerController.class)) {
                continue;
            }
            assertTrue(
                    McpTool.class.isAssignableFrom(bean),
                    bean.getSimpleName() + " must implement McpTool");
            assertGatedByMcpEnabled(bean);
        }
    }

    private static void assertGatedByMcpEnabled(Class<?> beanClass) {
        ClassInfo info = index.getClassByName(DotName.createSimple(beanClass.getName()));
        assertNotNull(info, beanClass.getSimpleName() + " was not indexed");
        AnnotationInstance gate = info.declaredAnnotation(LOOKUP_IF_PROPERTY);
        assertNotNull(
                gate,
                beanClass.getSimpleName()
                        + " must be gated with @LookupIfProperty(name=\"mcp.enabled\")");
        assertEquals(
                "mcp.enabled",
                gate.value("name").asString(),
                beanClass.getSimpleName() + " must gate on mcp.enabled");
        assertEquals(
                "true",
                gate.value("stringValue").asString(),
                beanClass.getSimpleName() + " must require mcp.enabled=true");
    }
}
