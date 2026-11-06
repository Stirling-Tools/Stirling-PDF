package stirling.software.proprietary.security.configuration;

import java.util.Map;

import stirling.software.common.model.ApplicationProperties.SecondLevelCache.Region;

public record SecondLevelCacheRegionDefaults(Map<String, Region> regions) {}
