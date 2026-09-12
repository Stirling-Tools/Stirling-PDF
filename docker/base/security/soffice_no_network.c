/* LD_PRELOAD connect() interposer for LibreOffice/unoserver: refuses every
 * destination that is not loopback, so a hostile document cannot make the
 * converter fetch (SSRF). Loopback stays open for the UNO bridge and CUPS.
 *
 * Reaches only calls that bind to the dynamic "connect" symbol. glibc's stub
 * resolver goes through its own internal __connect, so DNS is NOT stopped, and
 * neither are syscall(SYS_connect), unconnected sendto(), raw sockets, static
 * binaries, or a child that drops LD_PRELOAD. This narrows the reachable
 * surface; the network namespace is what actually contains it.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <string.h>
#include <stdint.h>
#include <sys/socket.h>
#include <netinet/in.h>

typedef int (*connect_fn)(int, const struct sockaddr *, socklen_t);

static int is_allowed(const struct sockaddr *addr, socklen_t addrlen) {
    /* Unclassifiable, and no peer either way: let the kernel answer EFAULT or
       EINVAL rather than dressing a caller bug up as a policy refusal. */
    if (addr == NULL || addrlen < (socklen_t)sizeof(addr->sa_family)) {
        return 1;
    }
    switch (addr->sa_family) {
        case AF_UNSPEC:  /* dissolves a datagram socket's association */
        case AF_UNIX:    /* UNO bridge, X11, D-Bus, CUPS */
        case AF_NETLINK: /* kernel-local, not a peer */
            return 1;
        case AF_INET: {
            if (addrlen < (socklen_t)sizeof(struct sockaddr_in)) {
                return 0;
            }
            uint32_t ip = ntohl(((const struct sockaddr_in *)addr)->sin_addr.s_addr);
            return (ip >> 24) == 127;
        }
        case AF_INET6: {
            if (addrlen < (socklen_t)sizeof(struct sockaddr_in6)) {
                return 0;
            }
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
            return 0;
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
    if (!is_allowed(addr, addrlen)) {
        errno = EACCES;
        return -1;
    }
    if (real_connect == NULL) {
        errno = ENOSYS; /* never call through a NULL pointer if dlsym failed */
        return -1;
    }
    return real_connect(sockfd, addr, addrlen);
}
