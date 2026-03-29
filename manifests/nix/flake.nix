{
  description = "Stirling-PDF — locally hosted web-based PDF manipulation tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ]
      (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            # The desktop package is proprietary — unfree must be allowed.
            config.allowUnfree = true;
          };

          # ---------------------------------------------------------------
          # Version and hashes — update on each release
          # ---------------------------------------------------------------
          version = "0.0.0"; # Replace with the actual release version

          # Run `nix-prefetch-url <url>` to obtain the correct sha256 values.
          serverSha256 = pkgs.lib.fakeSha256;
          desktopSha256 = pkgs.lib.fakeSha256;

          # ---------------------------------------------------------------
          # Package definitions
          # ---------------------------------------------------------------
          stirling-pdf-server = pkgs.callPackage ./server.nix {
            inherit version;
            sha256 = serverSha256;
          };

          stirling-pdf-desktop = pkgs.callPackage ./default.nix {
            inherit version;
            sha256 = desktopSha256;
          };
        in
        {
          # `nix build .#stirling-pdf-server`
          # `nix build .#stirling-pdf-desktop`
          packages = {
            stirling-pdf-server = stirling-pdf-server;
            stirling-pdf-desktop = stirling-pdf-desktop;
            default = stirling-pdf-server;
          };

          # `nix run github:Stirling-Tools/Stirling-PDF`
          apps = {
            stirling-pdf-server = flake-utils.lib.mkApp {
              drv = stirling-pdf-server;
              name = "stirling-pdf";
            };
            stirling-pdf-desktop = flake-utils.lib.mkApp {
              drv = stirling-pdf-desktop;
              name = "stirling-pdf";
            };
            default = flake-utils.lib.mkApp {
              drv = stirling-pdf-server;
              name = "stirling-pdf";
            };
          };
        }
      );
}
