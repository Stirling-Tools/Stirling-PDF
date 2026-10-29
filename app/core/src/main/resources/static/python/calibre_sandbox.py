"""Runs a command confined to one working directory with Landlock and seccomp.

Linux only (5.13+). Where the sandbox cannot be applied, including every non-Linux host, it exits
125 instead of running the command unconfined.
"""

import ctypes
import errno
import os
import platform
import stat
import struct
import sys

READ_ONLY = (
    "/opt/calibre",
    "/usr",
    "/bin",
    "/lib",
    "/lib64",
    "/etc/fonts",
    "/etc/ld.so.cache",
    "/etc/localtime",
    "/etc/mime.types",
    "/etc/passwd",
    "/etc/nsswitch.conf",
    "/etc/locale.alias",
    "/var/cache/fontconfig",
    "/proc",
    "/sys/devices/system/cpu",
)
READ_WRITE = ("/dev",)

NR_LANDLOCK_CREATE_RULESET = 444
NR_LANDLOCK_ADD_RULE = 445
NR_LANDLOCK_RESTRICT_SELF = 446
LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1
ACCESS_FS_EXECUTE = 1 << 0
ACCESS_FS_WRITE_FILE = 1 << 1
ACCESS_FS_READ_FILE = 1 << 2
ACCESS_FS_READ_DIR = 1 << 3
ACCESS_FS_ABI_1 = (1 << 13) - 1
ACCESS_FS_REFER = 1 << 13
ACCESS_FS_TRUNCATE = 1 << 14
ACCESS_FS_IOCTL_DEV = 1 << 15
ACCESS_NET_BIND_TCP = 1 << 0
ACCESS_NET_CONNECT_TCP = 1 << 1
SCOPE_ABSTRACT_UNIX_SOCKET = 1 << 0
SCOPE_SIGNAL = 1 << 1
ACCESS_RO = ACCESS_FS_EXECUTE | ACCESS_FS_READ_FILE | ACCESS_FS_READ_DIR
ACCESS_FILE = ACCESS_FS_EXECUTE | ACCESS_FS_WRITE_FILE | ACCESS_FS_READ_FILE | ACCESS_FS_TRUNCATE | ACCESS_FS_IOCTL_DEV

PR_SET_SECCOMP = 22
PR_SET_NO_NEW_PRIVS = 38
SECCOMP_MODE_FILTER = 2
SECCOMP_RET_KILL_PROCESS = 0x80000000
SECCOMP_RET_ERRNO = 0x00050000
SECCOMP_RET_ALLOW = 0x7FFF0000
X32_SYSCALL_BIT = 0x40000000
AF_UNIX = 1
BPF_LD_W_ABS = 0x20
BPF_JEQ_K = 0x15
BPF_JGE_K = 0x35
BPF_RET_K = 0x06
ARCHITECTURES = {
    "x86_64": {
        "audit_arch": 0xC000003E,
        "socket": 41,
        "socketpair": 53,
        "ptrace": 101,
        "process_vm_readv": 310,
        "process_vm_writev": 311,
    },
    "aarch64": {
        "audit_arch": 0xC00000B7,
        "socket": 198,
        "socketpair": 199,
        "ptrace": 117,
        "process_vm_readv": 270,
        "process_vm_writev": 271,
    },
}
NR_IO_URING_SETUP, NR_IO_URING_ENTER, NR_IO_URING_REGISTER = 425, 426, 427

LINUX = sys.platform.startswith("linux")
libc = ctypes.CDLL(None, use_errno=True) if LINUX else None


class RulesetAttr(ctypes.Structure):
    _fields_ = [
        ("handled_access_fs", ctypes.c_uint64),
        ("handled_access_net", ctypes.c_uint64),
        ("scoped", ctypes.c_uint64),
    ]


class PathBeneathAttr(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


class SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.c_char_p)]


def call(function, *args):
    args = [ctypes.c_long(arg) if isinstance(arg, int) else arg for arg in args]
    result = function(*args)
    if result < 0:
        raise OSError(ctypes.get_errno(), os.strerror(ctypes.get_errno()))
    return result


def allow(ruleset, path, access):
    try:
        parent = os.open(path, os.O_PATH | os.O_CLOEXEC)
    except OSError:
        return
    try:
        if not stat.S_ISDIR(os.fstat(parent).st_mode):
            access &= ACCESS_FILE
        rule = PathBeneathAttr(access, parent)
        call(
            libc.syscall,
            NR_LANDLOCK_ADD_RULE,
            ruleset,
            LANDLOCK_RULE_PATH_BENEATH,
            ctypes.byref(rule),
            0,
        )
    finally:
        os.close(parent)


def confine_file_system(work_dir):
    try:
        abi = call(libc.syscall, NR_LANDLOCK_CREATE_RULESET, None, 0, LANDLOCK_CREATE_RULESET_VERSION)
    except OSError:
        return 0
    access = ACCESS_FS_ABI_1
    if abi >= 2:
        access |= ACCESS_FS_REFER
    if abi >= 3:
        access |= ACCESS_FS_TRUNCATE
    if abi >= 5:
        access |= ACCESS_FS_IOCTL_DEV
    attr = RulesetAttr(access, 0, 0)
    size = ctypes.sizeof(ctypes.c_uint64)
    if abi >= 4:
        attr.handled_access_net = ACCESS_NET_BIND_TCP | ACCESS_NET_CONNECT_TCP
        size = 2 * ctypes.sizeof(ctypes.c_uint64)
    if abi >= 6:
        attr.scoped = SCOPE_ABSTRACT_UNIX_SOCKET | SCOPE_SIGNAL
        size = ctypes.sizeof(attr)
    ruleset = call(libc.syscall, NR_LANDLOCK_CREATE_RULESET, ctypes.byref(attr), size, 0)
    try:
        for path in READ_ONLY:
            allow(ruleset, path, ACCESS_RO)
        for path in (*READ_WRITE, work_dir):
            allow(ruleset, path, access)
        call(libc.syscall, NR_LANDLOCK_RESTRICT_SELF, ruleset, 0)
    finally:
        os.close(ruleset)
    return abi


def confine_network():
    if platform.machine() not in ARCHITECTURES:
        return False
    nr = ARCHITECTURES[platform.machine()]
    ld, jeq, jge, ret = BPF_LD_W_ABS, BPF_JEQ_K, BPF_JGE_K, BPF_RET_K
    program = [
        (ld, 0, 0, 4),
        (jeq, 1, 0, nr["audit_arch"]),
        (ret, 0, 0, SECCOMP_RET_KILL_PROCESS),
        (ld, 0, 0, 0),
        (jge, 0, 1, X32_SYSCALL_BIT),
        (ret, 0, 0, SECCOMP_RET_KILL_PROCESS),
        (jeq, 9, 0, nr["socket"]),
        (jeq, 8, 0, nr["socketpair"]),
        (jeq, 6, 0, NR_IO_URING_SETUP),
        (jeq, 5, 0, NR_IO_URING_ENTER),
        (jeq, 4, 0, NR_IO_URING_REGISTER),
        (jeq, 3, 0, nr["ptrace"]),
        (jeq, 2, 0, nr["process_vm_readv"]),
        (jeq, 1, 0, nr["process_vm_writev"]),
        (ret, 0, 0, SECCOMP_RET_ALLOW),
        (ret, 0, 0, SECCOMP_RET_ERRNO | errno.EPERM),
        (ld, 0, 0, 20),
        (jeq, 1, 0, 0),
        (ret, 0, 0, SECCOMP_RET_ERRNO | errno.EAFNOSUPPORT),
        (ld, 0, 0, 16),
        (jeq, 1, 0, AF_UNIX),
        (ret, 0, 0, SECCOMP_RET_ERRNO | errno.EAFNOSUPPORT),
        (ret, 0, 0, SECCOMP_RET_ALLOW),
    ]
    code = b"".join(struct.pack("HBBI", *instruction) for instruction in program)
    filter_program = SockFprog(len(program), code)
    try:
        call(libc.prctl, PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(filter_program), 0, 0)
    except OSError as e:
        if e.errno in (errno.ENOSYS, errno.EINVAL):
            return False
        raise
    return True


def main():
    if len(sys.argv) < 3:
        print("usage: calibre_sandbox.py <working directory> <command...>", file=sys.stderr)
        return 2
    work_dir, command = sys.argv[1], sys.argv[2:]

    if not LINUX:
        print("calibre-sandbox: Landlock and seccomp need Linux, refusing to run", file=sys.stderr)
        return 125

    call(libc.prctl, PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)
    if not confine_file_system(work_dir):
        print("calibre-sandbox: landlock unavailable, refusing to run", file=sys.stderr)
        return 125
    if not confine_network():
        print("calibre-sandbox: seccomp unavailable, refusing to run", file=sys.stderr)
        return 125
    os.execvp(command[0], command)


if __name__ == "__main__":
    sys.exit(main())
