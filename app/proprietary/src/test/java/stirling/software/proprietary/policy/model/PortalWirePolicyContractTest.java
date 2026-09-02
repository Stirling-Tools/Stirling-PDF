package stirling.software.proprietary.policy.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The portal's policy codec (frontend {@code policies/codec.ts}) posts this body to {@code POST
 * /api/v1/policies}. Both sides pin the same fixture, so a frontend shape change that this record
 * would silently drop - unknown properties are ignored, which is how {@code sourceIds} + a
 * top-level {@code trigger} once saved a policy with no source and no trigger at all - fails here
 * instead of shipping as a no-op.
 */
class PortalWirePolicyContractTest {

    private static final String FIXTURE = "/policy/portal-wire-policy.json";

    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Test
    void bindsThePortalBodyToAPolicyWithItsSourceTriggerAndDestination() {
        Policy policy = objectMapper.readValue(fixture(), Policy.class);

        assertThat(policy.id()).isEqualTo("pol_routing");
        assertThat(policy.name()).isEqualTo("Routing Policy");
        assertThat(policy.enabled()).isTrue();
        // The binding the feature depends on: a real source, pulled by a real trigger.
        assertThat(policy.sourceIds()).containsExactly("src-dropbox");
        assertThat(policy.triggerTypes()).containsExactly("schedule");
        assertThat(policy.inputs().get(0).trigger().options()).containsKey("schedule");
        assertThat(policy.outputIds()).containsExactly("src-archive");
        assertThat(policy.steps()).hasSize(1);
        assertThat(policy.steps().get(0).operation()).isEqualTo("/api/v1/misc/compress-pdf");
        assertThat(policy.steps().get(0).parameters()).containsEntry("optimizeLevel", 5);
        assertThat(policy.output().type()).isEqualTo("inline");
        assertThat(policy.output().options()).containsEntry("categoryId", "routing");
    }

    @Test
    void carriesScheduleOptionsTheScheduleTriggerCanParse() {
        Policy policy = objectMapper.readValue(fixture(), Policy.class);

        Object options = policy.inputs().get(0).trigger().options().get("schedule");

        assertThat(objectMapper.convertValue(options, Schedule.class))
                .isEqualTo(new Schedule.Every(1, Schedule.Unit.HOURS));
    }

    @Test
    void staysWithinTheOneInputOneOutputCap() {
        Policy policy = objectMapper.readValue(fixture(), Policy.class);

        assertThat(policy.inputs()).hasSize(1);
        assertThat(policy.outputIds()).hasSize(1);
    }

    @Test
    void serialisesBackToTheSameShapeTheFrontendDecodes() {
        Policy policy = objectMapper.readValue(fixture(), Policy.class);

        Policy reread =
                objectMapper.readValue(objectMapper.writeValueAsString(policy), Policy.class);

        assertThat(reread).isEqualTo(policy);
    }

    private String fixture() {
        try (InputStream in = getClass().getResourceAsStream(FIXTURE)) {
            assertThat(in).as("fixture %s", FIXTURE).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("cannot read " + FIXTURE, e);
        }
    }
}
