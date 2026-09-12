#pragma once

#include <stddef.h>

typedef struct MacIdentityResult {
    char *identity_hash;
    char *subject;
    char *issuer;
    char *subject_common_name;
    char *issuer_common_name;
    char *serial_number;
    char *key_algorithm;
    char *not_before;
    char *not_after;
    int expired;
    int not_yet_valid;
    int cancelled;
    int error;
    char *error_message;
} MacIdentityResult;

MacIdentityResult mac_choose_signing_identity(void);

void mac_identity_result_free(MacIdentityResult *result);
