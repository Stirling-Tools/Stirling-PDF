# manifests/nix/server.nix
# Nix expression for the Stirling-PDF server JAR.
#
# License: MIT core + proprietary carve-outs (open-core).
# The packaged JAR may include proprietary code from engine/, frontend/src/proprietary/,
# or similar directories. SPDX: MIT AND LicenseRef-Stirling-PDF-Proprietary.
# Full license: https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
# Copyright (c) 2025 Stirling PDF Inc
#
# Usage (standalone):
#   nix-env -i -f manifests/nix/server.nix

{ lib
, stdenv
, fetchurl
, makeWrapper
, jre_headless
, version ? "latest"
, sha256 ? lib.fakeSha256
}:

stdenv.mkDerivation rec {
  pname = "stirling-pdf-server";
  inherit version;

  src = fetchurl {
    url = "https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v${version}/Stirling-PDF-${version}.jar";
    inherit sha256;
  };

  dontUnpack = true;

  nativeBuildInputs = [ makeWrapper ];
  buildInputs = [ jre_headless ];

  installPhase = ''
    mkdir -p $out/{bin,share/stirling-pdf}
    cp $src $out/share/stirling-pdf/stirling-pdf.jar

    makeWrapper ${jre_headless}/bin/java $out/bin/stirling-pdf \
      --add-flags "-jar $out/share/stirling-pdf/stirling-pdf.jar" \
      --set JAVA_OPTS "-Xmx512m" \
      --chdir "$HOME"
  '';

  meta = with lib; {
    description = "Locally hosted web-based PDF manipulation tool — server";
    longDescription = ''
      Stirling-PDF is a powerful, privacy-first PDF tool you host yourself.
      This package provides the Spring Boot server JAR. Once running, access
      the UI at http://localhost:8080.
    '';
    homepage = "https://www.stirling.com";
    # Open-core: MIT with proprietary carve-outs in the packaged JAR.
    license = with licenses; [ mit unfree ];
    # Full license text: https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
    maintainers = [ ];
    platforms = platforms.all;
    mainProgram = "stirling-pdf";
    sourceProvenance = [ sourceTypes.binaryBytecode ];
  };
}
