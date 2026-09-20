package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * What the admin AI page shows about the engine.
 *
 * <p>Split from the engine's own {@code /health} on purpose. Health is deliberately exempt from the
 * shared-secret check and never contacts the model provider, so it answers "is something listening"
 * and nothing more - it stays green while every real request is being refused with a 401. {@link
 * #authenticated} is the answer to the question health cannot ask, obtained by also calling a
 * secret-gated route.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Reachability and authentication status of the configured AI engine")
public class AiEngineStatus {

    @Schema(
            description =
                    "Whether AI is switched on in settings. When false nothing else was probed")
    private boolean enabled;

    @Schema(description = "Whether the engine answered its health check")
    private boolean reachable;

    @Schema(
            description =
                    "Round-trip time of the health check in milliseconds, null when unreachable")
    private Long latencyMs;

    @Schema(
            description =
                    "Whether the engine accepted this server's shared secret. Null when it could"
                            + " not be determined (engine unreachable, or the probe failed for a"
                            + " reason other than being rejected)")
    private Boolean authenticated;

    @Schema(description = "Smart model the engine reports it is using", example = "claude-sonnet-5")
    private String smartModel;

    @Schema(description = "Fast model the engine reports it is using", example = "claude-haiku-4-5")
    private String fastModel;

    @Schema(description = "Why the probe failed, for display next to a red status")
    private String error;

    @Schema(
            description =
                    "Cloud mode only: whether the Stirling Cloud host itself answered its public"
                            + " status endpoint. Null in self-hosted mode, where there is no such"
                            + " host to ask")
    private Boolean cloudUp;

    @Schema(
            description =
                    "Cloud mode only: whether that deployment shares its AI with linked servers."
                            + " False is a switch someone turned off, not an outage. Null when it"
                            + " could not be determined")
    private Boolean cloudSharingEnabled;
}
