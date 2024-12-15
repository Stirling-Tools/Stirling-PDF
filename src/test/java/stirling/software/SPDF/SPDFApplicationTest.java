package stirling.software.SPDF;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;

import stirling.software.SPDF.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
public class SPDFApplicationTest {

    @Mock
    private Environment env;

    @Mock
    private ApplicationProperties applicationProperties;

    @InjectMocks
    private SPDFApplication sPdfApplication;

    @BeforeEach
    public void setUp() {
        sPdfApplication.setServerPortStatic("8080");
    }

    @Test
    public void testSetServerPortStatic() {
        sPdfApplication.setServerPortStatic("9090");
        assertEquals("9090", SPDFApplication.getStaticPort());
    }

    @Test
    public void testGetStaticPort() {
        assertEquals("8080", SPDFApplication.getStaticPort());
    }

    @Test
    public void testGetNonStaticPort() {
        assertEquals("8080", sPdfApplication.getNonStaticPort());
    }
}
