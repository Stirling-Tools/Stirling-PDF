package stirling.software.proprietary.aiformfill.dto;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class FormFillEntityUpsertRequest {

    @NotBlank
    @JsonProperty("type")
    private String entityType;

    @NotBlank
    @Size(max = 255)
    private String name;

    private Map<String, String> fields;
}
