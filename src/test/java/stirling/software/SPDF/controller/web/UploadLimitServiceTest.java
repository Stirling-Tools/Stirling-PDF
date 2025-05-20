package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.SPDF.model.ApplicationProperties;

class UploadLimitServiceTest {

    private UploadLimitService uploadLimitService;
    private ApplicationProperties applicationProperties;
    private ApplicationProperties.System systemProps;

    @BeforeEach
    void setUp() {
        applicationProperties = mock(ApplicationProperties.class);
        systemProps = mock(ApplicationProperties.System.class);
        when(applicationProperties.getSystem()).thenReturn(systemProps);

        uploadLimitService = new UploadLimitService();
        // inject mock
        try {
            var field = UploadLimitService.class.getDeclaredField("applicationProperties");
            field.setAccessible(true);
            field.set(uploadLimitService, applicationProperties);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @ParameterizedTest(name = "getUploadLimit case #{index}: input={0}, expected={1}")
    @MethodSource("uploadLimitParams")
    void shouldComputeUploadLimitCorrectly(String input, long expected) {
        when(systemProps.getFileUploadLimit()).thenReturn(input);

        long result = uploadLimitService.getUploadLimit();
        assertEquals(expected, result);
    }

    static Stream<Arguments> uploadLimitParams() {
        return Stream.of(
                // empty or null input yields 0
                Arguments.of(null, 0L),
                Arguments.of("", 0L),
                // invalid formats
                Arguments.of("1234MB", 0L),
                Arguments.of("5TB", 0L),
                // valid formats
                Arguments.of("10KB", 10 * 1024L),
                Arguments.of("2MB", 2 * 1024 * 1024L),
                Arguments.of("1GB", 1L * 1024 * 1024 * 1024),
                Arguments.of("5mb", 5 * 1024 * 1024L),
                Arguments.of("0MB", 0L));
    }

    @ParameterizedTest(name = "getReadableUploadLimit case #{index}: rawValue={0}, expected={1}")
    @MethodSource("readableLimitParams")
    void shouldReturnReadableFormat(String rawValue, String expected) {
        when(systemProps.getFileUploadLimit()).thenReturn(rawValue);
        String result = uploadLimitService.getReadableUploadLimit();
        assertEquals(expected, result);
    }

    static Stream<Arguments> readableLimitParams() {
        return Stream.of(
                Arguments.of(null, "0 B"),
                Arguments.of("", "0 B"),
                Arguments.of("1KB", "1.0 KB"),
                Arguments.of("2MB", "2.0 MB"));
    }
}
