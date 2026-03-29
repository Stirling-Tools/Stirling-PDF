# Nix — Setup & Usage Guide

Two packages are available:

| Package | Description | License |
|---------|-------------|---------|
| `stirling-pdf-server` | Spring Boot server JAR | MIT |
| `stirling-pdf-desktop` | Tauri desktop app | Proprietary — requires `allowUnfree = true` |

---

## Quick start (Nix Flakes)

### Run the server without installing

```bash
nix run github:Stirling-Tools/Stirling-PDF
# Open http://localhost:8080
```

### Run the desktop app

```bash
# allowUnfree must be set — see below
nix run github:Stirling-Tools/Stirling-PDF#stirling-pdf-desktop
```

### Install into your profile

```bash
# Server
nix profile install github:Stirling-Tools/Stirling-PDF#stirling-pdf-server

# Desktop (unfree)
NIXPKGS_ALLOW_UNFREE=1 nix profile install \
  github:Stirling-Tools/Stirling-PDF#stirling-pdf-desktop \
  --impure
```

---

## NixOS module (system-wide)

Add to your `flake.nix`:

```nix
{
  inputs.stirling-pdf.url = "github:Stirling-Tools/Stirling-PDF";

  outputs = { self, nixpkgs, stirling-pdf }: {
    nixosConfigurations.mymachine = nixpkgs.lib.nixosSystem {
      modules = [
        {
          nixpkgs.config.allowUnfree = true;  # only if you want the desktop pkg

          environment.systemPackages = [
            stirling-pdf.packages.${system}.stirling-pdf-server
          ];

          # Optional: run as a systemd service
          systemd.services.stirling-pdf = {
            description = "Stirling-PDF server";
            after = [ "network.target" ];
            wantedBy = [ "multi-user.target" ];
            serviceConfig = {
              ExecStart = "${stirling-pdf.packages.${system}.stirling-pdf-server}/bin/stirling-pdf";
              Restart = "on-failure";
              DynamicUser = true;
              StateDirectory = "stirling-pdf";
              WorkingDirectory = "/var/lib/stirling-pdf";
            };
          };
        }
      ];
    };
  };
}
```

---

## Allowing unfree packages

The desktop app is proprietary. You need to permit unfree packages one of these ways:

**Option A — global (NixOS)**

```nix
nixpkgs.config.allowUnfree = true;
```

**Option B — global (nix.conf)**

```
# ~/.config/nix/nix.conf  or  /etc/nix/nix.conf
allow-unfree = true
```

**Option C — per-command**

```bash
NIXPKGS_ALLOW_UNFREE=1 nix run ... --impure
```

---

## Local development / standalone usage

Use the expressions directly without the flake:

```bash
# Server
nix-env -i -f manifests/nix/server.nix

# Desktop
nix-env -i -f manifests/nix/default.nix
```

You will need to supply the correct `version` and `sha256` values. Obtain the
sha256 with:

```bash
nix-prefetch-url https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v<version>/Stirling-PDF-<version>.jar
```

---

## Submitting to nixpkgs / NUR

### nixpkgs

1. Fork [NixOS/nixpkgs](https://github.com/NixOS/nixpkgs).
2. Add `pkgs/applications/misc/stirling-pdf/default.nix` based on
   `manifests/nix/server.nix`.
3. Open a PR following the [nixpkgs contribution guide](https://github.com/NixOS/nixpkgs/blob/master/CONTRIBUTING.md).

Note: proprietary / unfree packages are acceptable in nixpkgs under the
`nixpkgs.config.allowUnfree` mechanism — see the nixpkgs manual for `meta.license`.

### NUR (Nix User Repository)

1. Fork [nix-community/NUR](https://github.com/nix-community/NUR) or create
   your own NUR repo.
2. Add the flake as an input and expose the packages.
3. Users can then install via `nur.repos.<your-name>.stirling-pdf-server`.
