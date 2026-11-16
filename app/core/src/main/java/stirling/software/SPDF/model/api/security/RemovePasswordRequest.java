package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

/**
 * Omitting all selective fields preserves password-only behaviour. Supplying any selective field,
 * even empty, makes nonempty password/ownerPassword select removal; blank fields retain that role.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class RemovePasswordRequest extends PDFPasswordRequest {
    @Schema(
            description =
                    "Explicitly remove all passwords and restrictions, subject to the server owner-password policy. The password or sourcePassword authenticates the source; selective removal fields do not apply.",
            defaultValue = "false")
    private boolean removeAll;

    @Schema(
            description =
                    "Permissions password to remove. Supplying this field enables selective removal;"
                            + " leave blank to retain the permissions password.",
            format = "password")
    @ToString.Exclude
    private String ownerPassword;

    @Schema(
            description =
                    "Credential for opening the source, without selecting it for removal. Supplying"
                            + " this field enables selective removal; password then selects the"
                            + " opening password to remove and ownerPassword selects the permissions"
                            + " password to remove. Blank selection fields keep their passwords.",
            format = "password")
    @ToString.Exclude
    private String sourcePassword;

    @Schema(
            description =
                    "Opening password to retain when removing only the permissions password."
                            + " Supplying this field enables selective removal.",
            format = "password")
    @ToString.Exclude
    private String retainedOpeningPassword;
}
