package stirling.software.proprietary.aiformfill.dto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class FormFillWorkflowTemplateUpsertRequest {

    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Size(max = 128)
    private String formSignature;

    private Map<String, String> roleEntityMap;

    private Map<String, Map<String, String>> fileOverrides;
}
