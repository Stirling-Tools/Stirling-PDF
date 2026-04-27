package stirling.software.proprietary.aiformfill.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Bulk import payload — each item has a client-supplied UUID that gets upserted. */
@Getter
@Setter
@NoArgsConstructor
public class FormFillEntityImportRequest {

    @Valid private List<Item> entities;

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Item {
        @NotBlank private String id;
        @Valid private FormFillEntityUpsertRequest entity;
    }
}
