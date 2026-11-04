#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>

static int mismatches = 0;

static void expect(const char *name, int domain, int type,
                   const struct sockaddr *sa, socklen_t len, int want_refused) {
    int fd = socket(domain, type, 0);
    if (fd < 0) {
        int socket_error = errno;
        if ((domain == AF_INET6 && socket_error == EAFNOSUPPORT) ||
            (domain == AF_NETLINK &&
             (socket_error == EAFNOSUPPORT || socket_error == EPERM))) {
            printf("SKIP %-22s socket: %s\n", name, strerror(socket_error));
            return;
        }
        printf("FAIL %-22s socket: %s\n", name, strerror(socket_error));
        mismatches++;
        return;
    }
    errno = 0;
    int rc = connect(fd, sa, len);
    int refused = (rc < 0 && errno == EACCES);
    printf("%s %-22s rc=%d errno=%s\n", refused == want_refused ? "ok  " : "FAIL",
           name, rc, rc < 0 ? strerror(errno) : "-");
    mismatches += (refused != want_refused);
    close(fd);
}

int main(void) {
    struct sockaddr_un un = {0};
    un.sun_family = AF_UNIX;
    strcpy(un.sun_path, "/nonexistent.sock");
    expect("af_unix", AF_UNIX, SOCK_STREAM, (struct sockaddr *)&un, sizeof un, 0);

    struct sockaddr_in v4 = {0};
    v4.sin_family = AF_INET;
    v4.sin_port = htons(9);
    v4.sin_addr.s_addr = htonl(0x7f000001);
    expect("v4_loopback", AF_INET, SOCK_DGRAM, (struct sockaddr *)&v4, sizeof v4, 0);
    expect("v4_short_addrlen", AF_INET, SOCK_DGRAM, (struct sockaddr *)&v4, 12, 1);
    v4.sin_addr.s_addr = htonl(0xc0000201);
    expect("v4_external", AF_INET, SOCK_DGRAM, (struct sockaddr *)&v4, sizeof v4, 1);

    struct sockaddr_in6 v6 = {0};
    v6.sin6_family = AF_INET6;
    v6.sin6_port = htons(9);
    v6.sin6_addr.s6_addr[15] = 1;
    expect("v6_loopback", AF_INET6, SOCK_DGRAM, (struct sockaddr *)&v6, sizeof v6, 0);
    v6.sin6_addr.s6_addr[0] = 0x20;
    v6.sin6_addr.s6_addr[1] = 0x01;
    v6.sin6_addr.s6_addr[2] = 0x0d;
    v6.sin6_addr.s6_addr[3] = 0xb8;
    expect("v6_external", AF_INET6, SOCK_DGRAM, (struct sockaddr *)&v6, sizeof v6, 1);

    struct sockaddr_storage other = {0};
    other.ss_family = AF_NETLINK;
    expect("af_netlink", AF_NETLINK, SOCK_RAW, (struct sockaddr *)&other, 12, 0);
    other.ss_family = AF_UNSPEC;
    expect("af_unspec", AF_INET, SOCK_DGRAM, (struct sockaddr *)&other, sizeof(struct sockaddr), 0);
    other.ss_family = AF_PACKET;
    expect("af_packet", AF_INET, SOCK_DGRAM, (struct sockaddr *)&other, sizeof other, 1);
    other.ss_family = 40;
    expect("af_vsock", AF_INET, SOCK_DGRAM, (struct sockaddr *)&other, sizeof other, 1);

    expect("null_addr", AF_INET, SOCK_DGRAM, NULL, sizeof(struct sockaddr_in), 0);

    return mismatches != 0;
}
