package stirling.software.proprietary.repository;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.AnonymousApiUsage;

@Repository
public interface AnonymousApiUsageRepository extends JpaRepository<AnonymousApiUsage, Long> {

    Optional<AnonymousApiUsage> findByFingerprintAndMonth(String fingerprint, YearMonth month);

    @Query("SELECT a FROM AnonymousApiUsage a WHERE a.fingerprint = :fingerprint AND a.month = :month AND a.isBlocked = false")
    Optional<AnonymousApiUsage> findActiveByFingerprintAndMonth(@Param("fingerprint") String fingerprint, @Param("month") YearMonth month);

    @Query("SELECT a FROM AnonymousApiUsage a WHERE a.ipAddress = :ipAddress AND a.month = :month")
    List<AnonymousApiUsage> findByIpAddressAndMonth(@Param("ipAddress") String ipAddress, @Param("month") YearMonth month);

    @Query("SELECT a FROM AnonymousApiUsage a WHERE :fingerprint IN (SELECT rf FROM a.relatedFingerprints rf) AND a.month = :month")
    List<AnonymousApiUsage> findRelatedUsages(@Param("fingerprint") String fingerprint, @Param("month") YearMonth month);

    @Query("SELECT COALESCE(SUM(a.usageCount), 0) FROM AnonymousApiUsage a WHERE a.ipAddress = :ipAddress AND a.month = :month")
    Integer getTotalUsageByIpAndMonth(@Param("ipAddress") String ipAddress, @Param("month") YearMonth month);

    @Modifying
    @Query("UPDATE AnonymousApiUsage a SET a.usageCount = a.usageCount + 1, a.lastAccess = CURRENT_TIMESTAMP WHERE a.id = :id AND a.usageCount < :limit")
    int incrementUsage(@Param("id") Long id, @Param("limit") int limit);

    @Modifying
    @Query("UPDATE AnonymousApiUsage a SET a.isBlocked = true WHERE a.fingerprint = :fingerprint")
    void blockFingerprint(@Param("fingerprint") String fingerprint);

    @Modifying
    @Query("UPDATE AnonymousApiUsage a SET a.abuseScore = a.abuseScore + :increment WHERE a.id = :id")
    void incrementAbuseScore(@Param("id") Long id, @Param("increment") int increment);

    @Query("SELECT COUNT(DISTINCT a.fingerprint) FROM AnonymousApiUsage a WHERE a.ipAddress = :ipAddress AND a.month = :month")
    Long countDistinctFingerprintsForIp(@Param("ipAddress") String ipAddress, @Param("month") YearMonth month);

    @Modifying
    @Query(value = "INSERT INTO anonymous_api_usage (fingerprint, month, usage_count, ip_address, user_agent, abuse_score, is_blocked, last_access, created_at, updated_at, version) " +
                   "VALUES (:fingerprint, :month, 1, :ipAddress, :userAgent, 0, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0) " +
                   "ON CONFLICT (fingerprint, month) DO UPDATE SET " +
                   "usage_count = anonymous_api_usage.usage_count + 1, " +
                   "last_access = CURRENT_TIMESTAMP, " +
                   "updated_at = CURRENT_TIMESTAMP " +
                   "WHERE anonymous_api_usage.usage_count < :limit",
           nativeQuery = true)
    int upsertAndIncrement(@Param("fingerprint") String fingerprint, 
                          @Param("month") String month,
                          @Param("ipAddress") String ipAddress,
                          @Param("userAgent") String userAgent,
                          @Param("limit") int limit);
    
    @Query(value = "INSERT INTO anonymous_api_usage (fingerprint, month, usage_count, ip_address, user_agent, " +
                   "abuse_score, is_blocked, last_access, created_at, updated_at, version) " +
                   "VALUES (:fingerprint, :month, 1, :ipAddress, :userAgent, 0, false, CURRENT_TIMESTAMP, " +
                   "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0) " +
                   "ON CONFLICT (fingerprint, month) DO UPDATE SET " +
                   "usage_count = anonymous_api_usage.usage_count + 1, " +
                   "last_access = CURRENT_TIMESTAMP, " +
                   "updated_at = CURRENT_TIMESTAMP " +
                   "WHERE anonymous_api_usage.usage_count < :limit " +
                   "RETURNING usage_count",
           nativeQuery = true)
    Integer upsertAndIncrementReturningCount(@Param("fingerprint") String fingerprint,
                                            @Param("month") String month,
                                            @Param("ipAddress") String ipAddress,
                                            @Param("userAgent") String userAgent,
                                            @Param("limit") int limit);
}