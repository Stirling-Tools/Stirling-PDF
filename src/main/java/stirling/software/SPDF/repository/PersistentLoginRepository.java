package stirling.software.SPDF.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.web.bind.annotation.ResponseBody;

import stirling.software.SPDF.model.PersistentLogin;

@ResponseBody
public interface PersistentLoginRepository extends JpaRepository<PersistentLogin, String> {}
