package stirling.software.proprietary.model.docparse;

import java.util.List;

import stirling.software.proprietary.model.api.ai.AiPageText;

/** Engine request for {@code POST /api/v1/docparse/split}. */
public record SmartSplitRequest(
        String fileName, String rule, List<AiPageText> pages, int maxParts) {}
