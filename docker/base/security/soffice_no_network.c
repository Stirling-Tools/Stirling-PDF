/* LD_PRELOAD connect() guard: blocks LibreOffice/unoserver egress (SSRF); loopback stays open for the UNO bridge. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <string.h>
#include <stdint.h>
#include <sys/socket.h>
#include <netinet/in.h>

typedef int (*connect_fn)(int, const struct sockaddr *, socklen_t);

static int is_local(const struct sockaddr *addr) {
    if (addr == NULL) {
        return 1;
    }
    switch (addr->sa_family) {
        case AF_UNIX:
            return 1;
        case AF_INET: {
            uint32_t ip = ntohl(((const struct sockaddr_in *)addr)->sin_addr.s_addr);
            return (ip >> 24) == 127;
        }
        case AF_INET6: {
            const unsigned char *b = ((const struct sockaddr_in6 *)addr)->sin6_addr.s6_addr;
            static const unsigned char loopback[16] = {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1};
            if (memcmp(b, loopback, 16) == 0) {
                return 1;
            }
            /* ::ffff:127.x v4-mapped loopback */
            if (memcmp(b, "\0\0\0\0\0\0\0\0\0\0\xff\xff", 12) == 0 && b[12] == 127) {
                return 1;
            }
            return 0;
        }
        default:
            return 1; /* AF_NETLINK etc. are not egress */
    }
}

static connect_fn real_connect = NULL;

__attribute__((constructor)) static void guard_init(void) {
    real_connect = (connect_fn)dlsym(RTLD_NEXT, "connect");
}

int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    if (real_connect == NULL) {
        real_connect = (connect_fn)dlsym(RTLD_NEXT, "connect");
    }
    if (!is_local(addr)) {
        errno = EACCES;
        return -1;
    }
    return real_connect(sockfd, addr, addrlen);
}
