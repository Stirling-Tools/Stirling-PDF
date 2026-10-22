package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** What the admin AI page shows about the engine. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Reachability and authentication status of the configured AI engine")
public class AiEngineStatus {

    @Schema(description = "Whether AI is switched on. When false nothing else was probed")
    private boolean enabled;

    @Schema(description = "Whether the engine answered its health check")
    private boolean reachable;

    @Schema(description = "Health check round-trip in milliseconds, null when unreachable")
    private Long latencyMs;

    @Schema(
            description =
                    "Whether the engine accepted this server's credentials. Null when it could not"
                            + " be determined")
    private Boolean authenticated;

    @Schema(description = "Smart model the engine reports it is using", example = "claude-sonnet-5")
    private String smartModel;

    @Schema(description = "Fast model the engine reports it is using", example = "claude-haiku-4-5")
    private String fastModel;

    @Schema(description = "Why the probe failed, for display next to a red status")
    private String error;

    @Schema(description = "Cloud mode only: whether the Stirling Cloud host answered")
    private Boolean cloudUp;

    @Schema(
            description =
                    "Cloud mode only: whether Stirling Cloud shares its AI with linked servers."
                            + " Null when it could not be determined")
    private Boolean cloudSharingEnabled;
}
