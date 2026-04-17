# manifests/nix/default.nix
# Nix expression for the Stirling-PDF desktop application.
#
# The desktop app (frontend/src/desktop/) is proprietary software.
# License: https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
# Copyright (c) 2025 Stirling PDF Inc
#
# To install this package you must set `nixpkgs.config.allowUnfree = true`
# (or `allowUnfreePredicate`) in your NixOS configuration / nix.conf.
#
# Usage (standalone):
#   nix-env -i -f manifests/nix/default.nix

{ lib
, stdenv
, fetchurl
, autoPatchelfHook
, dpkg
, libGL
, libX11
, libXext
, libXrender
, libXtst
, libxcb
, alsa-lib
, gtk3
, nss
, nspr
, cups
, dbus
, expat
, at-spi2-atk
, at-spi2-core
, atk
, cairo
, pango
, gdk-pixbuf
, glib
, udev
, version ? "latest"
, sha256 ? lib.fakeSha256
}:

stdenv.mkDerivation rec {
  pname = "stirling-pdf";
  inherit version;

  src = fetchurl {
    url = "https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v${version}/stirling-pdf_${version}_amd64.deb";
    inherit sha256;
  };

  nativeBuildInputs = [ autoPatchelfHook dpkg ];

  buildInputs = [
    libGL
    libX11
    libXext
    libXrender
    libXtst
    libxcb
    alsa-lib
    gtk3
    nss
    nspr
    cups
    dbus
    expat
    at-spi2-atk
    at-spi2-core
    atk
    cairo
    pango
    gdk-pixbuf
    glib
    udev
  ];

  unpackPhase = ''
    dpkg-deb -x $src .
  '';

  installPhase = ''
    mkdir -p $out
    cp -r usr/. $out/
    # Fix desktop file if present
    if [ -d $out/share/applications ]; then
      substituteInPlace $out/share/applications/stirling-pdf.desktop \
        --replace "/usr/bin/" "$out/bin/" 2>/dev/null || true
    fi
  '';

  meta = with lib; {
    description = "Locally hosted web-based PDF manipulation tool — desktop app";
    longDescription = ''
      Stirling-PDF is a powerful, privacy-first PDF tool you host yourself.
      This package provides the desktop (Tauri) application.
      The desktop application is proprietary software.
    '';
    homepage = "https://www.stirling.com";
    license = licenses.unfree;
    # Full license text: https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
    maintainers = [ ];
    platforms = [ "x86_64-linux" ];
    sourceProvenance = [ sourceTypes.binaryNativeCode ];
  };
}
