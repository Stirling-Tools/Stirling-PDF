package stirling.software.proprietary.policy.controller;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import io.swagger.v3.oas.annotations.media.Schema;

import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.util.SecretMasker;

/**
 * Keeps the passwords pipeline steps carry on the server. A step parameter is secret when the
 * tool's request model marks its field {@code @Schema(format = "password")}. Reads return {@link
 * SecretMasker#REDACTED} in its place; a write that sends the sentinel back has it restored from
 * the stored step, and one with nothing to restore from is rejected, since running it would apply
 * the sentinel as the password.
 */
@Component
class StepSecrets {

    private final ApplicationContext applicationContext;

    private volatile Map<String, Set<String>> secretsByOperation = Map.of();

    StepSecrets(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    static StepSecrets forSecrets(Map<String, Set<String>> secretsByOperation) {
        StepSecrets stepSecrets = new StepSecrets(null);
        stepSecrets.secretsByOperation = Map.copyOf(secretsByOperation);
        return stepSecrets;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void discoverSecretParameters() {
        Map<String, Set<String>> discovered = new HashMap<>();
        for (RequestMappingHandlerMapping mapping :
                applicationContext.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods()
                    .forEach((info, handler) -> register(discovered, info, handler));
        }
        secretsByOperation = Map.copyOf(discovered);
    }

    private static void register(
            Map<String, Set<String>> target, RequestMappingInfo info, HandlerMethod handler) {
        Set<String> secrets = secretFields(handler);
        if (secrets.isEmpty()) {
            return;
        }
        for (String path : info.getDirectPaths()) {
            target.computeIfAbsent(path, key -> new HashSet<>()).addAll(secrets);
        }
    }

    static Set<String> secretFields(HandlerMethod handler) {
        Set<String> names = new HashSet<>();
        for (MethodParameter parameter : handler.getMethodParameters()) {
            for (Class<?> type = parameter.getParameterType();
                    type != null && type != Object.class;
                    type = type.getSuperclass()) {
                for (Field field : type.getDeclaredFields()) {
                    Schema schema = field.getAnnotation(Schema.class);
                    if (schema != null && "password".equals(schema.format())) {
                        names.add(field.getName());
                    }
                }
            }
        }
        return names;
    }

    List<PipelineStep> mask(List<PipelineStep> steps) {
        return steps.stream().map(this::mask).toList();
    }

    private PipelineStep mask(PipelineStep step) {
        Set<String> secrets = secretsOf(step);
        if (secrets.isEmpty()) {
            return step;
        }
        Map<String, Object> parameters = new LinkedHashMap<>(step.parameters());
        parameters.replaceAll(
                (key, value) ->
                        secrets.contains(key) && isSet(value) ? SecretMasker.REDACTED : value);
        return new PipelineStep(step.operation(), parameters, step.fileParameters());
    }

    /**
     * Steps carry no id, so a step's stored counterpart is the stored step running the same tool at
     * the same occurrence (the second add-password matches the second add-password). That survives
     * steps added or removed around it, but not two steps of one tool swapping places.
     */
    List<PipelineStep> restore(List<PipelineStep> incoming, List<PipelineStep> stored) {
        Map<String, List<PipelineStep>> storedByOperation = new HashMap<>();
        for (PipelineStep step : stored) {
            if (!secretsOf(step).isEmpty()) {
                storedByOperation
                        .computeIfAbsent(step.operation(), key -> new ArrayList<>())
                        .add(step);
            }
        }
        Map<String, Integer> occurrences = new HashMap<>();
        List<PipelineStep> restored = new ArrayList<>(incoming.size());
        for (PipelineStep step : incoming) {
            if (secretsOf(step).isEmpty()) {
                restored.add(step);
                continue;
            }
            int occurrence = occurrences.merge(step.operation(), 1, Integer::sum) - 1;
            List<PipelineStep> counterparts =
                    storedByOperation.getOrDefault(step.operation(), List.of());
            restored.add(
                    occurrence < counterparts.size()
                            ? restore(step, counterparts.get(occurrence))
                            : step);
        }
        return restored;
    }

    private PipelineStep restore(PipelineStep step, PipelineStep stored) {
        Map<String, Object> storedSecrets = new HashMap<>(stored.parameters());
        storedSecrets.keySet().retainAll(secretsOf(step));
        return new PipelineStep(
                step.operation(),
                SecretMasker.restoreRedacted(step.parameters(), storedSecrets),
                step.fileParameters());
    }

    /** Rejects steps still carrying the sentinel for a password, which nothing could restore. */
    void requireUnmasked(List<PipelineStep> steps) {
        for (int i = 0; i < steps.size(); i++) {
            PipelineStep step = steps.get(i);
            for (String secret : secretsOf(step)) {
                if (SecretMasker.REDACTED.equals(step.parameters().get(secret))) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Step " + (i + 1) + ": enter the " + secret + " again");
                }
            }
        }
    }

    private Set<String> secretsOf(PipelineStep step) {
        if (step == null || step.operation() == null) {
            return Set.of();
        }
        return secretsByOperation.getOrDefault(step.operation(), Set.of());
    }

    private static boolean isSet(Object value) {
        return value != null && !value.toString().isBlank();
    }
}
