#import "picker.h"

#import <AppKit/AppKit.h>
#import <CommonCrypto/CommonDigest.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Security/Security.h>
#import <SecurityInterface/SFChooseIdentityPanel.h>

static char *copy_c_string(NSString *value) {
    if (value == nil) {
        return NULL;
    }
    const char *utf8 = [value UTF8String];
    if (utf8 == NULL) {
        return NULL;
    }
    return strdup(utf8);
}

static NSString *certificate_sha1_hex(SecCertificateRef certificate) {
    CFDataRef der_data = SecCertificateCopyData(certificate);
    if (der_data == NULL) {
        return nil;
    }

    const UInt8 *bytes = CFDataGetBytePtr(der_data);
    CFIndex length = CFDataGetLength(der_data);
    unsigned char digest[CC_SHA1_DIGEST_LENGTH];
    CC_SHA1(bytes, (CC_LONG)length, digest);
    CFRelease(der_data);

    NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA1_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA1_DIGEST_LENGTH; i++) {
        [hex appendFormat:@"%02X", digest[i]];
    }
    return hex;
}

static NSString *common_name_from_summary(CFStringRef summary) {
    if (summary == NULL) {
        return @"";
    }
    NSString *value = (__bridge NSString *)summary;
    NSRange range = [value rangeOfString:@"CN="];
    if (range.location == NSNotFound) {
        return value;
    }
    NSString *after = [value substringFromIndex:range.location + range.length];
    NSRange comma = [after rangeOfString:@","];
    if (comma.location == NSNotFound) {
        return after;
    }
    return [after substringToIndex:comma.location];
}

static void fill_identity_metadata(SecIdentityRef identity, MacIdentityResult *result) {
    SecCertificateRef certificate = NULL;
    if (SecIdentityCopyCertificate(identity, &certificate) != errSecSuccess || certificate == NULL) {
        result->error = 1;
        result->error_message = copy_c_string(@"Could not read the selected certificate");
        return;
    }

    result->identity_hash = copy_c_string(certificate_sha1_hex(certificate));

    CFStringRef summary = SecCertificateCopySubjectSummary(certificate);
    if (summary != NULL) {
        result->subject = copy_c_string((__bridge NSString *)summary);
        result->subject_common_name = copy_c_string(common_name_from_summary(summary));
        CFRelease(summary);
    }

    CFErrorRef copy_error = NULL;
    CFDictionaryRef values = SecCertificateCopyValues(certificate, NULL, &copy_error);
    if (values != NULL) {
        CFDictionaryRef issuer = CFDictionaryGetValue(values, kSecOIDX509V1IssuerName);
        if (issuer != NULL) {
            CFArrayRef issuer_parts = CFDictionaryGetValue(issuer, kSecPropertyKeyValue);
            if (issuer_parts != NULL && CFArrayGetCount(issuer_parts) > 0) {
                CFDictionaryRef first = CFArrayGetValueAtIndex(issuer_parts, 0);
                CFStringRef issuer_label = CFDictionaryGetValue(first, kSecPropertyKeyLabel);
                if (issuer_label != NULL) {
                    result->issuer = copy_c_string((__bridge NSString *)issuer_label);
                    result->issuer_common_name = copy_c_string(common_name_from_summary(issuer_label));
                }
            }
        }
        CFRelease(values);
    } else if (copy_error != NULL) {
        CFRelease(copy_error);
    }

    NSDate *now = [NSDate date];
    if (@available(macOS 10.12, *)) {
        NSDate *not_before = (__bridge_transfer NSDate *)SecCertificateCopyNotValidBeforeDate(certificate);
        NSDate *not_after = (__bridge_transfer NSDate *)SecCertificateCopyNotValidAfterDate(certificate);
        NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
        if (not_before != nil) {
            result->not_before = copy_c_string([formatter stringFromDate:not_before]);
            result->not_yet_valid = [now compare:not_before] == NSOrderedAscending;
        }
        if (not_after != nil) {
            result->not_after = copy_c_string([formatter stringFromDate:not_after]);
            result->expired = [now compare:not_after] == NSOrderedDescending;
        }
    }

    SecKeyRef public_key = SecCertificateCopyKey(certificate);
    if (public_key != NULL) {
        CFDictionaryRef attrs = SecKeyCopyAttributes(public_key);
        if (attrs != NULL) {
            CFTypeRef key_type_string = CFDictionaryGetValue(attrs, kSecAttrKeyType);
            if (key_type_string != NULL) {
                if (CFEqual(key_type_string, kSecAttrKeyTypeRSA)) {
                    result->key_algorithm = copy_c_string(@"RSA");
                } else if (CFEqual(key_type_string, kSecAttrKeyTypeECSECPrimeRandom)) {
                    result->key_algorithm = copy_c_string(@"EC");
                } else if (CFEqual(key_type_string, kSecAttrKeyTypeEC)) {
                    result->key_algorithm = copy_c_string(@"EC");
                }
            }
            CFRelease(attrs);
        }
        CFRelease(public_key);
    }

    if (result->key_algorithm == NULL) {
        result->key_algorithm = copy_c_string(@"RSA");
    }

    CFRelease(certificate);
}

MacIdentityResult mac_choose_signing_identity(void) {
    MacIdentityResult result = {0};

    @autoreleasepool {
        NSDictionary *query = @{
            (__bridge id)kSecClass : (__bridge id)kSecClassIdentity,
            (__bridge id)kSecReturnRef : @YES,
            (__bridge id)kSecMatchLimit : (__bridge id)kSecMatchLimitAll,
        };
        CFTypeRef matches = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &matches);
        NSArray *identities = nil;
        if (status == errSecSuccess && matches != NULL) {
            identities = (__bridge_transfer NSArray *)matches;
        }

        SFChooseIdentityPanel *panel = [SFChooseIdentityPanel sharedChooseIdentityPanel];
        NSInteger response = [panel runModalForIdentities:identities
                                                  message:@"Choose a certificate to sign the PDF"];
        if (response != NSModalResponseOK) {
            result.cancelled = 1;
            return result;
        }

        SecIdentityRef identity = [panel identity];
        if (identity == NULL) {
            result.cancelled = 1;
            return result;
        }

        fill_identity_metadata(identity, &result);
    }

    return result;
}

void mac_identity_result_free(MacIdentityResult *result) {
    if (result == NULL) {
        return;
    }
    free(result->identity_hash);
    free(result->subject);
    free(result->issuer);
    free(result->subject_common_name);
    free(result->issuer_common_name);
    free(result->serial_number);
    free(result->key_algorithm);
    free(result->not_before);
    free(result->not_after);
    free(result->error_message);
    memset(result, 0, sizeof(MacIdentityResult));
}
