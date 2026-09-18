# Container runtime users

The embedded, backend, fat, and ultra-lite images support these launch modes:

| Configuration | Entrypoint | Java and converters |
| --- | --- | --- |
| Default | root | UID/GID 1000:1000 |
| `PUID=1002 PGID=1003` | root | UID/GID 1002:1003 |
| `PUID=0 PGID=0` | root | root |
| `--user 1000:1000` | UID/GID 1000:1000 | UID/GID 1000:1000 |
| `--user 12345:12346` with prepared writable mounts | UID/GID 12345:12346 | UID/GID 12345:12346 |

There is no separate root opt-in flag. When the entrypoint starts as root,
`PUID` and `PGID` select the application identity. When it starts as non-root,
Docker's effective UID, primary GID, and supplementary groups are authoritative;
the image's default `PUID`/`PGID` values are ignored. The UID need not have an
entry in `/etc/passwd`.

## Choose a mode

Normal startup prepares data ownership as root and launches the application as
1000:1000:

```sh
docker run --rm -p 8080:8080 stirling-pdf
```

Select another application identity, or select root explicitly:

```sh
docker run --rm -e PUID=1002 -e PGID=1003 -p 8080:8080 stirling-pdf
docker run --rm -e PUID=0 -e PGID=0 -p 8080:8080 stirling-pdf
```

Start the entire container as the default non-root identity:

```sh
docker run --rm --user 1000:1000 --cap-drop=ALL \
  --security-opt=no-new-privileges:true -p 8080:8080 stirling-pdf
```

`--user 0:0` alone still uses the default `PUID`/`PGID` to launch the application.
Set `PUID=0 PGID=0` to select root for the application too.

## Writable storage

The image prepares its built-in data directories for UID/GID 1000:1000. For a
different direct `--user`, or a read-only container filesystem, provide writable
mounts for:

- `/home/stirlingpdfuser` (or the directory selected by `HOME`)
- `/configs`, `/logs`, `/customFiles`, `/pipeline`, and `/storage`
- `/tmp`
- `/opt/stirling-engine/data` when using the fat image

Prepare the mounted directories with the selected UID/GID before starting a
non-root container. It cannot change ownership on your behalf. Existing files,
including a persisted database, must also be accessible to that identity.
Startup reports the exact unwritable directory and exits if preparation is
incomplete; it does not make the directory world-writable.

For named volumes, mount them with `volume-nocopy` after preparing ownership.
Otherwise Docker can copy the image directory's ownership back into an empty
volume. For example, to prepare a configs volume for UID/GID 12345:12346:

```sh
docker volume create stirling-configs
docker run --rm --user 0:0 --entrypoint sh \
  --mount type=volume,source=stirling-configs,target=/configs,volume-nocopy \
  stirling-pdf -c 'chown -R 12345:12346 /configs'
```

Use the same mount option on the application container, and prepare the other
data volumes similarly. Read-only data mounts are not suitable for these paths.

If `/tmp` is a tmpfs, include `exec`: PDFium and other native libraries are
extracted and loaded from Java's temporary directory. For example:

```sh
--tmpfs /tmp:rw,exec,uid=12345,gid=12346,mode=1777
```

Combining prepared data mounts, that tmpfs, `--user 12345:12346`, and
`--read-only` runs the application with a read-only image filesystem. The
image's code and scripts do not need writable mounts.

## Startup and optional features

Root startup needs `CHOWN`, `DAC_OVERRIDE`, and `FOWNER` to prepare mounted
storage, `SETUID`/`SETGID` to launch a different identity, and `KILL` for graceful
shutdown across that identity boundary. The supplied Compose files include
these capabilities. A container started directly as non-root can drop them all.

Invalid UID/GID values, failed remapping, and a missing `setpriv` executable are
startup errors when the requested identity cannot be applied. There is no
automatic fallback to a different application UID. Explicit root mode does
not need `setpriv` when its UID/GID already match the entrypoint.

Custom OCR languages mounted at `/usr/share/tessdata` are combined with bundled
languages through a temporary symlink directory. No writes to the system
tessdata directory are needed. An explicit `TESSDATA_PREFIX` takes precedence.

System package or font installation still needs an image build or a prepared
mount; selecting a non-root user does not grant permission to modify `/usr`.

## Run the integration checks

Build the desired image, install the test dependencies, and run:

```sh
python -m pip install -r testing/docker/requirements.txt
python testing/docker/test_runtime_users.py --image stirling-pdf
```

Use `--lite` for the ultra-lite image, and supply mode names to run a subset,
such as `direct1000 root`. `--output /path/to/results` preserves response files,
container logs, process identities, and the JSON result summary. Test containers
and volumes are removed after each case.
