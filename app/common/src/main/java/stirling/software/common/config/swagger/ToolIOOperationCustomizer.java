package stirling.software.common.config.swagger;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.microprofile.openapi.OASFilter;
import org.eclipse.microprofile.openapi.models.OpenAPI;
import org.eclipse.microprofile.openapi.models.Operation;
import org.eclipse.microprofile.openapi.models.PathItem;

import io.quarkus.smallrye.openapi.OpenApiFilter;

import jakarta.enterprise.inject.spi.CDI;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOSpec;
import stirling.software.common.service.ToolIORegistry;

/**
 * Publishes each {@link ToolIO} into the spec as {@code x-stirling-io}, which is how the frontend
 * and the AI engine get it.
 *
 * <p>Also appends the {@code Input:/Output:/Type:} line the docs used to carry by hand, so the
 * published text is unchanged without anyone maintaining it.
 *
 * <p>MIGRATION (Spring -> Quarkus): this was a springdoc {@code GlobalOperationCustomizer} + {@code
 * GlobalOpenApiCustomizer}, which received the {@code HandlerMethod} for each operation and could
 * read {@code @ToolIO} straight off it. A MicroProfile {@link OASFilter} sees only the document, so
 * the declarations are looked up by path through {@link ToolIORegistry}. That registry is only
 * populated once the container is up, hence {@code RUNTIME_STARTUP} - the schema exported at build
 * time by {@code quarkus.smallrye-openapi.store-schema-directory} therefore carries no {@code
 * x-stirling-io}.
 */
@OpenApiFilter(stages = OpenApiFilter.RunStage.RUNTIME_STARTUP)
public class ToolIOOperationCustomizer implements OASFilter {

    public static final String EXTENSION_NAME = "x-stirling-io";
    public static final String VOCABULARY_EXTENSION_NAME = "x-stirling-io-vocabulary";

    @Override
    public void filterOpenAPI(OpenAPI openApi) {
        addVocabulary(openApi);
        ToolIORegistry registry = registry();
        if (registry == null || openApi.getPaths() == null) {
            return;
        }
        Map<String, PathItem> pathItems = openApi.getPaths().getPathItems();
        if (pathItems == null) {
            return;
        }
        pathItems.forEach((path, item) -> registry.find(path).ifPresent(spec -> apply(item, spec)));
    }

    // Published separately from the declarations: generators need the full vocabulary for their
    // enums, and deriving it from what is present would shrink it when an endpoint is disabled.
    private static void addVocabulary(OpenAPI openApi) {
        Map<String, Object> vocabulary = new LinkedHashMap<>();
        vocabulary.put("formats", names(ToolFormat.values()));
        vocabulary.put("arities", names(ToolArity.values()));
        openApi.addExtension(VOCABULARY_EXTENSION_NAME, vocabulary);
    }

    private static ToolIORegistry registry() {
        // OASFilter instances are created by smallrye-openapi, not by CDI, so resolve the
        // registry programmatically rather than via constructor injection.
        try {
            return CDI.current().select(ToolIORegistry.class).get();
        } catch (RuntimeException e) {
            // No container (build-time schema export): publish the vocabulary only.
            return null;
        }
    }

    private static void apply(PathItem item, ToolIOSpec spec) {
        if (item.getOperations() == null) {
            return;
        }
        for (Operation operation : item.getOperations().values()) {
            operation.addExtension(EXTENSION_NAME, toExtension(spec));
            operation.setDescription(appendSummaryLine(operation.getDescription(), spec));
        }
    }

    private static Map<String, Object> toExtension(ToolIOSpec spec) {
        Map<String, Object> extension = new LinkedHashMap<>();
        extension.put("accepts", names(spec.accepts().toArray(ToolFormat[]::new)));
        extension.put("produces", spec.produces().name());
        extension.put("arity", spec.arity().name());
        if (!spec.cases().isEmpty()) {
            extension.put("cases", cases(spec));
        }
        return extension;
    }

    private static List<Map<String, Object>> cases(ToolIOSpec spec) {
        return spec.cases().stream().map(ToolIOOperationCustomizer::toCase).toList();
    }

    private static Map<String, Object> toCase(ToolIOSpec.Case rule) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put(
                "when", rule.when().stream().map(ToolIOOperationCustomizer::toCondition).toList());
        entry.put("produces", rule.produces().name());
        entry.put("arity", rule.arity().name());
        return entry;
    }

    private static Map<String, Object> toCondition(ToolIOSpec.When condition) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("param", condition.param());
        entry.put("matches", List.copyOf(condition.matches()));
        return entry;
    }

    private static List<String> names(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).toList();
    }

    private static String appendSummaryLine(String description, ToolIOSpec spec) {
        String summary =
                "Input:"
                        + String.join("/", names(spec.accepts().toArray(ToolFormat[]::new)))
                        + " Output:"
                        + spec.produces().name()
                        + " Type:"
                        + spec.arity().name();
        if (description == null || description.isBlank()) {
            return summary;
        }
        String trimmed = description.trim();
        // The filter may see an already-published document; appending twice would double the line.
        return trimmed.endsWith(summary) ? trimmed : trimmed + " " + summary;
    }
}
