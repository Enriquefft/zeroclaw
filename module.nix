# ZeroClaw home-manager configuration
# Generates ~/.zeroclaw/config.toml, wires systemd service, and kapso-whatsapp bridge
{
  config,
  osConfig,
  pkgs,
  lib,
  inputs,
  ...
}:
let
  zeroclawPkg =
    inputs.zeroclaw.packages.${pkgs.stdenv.hostPlatform.system}.default.overrideAttrs
      (old: {
        src = inputs.zeroclaw;
        prePatch = ""; # web/dist already exists in full source (upstream packaging bug)
      });

  kapsoPackages = inputs.kapso-whatsapp-plugin.packages.${pkgs.stdenv.hostPlatform.system};

in
{
  imports = [
    inputs.kapso-whatsapp-plugin.homeManagerModules.default
  ];

  home.packages = [ zeroclawPkg ];

  # Config file — source is zeroclaw/config.toml (version-controlled), brave_api_key injected at activation
  home.activation.zeroclawConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD sed "s|@BRAVE_API_KEY@|$(cat ${osConfig.sops.secrets."zeroclaw/brave-api-key".path})|g" \
      /etc/nixos/zeroclaw/config.toml > "$HOME/.zeroclaw/config.toml"
  '';

  # Identity documents — direct symlinks via activation (avoids nix store hop blocking zeroclaw)
  home.activation.zeroclawDocuments = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    mkdir -p "$HOME/.zeroclaw/documents"
    for doc in IDENTITY SOUL AGENTS TOOLS USER LORE; do
      ln -sf "/etc/nixos/zeroclaw/documents/$doc.md" "$HOME/.zeroclaw/documents/$doc.md"
    done
    ln -sf "/etc/nixos/zeroclaw/documents/SOUL.md" "$HOME/.zeroclaw/workspace/SOUL.md"
    ln -sf "/etc/nixos/zeroclaw/documents/AGENTS.md" "$HOME/.zeroclaw/workspace/AGENTS.md"
  '';

  # Reference directory (DIR-04) — upstream-docs already symlinks to ~/Projects/zeroclaw/docs
  home.file.".zeroclaw/reference".source =
    config.lib.file.mkOutOfStoreSymlink "/etc/nixos/zeroclaw/reference";

  # Kapso WhatsApp bridge
  services.kapso-whatsapp = {
    enable = true;
    package = kapsoPackages.bridge;
    cliPackage = kapsoPackages.cli;

    delivery.mode = "tailscale";

    gateway = {
      type = "zeroclaw";
      url = "ws://127.0.0.1:42617/ws/chat";
    };

    security = {
      mode = "allowlist";
      roles = {
        owner = [
          "+51926689401"
          "+51984089340"
          "+51917443156"
          "+51984938682"
        ];
      };
      sessionIsolation = true;
    };

    transcribe = {
      provider = "local";
      binaryPath = "/run/current-system/sw/bin/whisper-cli";
      modelPath = "/home/hybridz/ggml-base.bin";
      language = "es";
    };

    secrets = {
      apiKeyFile = "/run/secrets/zeroclaw/kapso-api-key";
      phoneNumberIdFile = "/run/secrets/zeroclaw/kapso-phone-number-id";
      gatewayTokenFile = "/run/secrets/zeroclaw/gateway-token";
      webhookVerifyTokenFile = "/run/secrets/zeroclaw/kapso-webhook-verify-token";
    };

    commands = {
      prefix = "!";
      definitions = {
        reload = {
          type        = "shell";
          description = "Reload ZeroClaw context (restarts gateway + bridge)";
          shell       = "systemctl --user restart zeroclaw-gateway";
          ack         = "Reloading — send a message in ~5 seconds.";
          roles       = [ "owner" ];
        };
        status = {
          type        = "shell";
          description = "Check ZeroClaw and bridge service status";
          shell       = "systemctl --user status zeroclaw-gateway kapso-whatsapp-bridge --no-pager -l 2>&1 | head -40";
          roles       = [ "owner" ];
        };
      };
    };
  };

  # Systemd user service for zeroclaw gateway
  systemd.user.services.zeroclaw-gateway = {
    Unit = {
      Description = "ZeroClaw Gateway";
      After = [ "network-online.target" ];
      Wants = [ "kapso-whatsapp-bridge.service" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${zeroclawPkg}/bin/zeroclaw daemon";
      Restart = "on-failure";
      RestartSec = 5;
      EnvironmentFile = [ "/run/secrets/rendered/zeroclaw.env" ];
    };
    Install = {
      WantedBy = [ "default.target" ];
    };
  };

  # Bridge follows gateway lifecycle
  systemd.user.services.kapso-whatsapp-bridge.Unit.PartOf = [ "zeroclaw-gateway.service" ];
  systemd.user.services.kapso-whatsapp-bridge.Service.RestartSec = 3;
  systemd.user.services.kapso-whatsapp-bridge.Unit.StartLimitIntervalSec = 60;
  systemd.user.services.kapso-whatsapp-bridge.Unit.StartLimitBurst = 10;
}
