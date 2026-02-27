package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;

@ExtendWith(MockitoExtension.class)
class MobileScannerControllerMockingMemberCTest {

    @Mock private MobileScannerService mobileScannerService;

    @Mock private ApplicationProperties applicationProperties;

    @InjectMocks private MobileScannerController controller;

    @Test
    void uploadFiles_whenNoFiles_thenDoesNotCallService() throws Exception {
        ResponseEntity<Map<String, Object>> resp = controller.uploadFiles("session123", List.of());
        assertThat(resp.getStatusCodeValue()).isIn(400, 403);
        verify(mobileScannerService, never()).uploadFiles(anyString(), anyList());
    }
}
