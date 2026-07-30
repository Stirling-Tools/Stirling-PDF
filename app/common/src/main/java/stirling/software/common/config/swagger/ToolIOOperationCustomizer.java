package stirling.software.common.config.swagger;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springdoc.core.customizers.GlobalOperationCustomizer;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;

/**
 * Publishes each endpoint's {@link ToolIO} declaration into the OpenAPI spec as the {@code
 * x-stirling-io} extension, which is how the frontend and the AI engine get it: both generate their
 * copies from the same spec that already gives them request models, so all three stay in step
 * without anyone maintaining a second list.
 *
 * <p>A human-readable {@code Input:/Output:/Type:} line is also appended to the description. That
 * string used to be hand-written and parsed back out; deriving it here keeps the published docs
 * looking the same without anyone having to keep the two in agreement.
 */
@Component
public class ToolIOOperationCustomizer
        implements GlobalOperationCustomizer, GlobalOpenApiCustomizer {

    public static final String EXTENSION_NAME = "x-stirling-io";
    public static final String VOCABULARY_EXTENSION_NAME = "x-stirling-io-vocabulary";

    /**
     * Publish the full set of formats and arities alongside the declarations. Generators need the
     * complete vocabulary to emit their own enums, and deriving it from the declarations present
     * would silently shrink it whenever an endpoint is disabled in a build.
     */
    @Override
    public void customise(OpenAPI openApi) {
        Map<String, Object> vocabulary = new LinkedHashMap<>();
        vocabulary.put("formats", names(ToolFormat.values()));
        vocabulary.put("arities", names(ToolArity.values()));
        openApi.addExtension(VOCABULARY_EXTENSION_NAME, vocabulary);
    }

    @Override
    public Operation customize(Operation operation, HandlerMethod handlerMethod) {
        ToolIO declaration = handlerMethod.getMethodAnnotation(ToolIO.class);
        if (declaration == null) {
            return operation;
        }
        operation.addExtension(EXTENSION_NAME, toExtension(declaration));
        operation.setDescription(appendSummaryLine(operation.getDescription(), declaration));
        return operation;
    }

    private static Map<String, Object> toExtension(ToolIO declaration) {
        Map<String, Object> extension = new LinkedHashMap<>();
        extension.put("accepts", names(declaration.accepts()));
        extension.put("produces", declaration.produces().name());
        extension.put("arity", declaration.arity().name());
        if (declaration.cases().length > 0) {
            extension.put("cases", cases(declaration));
        }
        return extension;
    }

    private static List<Map<String, Object>> cases(ToolIO declaration) {
        return Arrays.stream(declaration.cases()).map(ToolIOOperationCustomizer::toCase).toList();
    }

    private static Map<String, Object> toCase(ToolIOCase rule) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put(
                "when",
                Arrays.stream(rule.when()).map(ToolIOOperationCustomizer::toCondition).toList());
        entry.put("produces", rule.produces().name());
        entry.put("arity", rule.arity().name());
        return entry;
    }

    private static Map<String, Object> toCondition(ToolIOWhen condition) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("param", condition.param());
        entry.put("matches", List.of(condition.matches()));
        return entry;
    }

    private static List<String> names(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).toList();
    }

    private static String appendSummaryLine(String description, ToolIO declaration) {
        String summary =
                "Input:"
                        + String.join("/", names(declaration.accepts()))
                        + " Output:"
                        + declaration.produces().name()
                        + " Type:"
                        + declaration.arity().name();
        return description == null || description.isBlank()
                ? summary
                : description.trim() + " " + summary;
    }
}
