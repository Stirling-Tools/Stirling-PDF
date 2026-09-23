#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#if defined(__x86_64__)
#define LO_AUDIT_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define LO_AUDIT_ARCH AUDIT_ARCH_AARCH64
#else
#error "unsupported architecture"
#endif

#ifndef SECCOMP_SET_MODE_FILTER
#define SECCOMP_SET_MODE_FILTER 1
#endif
#ifndef SECCOMP_RET_KILL_PROCESS
#define SECCOMP_RET_KILL_PROCESS 0x80000000U
#endif

#ifndef __NR_io_uring_setup
#define __NR_io_uring_setup 425
#endif
#ifndef __NR_io_uring_enter
#define __NR_io_uring_enter 426
#endif
#ifndef __NR_io_uring_register
#define __NR_io_uring_register 427
#endif
#ifndef __NR_landlock_create_ruleset
#define __NR_landlock_create_ruleset 444
#endif
#ifndef __NR_landlock_add_rule
#define __NR_landlock_add_rule 445
#endif
#ifndef __NR_landlock_restrict_self
#define __NR_landlock_restrict_self 446
#endif

#ifndef LANDLOCK_CREATE_RULESET_VERSION
#define LANDLOCK_CREATE_RULESET_VERSION (1U << 0)

struct landlock_ruleset_attr {
    uint64_t handled_access_fs;
};

struct landlock_path_beneath_attr {
    uint64_t allowed_access;
    int32_t parent_fd;
} __attribute__((packed));

#define LANDLOCK_RULE_PATH_BENEATH 1
#endif

#ifndef LANDLOCK_ACCESS_FS_EXECUTE
#define LANDLOCK_ACCESS_FS_EXECUTE (1ULL << 0)
#define LANDLOCK_ACCESS_FS_WRITE_FILE (1ULL << 1)
#define LANDLOCK_ACCESS_FS_READ_FILE (1ULL << 2)
#define LANDLOCK_ACCESS_FS_READ_DIR (1ULL << 3)
#define LANDLOCK_ACCESS_FS_REMOVE_DIR (1ULL << 4)
#define LANDLOCK_ACCESS_FS_REMOVE_FILE (1ULL << 5)
#define LANDLOCK_ACCESS_FS_MAKE_CHAR (1ULL << 6)
#define LANDLOCK_ACCESS_FS_MAKE_DIR (1ULL << 7)
#define LANDLOCK_ACCESS_FS_MAKE_REG (1ULL << 8)
#define LANDLOCK_ACCESS_FS_MAKE_SOCK (1ULL << 9)
#define LANDLOCK_ACCESS_FS_MAKE_FIFO (1ULL << 10)
#define LANDLOCK_ACCESS_FS_MAKE_BLOCK (1ULL << 11)
#define LANDLOCK_ACCESS_FS_MAKE_SYM (1ULL << 12)
#endif
#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#ifndef LANDLOCK_ACCESS_FS_IOCTL_DEV
#define LANDLOCK_ACCESS_FS_IOCTL_DEV (1ULL << 15)
#endif

#define LO_ACCESS_RO                                                           \
    (LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE |               \
     LANDLOCK_ACCESS_FS_READ_DIR)

/* Rights the kernel accepts on a rule whose target is a file rather than a directory. */
#define LO_ACCESS_FILE                                                         \
    (LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_WRITE_FILE |              \
     LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_TRUNCATE |              \
     LANDLOCK_ACCESS_FS_IOCTL_DEV)

#define LO_ACCESS_NET_BIND_TCP (1ULL << 0)
#define LO_ACCESS_NET_CONNECT_TCP (1ULL << 1)
#define LO_SCOPE_ABSTRACT_UNIX_SOCKET (1ULL << 0)
#define LO_SCOPE_SIGNAL (1ULL << 1)

/* Kernel ABI 4 adds handled_access_net and ABI 6 adds scoped; the size passed to
 * landlock_create_ruleset tells an older kernel which fields to read. */
struct lo_ruleset_attr {
    uint64_t handled_access_fs;
    uint64_t handled_access_net;
    uint64_t scoped;
};

/* Used when STIRLING_LO_ALLOW_RO/RW are unset, so soffice started outside the init
 * scripts is still confined instead of being denied every path. The /var entries are
 * Ubuntu's LibreOffice prereg/uno_packages links and the fontconfig cache. */
#define DEFAULT_RO                                                             \
    "/usr:/lib:/lib64:/bin:/sbin:/etc:/proc:/var/lib/libreoffice:"             \
    "/var/spool/libreoffice:/var/cache/fontconfig:/sys/devices/system/cpu"
#define DEFAULT_RW "/tmp:/dev"

/* Fixed at build time: an exec target read from the environment would let whoever sets it
 * run any binary through the launcher. */
#define REAL_SOFFICE "/usr/lib/libreoffice/program/soffice"

/* Applies the sandbox exactly as a launch would, reports what is active and exits instead of
 * starting LibreOffice, so the init script can check the running kernel. */
#define SELF_CHECK_FLAG "--stirling-sandbox-check"

/* First Landlock ABI that scopes abstract UNIX sockets and signals to the sandbox. */
#define LANDLOCK_ABI_SCOPED 6

static const char *const ENV_ALLOW[] = {"HOME",
                                        "USER",
                                        "LOGNAME",
                                        "PATH",
                                        "SHELL",
                                        "PWD",
                                        "TMPDIR",
                                        "TMP",
                                        "LANG",
                                        "LANGUAGE",
                                        "TZ",
                                        "TERM",
                                        "HOSTNAME",
                                        "DISPLAY",
                                        "XDG_RUNTIME_DIR",
                                        "XDG_CACHE_HOME",
                                        "XDG_CONFIG_HOME",
                                        "XDG_DATA_HOME",
                                        "LD_LIBRARY_PATH",
                                        "JAVA_HOME",
                                        "FONTCONFIG_PATH",
                                        "FONTCONFIG_FILE",
                                        "DBUS_SESSION_BUS_ADDRESS",
                                        "MALLOC_ARENA_MAX",
                                        NULL};

static const char *const ENV_ALLOW_PREFIX[] = {"LC_",  "SAL_",        "OOO_",
                                               "UNO_", "URE_",        "OFFICE_",
                                               "STIRLING_LO_", NULL};

static int env_allowed(const char *entry) {
    const char *eq = strchr(entry, '=');
    size_t name_len = eq != NULL ? (size_t)(eq - entry) : strlen(entry);

    for (size_t i = 0; ENV_ALLOW[i] != NULL; i++) {
        if (strlen(ENV_ALLOW[i]) == name_len &&
            strncmp(entry, ENV_ALLOW[i], name_len) == 0) {
            return 1;
        }
    }
    for (size_t i = 0; ENV_ALLOW_PREFIX[i] != NULL; i++) {
        size_t plen = strlen(ENV_ALLOW_PREFIX[i]);
        if (name_len > plen && strncmp(entry, ENV_ALLOW_PREFIX[i], plen) == 0) {
            return 1;
        }
    }
    return 0;
}

static char **scrub_environment(char **envp) {
    size_t count = 0;
    size_t kept = 0;
    char **out;

    while (envp != NULL && envp[count] != NULL) {
        count++;
    }
    out = calloc(count + 1, sizeof(char *));
    if (out == NULL) {
        return envp;
    }
    for (size_t i = 0; i < count; i++) {
        if (env_allowed(envp[i])) {
            out[kept++] = envp[i];
        }
    }
    out[kept] = NULL;
    return out;
}

static int install_seccomp(void) {
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, LO_AUDIT_ARCH, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),

        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_socket, 9, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_socketpair, 8, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_io_uring_setup, 6, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_io_uring_enter, 5, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_io_uring_register, 4, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_ptrace, 3, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_process_vm_readv, 2, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_process_vm_writev, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA)),

        BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
                 offsetof(struct seccomp_data, args[0]) + 4),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0),
        BPF_STMT(BPF_RET | BPF_K,
                 SECCOMP_RET_ERRNO | (EAFNOSUPPORT & SECCOMP_RET_DATA)),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
                 offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_UNIX, 1, 0),
        BPF_STMT(BPF_RET | BPF_K,
                 SECCOMP_RET_ERRNO | (EAFNOSUPPORT & SECCOMP_RET_DATA)),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog prog = {
        .len = (unsigned short)(sizeof(filter) / sizeof(filter[0])),
        .filter = filter,
    };

    if (syscall(__NR_seccomp, SECCOMP_SET_MODE_FILTER, 0, &prog) == 0) {
        return 0;
    }
    /* QEMU user-mode emulation answers EINVAL rather than ENOSYS. */
    if (errno != ENOSYS && errno != EINVAL) {
        return -1;
    }
    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) == 0) {
        return 0;
    }
    if (errno == ENOSYS || errno == EINVAL) {
        return 1;
    }
    return -1;
}

static int landlock_add_path(int fd, const char *path, uint64_t access,
                             int warn_missing) {
    struct landlock_path_beneath_attr attr;
    int parent;
    int rc;

    struct stat st;

    parent = open(path, O_PATH | O_CLOEXEC);
    if (parent < 0) {
        /* Skipped so optional RO paths (e.g. /lib64, absent on arm64) can be listed, and
         * so another user's private dirs (EACCES) are simply left out. A missing RW or
         * per-job path means LibreOffice will fail on it, so say so. */
        if (warn_missing && errno == ENOENT) {
            fprintf(stderr, "lo-sandbox: allowed path %s skipped: %s\n", path,
                    strerror(errno));
        }
        return 0;
    }
    if (fstat(parent, &st) == 0 && !S_ISDIR(st.st_mode)) {
        access &= LO_ACCESS_FILE;
    }
    attr.allowed_access = access;
    attr.parent_fd = parent;
    rc = (int)syscall(__NR_landlock_add_rule, fd, LANDLOCK_RULE_PATH_BENEATH,
                      &attr, 0);
    close(parent);
    return rc;
}

static int landlock_add_list(int fd, const char *list, uint64_t access,
                             int warn_missing) {
    char *copy;
    char *saved = NULL;

    if (list == NULL || *list == '\0') {
        return 0;
    }
    copy = strdup(list);
    if (copy == NULL) {
        return -1;
    }
    for (char *item = strtok_r(copy, ":", &saved); item != NULL;
         item = strtok_r(NULL, ":", &saved)) {
        if (*item == '\0') {
            continue;
        }
        if (landlock_add_path(fd, item, access, warn_missing) != 0) {
            free(copy);
            return -1;
        }
    }
    free(copy);
    return 0;
}

/* Returns the Landlock ABI the ruleset was enforced with, 0 when the kernel has no Landlock,
 * or -1 when it has Landlock but the ruleset could not be applied. */
static int install_landlock(const char *ro, const char *ro_extra, const char *rw,
                            const char *sock) {
    struct lo_ruleset_attr attr;
    size_t attr_size;
    uint64_t access;
    int abi;
    int fd;

    abi = (int)syscall(__NR_landlock_create_ruleset, NULL, 0,
                       LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 1) {
        return 0;
    }

    access = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_WRITE_FILE |
             LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |
             LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE |
             LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |
             LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |
             LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |
             LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 2) {
        access |= LANDLOCK_ACCESS_FS_REFER;
    }
    if (abi >= 3) {
        access |= LANDLOCK_ACCESS_FS_TRUNCATE;
    }
    if (abi >= 5) {
        access |= LANDLOCK_ACCESS_FS_IOCTL_DEV;
    }

    memset(&attr, 0, sizeof(attr));
    attr.handled_access_fs = access;
    attr_size = sizeof(attr.handled_access_fs);
    if (abi >= 4) {
        /* No net rules are added, so TCP bind/connect is denied even if seccomp is not. */
        attr.handled_access_net = LO_ACCESS_NET_BIND_TCP | LO_ACCESS_NET_CONNECT_TCP;
        attr_size = offsetof(struct lo_ruleset_attr, scoped);
    }
    if (abi >= LANDLOCK_ABI_SCOPED) {
        /* Pathname sockets (the unoserver pipe) are unaffected; abstract sockets and
         * signals to processes outside the sandbox are refused. */
        attr.scoped = LO_SCOPE_ABSTRACT_UNIX_SOCKET | LO_SCOPE_SIGNAL;
        attr_size = sizeof(attr);
    }
    fd = (int)syscall(__NR_landlock_create_ruleset, &attr, attr_size, 0);
    if (fd < 0) {
        return -1;
    }

    if (landlock_add_list(fd, ro, LO_ACCESS_RO & access, 0) != 0 ||
        landlock_add_list(fd, ro_extra, LO_ACCESS_RO & access, 1) != 0 ||
        landlock_add_list(fd, rw, access, 1) != 0 ||
        landlock_add_list(fd, sock, LANDLOCK_ACCESS_FS_MAKE_SOCK, 0) != 0) {
        close(fd);
        return -1;
    }
    if (syscall(__NR_landlock_restrict_self, fd, 0) != 0) {
        close(fd);
        return -1;
    }
    close(fd);
    return abi;
}

/* Only a bare probe skips the sandbox; a flag appended to a real invocation must not. */
static int is_probe(int argc, char **argv) {
    if (argc != 2) {
        return 0;
    }
    return strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-version") == 0 ||
           strcmp(argv[1], "--help") == 0;
}

int main(int argc, char **argv, char **envp) {
    const char *mode = getenv("STIRLING_LO_SANDBOX");
    const char *ro = getenv("STIRLING_LO_ALLOW_RO");
    const char *rw = getenv("STIRLING_LO_ALLOW_RW");
    const char *ro_extra = getenv("STIRLING_LO_ALLOW_RO_EXTRA");
    /* Socket-only dirs: LibreOffice hardcodes its single-instance IPC pipe to /tmp, so it
     * must bind there, but gets no read, write, list or delete right on /tmp itself. */
    const char *sock = getenv("STIRLING_LO_ALLOW_SOCK");
    int required;
    int check;
    int landlock_abi;
    int seccomp_rc;
    char **clean;

    if (mode == NULL || *mode == '\0') {
        mode = "enforce";
    }
    if (ro == NULL || *ro == '\0') {
        ro = DEFAULT_RO;
    }
    if (rw == NULL || *rw == '\0') {
        rw = DEFAULT_RW;
    }
    required = strcmp(mode, "required") == 0;
    check = argc == 2 && strcmp(argv[1], SELF_CHECK_FLAG) == 0;

    if (strcmp(mode, "off") == 0) {
        if (check) {
            fprintf(stderr, "lo-sandbox: disabled (mode=off)\n");
            return 0;
        }
        execv(REAL_SOFFICE, argv);
        fprintf(stderr, "lo-sandbox: exec %s failed: %s\n", REAL_SOFFICE, strerror(errno));
        return 127;
    }
    if (is_probe(argc, argv)) {
        execv(REAL_SOFFICE, argv);
        fprintf(stderr, "lo-sandbox: exec %s failed: %s\n", REAL_SOFFICE, strerror(errno));
        return 127;
    }

    clean = scrub_environment(envp);

    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
        fprintf(stderr, "lo-sandbox: no_new_privs failed: %s\n",
                strerror(errno));
        return 125;
    }

    landlock_abi = install_landlock(ro, ro_extra, rw, sock);
    if (landlock_abi < 0) {
        fprintf(stderr, "lo-sandbox: landlock ruleset failed: %s\n",
                strerror(errno));
        return 125;
    }
    if (landlock_abi == 0) {
        if (required) {
            fprintf(stderr,
                    "lo-sandbox: landlock unavailable and mode=required\n");
            return 125;
        }
        fprintf(stderr,
                "lo-sandbox: landlock unavailable, filesystem unconfined\n");
    } else if (landlock_abi < LANDLOCK_ABI_SCOPED) {
        if (required) {
            fprintf(stderr,
                    "lo-sandbox: landlock ABI %d cannot scope signals and abstract "
                    "sockets (needs %d) and mode=required\n",
                    landlock_abi, LANDLOCK_ABI_SCOPED);
            return 125;
        }
        if (check) {
            fprintf(stderr,
                    "lo-sandbox: landlock scoping unavailable (ABI %d), signals and "
                    "abstract sockets unconfined\n",
                    landlock_abi);
        }
    }

    seccomp_rc = install_seccomp();
    if (seccomp_rc < 0) {
        fprintf(stderr, "lo-sandbox: seccomp filter rejected: %s\n",
                strerror(errno));
        return 125;
    }
    if (seccomp_rc > 0) {
        if (required) {
            fprintf(stderr, "lo-sandbox: seccomp unavailable and mode=required\n");
            return 125;
        }
        fprintf(stderr, "lo-sandbox: seccomp unavailable, network unconfined\n");
    }

    if (check) {
        fprintf(stderr, "lo-sandbox: landlock ABI %d, seccomp %s\n", landlock_abi,
                seccomp_rc == 0 ? "active" : "unavailable");
        return 0;
    }
    execve(REAL_SOFFICE, argv, clean);
    fprintf(stderr, "lo-sandbox: exec %s failed: %s\n", REAL_SOFFICE, strerror(errno));
    return 127;
}
