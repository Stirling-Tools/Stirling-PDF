package stirling.software.proprietary.aiformfill.dto;

import java.time.LocalDateTime;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Builder;
import lombok.Getter;

import stirling.software.proprietary.aiformfill.model.FormFillEntity;

@Getter
@Builder
public class FormFillEntityDTO {
    private final String id;

    @JsonProperty("type")
    private final String entityType;

    private final String name;
    private final Map<String, String> fields;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public static FormFillEntityDTO from(FormFillEntity entity) {
        return FormFillEntityDTO.builder()
                .id(entity.getId())
                .entityType(entity.getEntityType())
                .name(entity.getName())
                .fields(entity.getFields())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
