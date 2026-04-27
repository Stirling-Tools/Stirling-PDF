package stirling.software.proprietary.aiformfill.dto;

import java.time.LocalDateTime;
import java.util.Map;

import lombok.Builder;
import lombok.Getter;

import stirling.software.proprietary.aiformfill.model.FormFillWorkflowTemplate;

@Getter
@Builder
public class FormFillWorkflowTemplateDTO {
    private final String id;
    private final String name;
    private final String formSignature;
    private final Map<String, String> roleEntityMap;
    private final Map<String, Map<String, String>> fileOverrides;
    private final LocalDateTime createdAt;
    private final LocalDateTime lastUsedAt;

    public static FormFillWorkflowTemplateDTO from(FormFillWorkflowTemplate template) {
        return FormFillWorkflowTemplateDTO.builder()
                .id(template.getId())
                .name(template.getName())
                .formSignature(template.getFormSignature())
                .roleEntityMap(template.getRoleEntityMap())
                .fileOverrides(template.getFileOverrides())
                .createdAt(template.getCreatedAt())
                .lastUsedAt(template.getLastUsedAt())
                .build();
    }
}
