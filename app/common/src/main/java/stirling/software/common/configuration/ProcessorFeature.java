package stirling.software.common.configuration;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * The single source of truth for whether this build ships the Processor - policies, document
 * sources, classification, pipelines, triggers, integrations and the {@code /processor} portal.
 *
 * <p>Deliberately a constant rather than a property: an editor-only server is a decision made in
 * source and shipped, not something a deployment can flip. Flip {@link #ENABLED} to {@code false}
 * and rebuild to produce one.
 *
 * <p>Doubles as the Spring {@link Condition} behind {@code @ConditionalOnProcessor}, so the beans
 * and the plain-Java readers cannot disagree.
 */
public class ProcessorFeature implements Condition {

    public static final boolean ENABLED = true;

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return ENABLED;
    }
}
