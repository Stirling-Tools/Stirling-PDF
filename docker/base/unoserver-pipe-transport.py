import pathlib
import sys

SERVER_OLD = (
    '        connection = (\n'
    '            "socket,host=%s,port=%s,tcpNoDelay=1;urp;StarOffice.ComponentContext"\n'
    '            % (self.uno_interface, self.uno_port)\n'
    '        )\n'
)
SERVER_NEW = (
    '        connection = (\n'
    '            "pipe,name=unoserver_%s;urp;StarOffice.ComponentContext"\n'
    '            % (self.uno_port,)\n'
    '        )\n'
)

CLIENT_OLD = (
    '            f"uno:socket,host={interface},port={port};urp;StarOffice.ComponentContext"\n'
)
CLIENT_NEW = (
    '            f"uno:pipe,name=unoserver_{port};urp;StarOffice.ComponentContext"\n'
)


def patch(path, old, new):
    target = pathlib.Path(path)
    text = target.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        sys.exit("unoserver pipe transport patch does not apply to %s" % path)
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: unoserver-pipe-transport.py <site-packages/unoserver>")
    base = pathlib.Path(sys.argv[1])
    patch(base / "server.py", SERVER_OLD, SERVER_NEW)
    patch(base / "converter.py", CLIENT_OLD, CLIENT_NEW)
    patch(base / "comparer.py", CLIENT_OLD, CLIENT_NEW)


if __name__ == "__main__":
    main()
