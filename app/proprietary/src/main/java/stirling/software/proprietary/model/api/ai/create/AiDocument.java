package stirling.software.proprietary.model.api.ai.create;

import java.util.List;

import lombok.Data;

@Data
public class AiDocument {

    private String title;
    private String subtitle;
    private String referenceNumber;
    private Style style;
    private List<Section> sections;

    @Data
    public static class Style {
        private String primaryColor;
        private String backgroundColor;
        private String bodyTextColor;
    }

    @Data
    public static class Section {
        private String type;
        private String heading;
        private String body;
        private List<List<String>> pairs;
        private List<String> columns;
        private List<List<String>> rows;
        private List<String> totalRow;
        private List<String> items;
        private List<String> signatories;
    }
}
