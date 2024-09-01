package stirling.software.SPDF.config;

import com.fasterxml.jackson.annotation.JsonProperty;

public class memoryConfig {
    private MemorySettings memory;

    @JsonProperty("memory")
    public MemorySettings getMemory() {
        return memory;
    }

    @JsonProperty("memory")
    public void setMemory(MemorySettings memory) {
        this.memory = memory;
    }

    public static class MemorySettings {
        private int minFreeSpacePercentage;
        private long ramThresholdGB;

        @JsonProperty("minFreeSpacePercentage")
        public int getMinFreeSpacePercentage() {
            return minFreeSpacePercentage;
        }

        @JsonProperty("minFreeSpacePercentage")
        public void setMinFreeSpacePercentage(int minFreeSpacePercentage) {
            this.minFreeSpacePercentage = minFreeSpacePercentage;
        }

        @JsonProperty("ramThresholdGB")
        public long getRamThresholdGB() {
            return ramThresholdGB;
        }

        @JsonProperty("ramThresholdGB")
        public void setRamThresholdGB(long ramThresholdGB) {
            this.ramThresholdGB = ramThresholdGB;
        }
    }
}
