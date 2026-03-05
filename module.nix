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

  # Config template — full config visible and version-controlled here.
  # brave_api_key is the only secret; it's injected at activation time from the sops-decrypted file.
  configTemplate = pkgs.writeText "zeroclaw-config-template.toml" ''
    # ZeroClaw configuration — managed by NixOS, do not edit manually
    default_provider = "zai-coding"
    default_model = "glm-5"
    default_temperature = 0.7

    [model_providers.zai]
    base_url = "https://api.z.ai/api/paas/v4"
    wire_api = "chat_completions"

    [model_providers.zai-coding]
    base_url = "https://api.z.ai/api/coding/paas/v4"
    wire_api = "chat_completions"

    [identity]
    format = "openclaw"

    [gateway]
    port = 42617
    host = "127.0.0.1"
    require_pairing = false

    [browser]
    enabled = true
    browser_open = "chrome"
    native_chrome_path = "/run/current-system/sw/bin/kiro-browser"

    [web_search]
    enabled = true
    provider = "brave"
    brave_api_key = "@BRAVE_API_KEY@"

    [channels_config]
    cli = true

    [autonomy]
    level = "supervised"
    workspace_only = false
    max_actions_per_hour = 9999
    max_cost_per_day_cents = 500
    allowed_roots = ["/etc/nixos/", "~/Projects/", "~/.zeroclaw/documents/"]
    allowed_commands = [
      "git", "nix", "nixos-rebuild", "systemctl", "journalctl",
      "zeroclaw", "gpush", "gcommit", "gh", "cargo",
      "node", "bun", "npm", "python3", "bash", "sh",
      "ls", "cat", "grep", "find", "cp", "mv", "rm",
      "mkdir", "chmod", "chown", "curl", "wget", "jq",
      "direnv", "sudo"
    ]
    forbidden_paths = [
      "/root", "/usr", "/bin", "/sbin", "/lib", "/opt",
      "/boot", "/dev", "/proc", "/sys", "/var", "/tmp",
      "~/.ssh", "~/.gnupg", "~/.aws", "~/.config"
    ]
    non_cli_excluded_tools = [
      "shell",
      "file_write",
      "file_edit",
      "git_operations",
      "browser",
      "browser_open",
      "http_request",
      "schedule",
      "memory_store",
      "memory_forget",
      "proxy_config",
      "model_routing_config",
      "pushover",
      "composio",
      "delegate",
      "screenshot",
      "image_info"
    ]

    [memory]
    backend = "sqlite"
    auto_save = true

    [observability]
    backend = "none"
    runtime_trace_mode = "rolling"
    runtime_trace_max_entries = 200

    [agent]
    max_tool_iterations = 40
    max_history_messages = 100

    [agents_ipc]
    enabled = true
    db_path = "~/.zeroclaw/agents.db"
    staleness_secs = 300
  '';

in
{
  imports = [
    inputs.kapso-whatsapp-plugin.homeManagerModules.default
  ];

  home.packages = [ zeroclawPkg ];

  # Config file — template is in the Nix store (version-controlled above), brave_api_key injected at activation
  home.activation.zeroclawConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD sed "s|@BRAVE_API_KEY@|$(cat ${osConfig.sops.secrets."zeroclaw/brave-api-key".path})|g" \
      ${configTemplate} > "$HOME/.zeroclaw/config.toml"
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
