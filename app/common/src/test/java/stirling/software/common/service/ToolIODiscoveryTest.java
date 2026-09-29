package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.StaticWebApplicationContext;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOSpec;
import stirling.software.common.model.tool.ToolIOWhen;

/**
 * The registry reads real {@code @ToolIO} annotations off real handler mappings. Everything else
 * checks the logic against a hand-built map, which would still pass if discovery silently found
 * nothing.
 */
class ToolIODiscoveryTest {

    @RestController
    @RequestMapping("/api/v1/fixture")
    static class FixtureController {

        @PostMapping("/rotate")
        @ToolIO(produces = ToolFormat.PDF)
        public String rotate() {
            return "";
        }

        @PostMapping("/split")
        @ToolIO(produces = ToolFormat.PDF, arity = ToolArity.SIMO)
        public String split() {
            return "";
        }

        @PostMapping("/add-password")
        @ToolIO(
                produces = ToolFormat.PDF_ENCRYPTED,
                cases =
                        @ToolIOCase(
                                when = {
                                    @ToolIOWhen(param = "password", matches = ""),
                                    @ToolIOWhen(param = "ownerPassword", matches = "")
                                },
                                produces = ToolFormat.PDF,
                                arity = ToolArity.SISO))
        public String addPassword() {
            return "";
        }

        @PostMapping("/undeclared")
        public String undeclared() {
            return "";
        }
    }

    private static ToolIORegistry registry;

    @BeforeAll
    static void discover() {
        StaticWebApplicationContext context = new StaticWebApplicationContext();
        context.registerSingleton("fixtureController", FixtureController.class);
        RequestMappingHandlerMapping mapping = new RequestMappingHandlerMapping();
        mapping.setApplicationContext(context);
        mapping.afterPropertiesSet();
        context.getBeanFactory().registerSingleton("requestMappingHandlerMapping", mapping);

        registry = new ToolIORegistry(context);
        registry.discoverToolIO();
    }

    @Test
    void readsDeclarationsOffHandlerMethods() {
        ToolIOSpec rotate = registry.find("/api/v1/fixture/rotate").orElseThrow();
        assertEquals(ToolFormat.PDF, rotate.produces());
        assertEquals(ToolArity.SISO, rotate.arity());
        assertTrue(rotate.acceptsFormat(ToolFormat.PDF));
        assertFalse(rotate.acceptsFormat(ToolFormat.PDF_ENCRYPTED));
    }

    @Test
    void skipsMethodsWithNoDeclaration() {
        assertTrue(registry.find("/api/v1/fixture/undeclared").isEmpty());
    }

    @Test
    void carriesArityThroughToTheUnpackDecision() {
        assertTrue(registry.shouldUnpackZipResponse("/api/v1/fixture/split"));
        assertFalse(registry.shouldUnpackZipResponse("/api/v1/fixture/rotate"));
    }

    @Test
    void carriesCasesThroughToOutputResolution() {
        ToolIOSpec spec = registry.find("/api/v1/fixture/add-password").orElseThrow();
        assertEquals(
                ToolFormat.PDF_ENCRYPTED,
                spec.resolveOutput(Map.of("password", "x", "ownerPassword", "")).format());
        assertEquals(
                ToolFormat.PDF,
                spec.resolveOutput(Map.of("password", "", "ownerPassword", "")).format());
    }

    @Test
    void exposesInputExtensionsForRunTimeFileChecks() {
        assertEquals(List.of("pdf"), registry.getExtensionTypes(false, "/api/v1/fixture/rotate"));
    }
}
