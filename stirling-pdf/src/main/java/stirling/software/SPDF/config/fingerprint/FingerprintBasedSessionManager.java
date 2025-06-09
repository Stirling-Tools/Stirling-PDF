// package stirling.software.SPDF.config.fingerprint;
//
// import java.util.Iterator;
// import java.util.Map;
// import java.util.concurrent.ConcurrentHashMap;
// import java.util.concurrent.TimeUnit;
//
// import org.springframework.scheduling.annotation.Scheduled;
// import org.springframework.stereotype.Component;
//
// import jakarta.servlet.http.HttpSession;
// import jakarta.servlet.http.HttpSessionAttributeListener;
// import jakarta.servlet.http.HttpSessionEvent;
// import jakarta.servlet.http.HttpSessionListener;
// import lombok.AllArgsConstructor;
// import lombok.Data;
// import lombok.extern.slf4j.Slf4j;
//
// @Slf4j
// @Component
// public class FingerprintBasedSessionManager
//        implements HttpSessionListener, HttpSessionAttributeListener {
//    private static final ConcurrentHashMap<String, FingerprintInfo> activeFingerprints =
//            new ConcurrentHashMap<>();
//
//    // To be reduced in later version to 8~
//    private static final int MAX_ACTIVE_FINGERPRINTS = 30;
//
//    static final String STARTUP_TIMESTAMP = "appStartupTimestamp";
//    static final long APP_STARTUP_TIME = System.currentTimeMillis();
//    private static final long FINGERPRINT_EXPIRATION = TimeUnit.MINUTES.toMillis(30);
//
//    @Override
//    public void sessionCreated(HttpSessionEvent se) {
//        HttpSession session = se.getSession();
//        String sessionId = session.getId();
//        String fingerprint = (String) session.getAttribute("userFingerprint");
//
//        if (fingerprint == null) {
//            log.warn("Session created without fingerprint: {}", sessionId);
//            return;
//        }
//
//        synchronized (activeFingerprints) {
//            if (activeFingerprints.size() >= MAX_ACTIVE_FINGERPRINTS
//                    && !activeFingerprints.containsKey(fingerprint)) {
//                log.info("Max fingerprints reached. Marking session as blocked: {}", sessionId);
//                session.setAttribute("blocked", true);
//            } else {
//                activeFingerprints.put(
//                        fingerprint, new FingerprintInfo(sessionId, System.currentTimeMillis()));
//                log.info(
//                        "New fingerprint registered: {}. Total active fingerprints: {}",
//                        fingerprint,
//                        activeFingerprints.size());
//            }
//            session.setAttribute(STARTUP_TIMESTAMP, APP_STARTUP_TIME);
//        }
//    }
//
//    @Override
//    public void sessionDestroyed(HttpSessionEvent se) {
//        HttpSession session = se.getSession();
//        String fingerprint = (String) session.getAttribute("userFingerprint");
//
//        if (fingerprint != null) {
//            synchronized (activeFingerprints) {
//                activeFingerprints.remove(fingerprint);
//                log.info(
//                        "Fingerprint removed: {}. Total active fingerprints: {}",
//                        fingerprint,
//                        activeFingerprints.size());
//            }
//        }
//    }
//
//    public boolean isFingerPrintAllowed(String fingerprint) {
//        synchronized (activeFingerprints) {
//            return activeFingerprints.size() < MAX_ACTIVE_FINGERPRINTS
//                    || activeFingerprints.containsKey(fingerprint);
//        }
//    }
//
//    public void registerFingerprint(String fingerprint, String sessionId) {
//        synchronized (activeFingerprints) {
//            activeFingerprints.put(
//                    fingerprint, new FingerprintInfo(sessionId, System.currentTimeMillis()));
//        }
//    }
//
//    public void unregisterFingerprint(String fingerprint) {
//        synchronized (activeFingerprints) {
//            activeFingerprints.remove(fingerprint);
//        }
//    }
//
//    @Scheduled(fixedRate = 1800000) // Run every 30 mins
//    public void cleanupStaleFingerprints() {
//        log.info("Starting cleanup of stale fingerprints");
//        long now = System.currentTimeMillis();
//        int removedCount = 0;
//
//        synchronized (activeFingerprints) {
//            Iterator<Map.Entry<String, FingerprintInfo>> iterator =
//                    activeFingerprints.entrySet().iterator();
//            while (iterator.hasNext()) {
//                Map.Entry<String, FingerprintInfo> entry = iterator.next();
//                FingerprintInfo info = entry.getValue();
//
//                if (now - info.getLastAccessTime() > FINGERPRINT_EXPIRATION) {
//                    iterator.remove();
//                    removedCount++;
//                    log.info("Removed stale fingerprint: {}", entry.getKey());
//                }
//            }
//        }
//
//        log.info("Cleanup complete. Removed {} stale fingerprints", removedCount);
//    }
//
//    public void updateLastAccessTime(String fingerprint) {
//        FingerprintInfo info = activeFingerprints.get(fingerprint);
//        if (info != null) {
//            info.setLastAccessTime(System.currentTimeMillis());
//        }
//    }
//
//    @Data
//    @AllArgsConstructor
//    private static class FingerprintInfo {
//        private String sessionId;
//        private long lastAccessTime;
//    }
// }
