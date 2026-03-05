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

  # cron-sync: reconciles zeroclaw/cron/jobs/*.yaml → ZeroClaw SQLite via CLI.
  # Uses zeroclawPkg in runtimeInputs so the real binary is found first inside the script,
  # bypassing the wrapper that blocks direct cron management for interactive users.
  cronSync = pkgs.writeShellApplication {
    name = "cron-sync";
    runtimeInputs = [ zeroclawPkg pkgs.yq-go pkgs.sqlite pkgs.coreutils ];
    text = ''
      JOBS_DIR="/etc/nixos/zeroclaw/cron/jobs"
      DB="$HOME/.zeroclaw/workspace/cron/jobs.db"
      DRY_RUN=false
      REMOVE_MISSING=false

      for arg in "$@"; do
        case "$arg" in
          --dry-run) DRY_RUN=true ;;
          --remove-missing) REMOVE_MISSING=true ;;
          -h|--help)
            echo "Usage: cron-sync [--dry-run] [--remove-missing]"
            echo ""
            echo "Syncs YAML job definitions in $JOBS_DIR to ZeroClaw cron scheduler."
            echo "YAML files are the source of truth — edit them, then run this or rebuild."
            echo ""
            echo "  --dry-run          Show what would change without applying"
            echo "  --remove-missing   Remove jobs not in YAML (including unnamed/ad-hoc jobs)"
            exit 0
            ;;
        esac
      done

      q() { sqlite3 "$DB" "$1"; }

      added=0; updated=0; unchanged=0; removed=0
      declare -A YAML_NAMES

      for yaml_file in "$JOBS_DIR"/*.yaml; do
        [[ -f "$yaml_file" ]] || continue

        name=$(yq -r '.name' "$yaml_file")
        schedule=$(yq -r '.schedule' "$yaml_file")
        tz=$(yq -r '.tz // ""' "$yaml_file")
        command=$(yq -r '.command' "$yaml_file")

        YAML_NAMES["$name"]=1

        name_escaped=$(printf '%s' "$name" | sed "s/'/''''/g")
        existing_id=$(q "SELECT id FROM cron_jobs WHERE name='$name_escaped' LIMIT 1")

        if [[ -z "$existing_id" ]]; then
          if $DRY_RUN; then
            echo "ADD: $name ($schedule''${tz:+, $tz})"
          else
            if [[ -n "$tz" ]]; then
              zeroclaw cron add "$schedule" "$command" --tz "$tz" > /dev/null
            else
              zeroclaw cron add "$schedule" "$command" > /dev/null
            fi
            new_id=$(q "SELECT id FROM cron_jobs ORDER BY created_at DESC LIMIT 1")
            zeroclaw cron update "$new_id" --name "$name" > /dev/null
            echo "Added: $name"
          fi
          added=$((added + 1))
        else
          current_expr=$(q "SELECT expression FROM cron_jobs WHERE id='$existing_id'")
          current_tz=$(q "SELECT json_extract(schedule,'$.tz') FROM cron_jobs WHERE id='$existing_id'")
          current_tz="''${current_tz:-}"
          raw_cmd=$(q "SELECT command FROM cron_jobs WHERE id='$existing_id'")
          if [[ -z "$raw_cmd" ]]; then
            current_cmd=$(q "SELECT prompt FROM cron_jobs WHERE id='$existing_id'")
          else
            current_cmd="$raw_cmd"
          fi
          current_cmd="''${current_cmd:-}"
          command_trimmed=$(printf '%s' "$command" | sed 's/[[:space:]]*$//')

          update_args=()
          [[ "$schedule" != "$current_expr" ]]         && update_args+=(--expression "$schedule")
          [[ "$tz" != "$current_tz" ]]                 && update_args+=(--tz "$tz")
          [[ "$command_trimmed" != "$current_cmd" ]]   && update_args+=(--command "$command")

          if [[ ''${#update_args[@]} -gt 0 ]]; then
            if $DRY_RUN; then
              echo "UPDATE: $name"
            else
              zeroclaw cron update "$existing_id" "''${update_args[@]}" > /dev/null
              echo "Updated: $name"
            fi
            updated=$((updated + 1))
          else
            unchanged=$((unchanged + 1))
          fi
        fi
      done

      if $REMOVE_MISSING; then
        while IFS='|' read -r id db_name; do
          [[ -z "$db_name" ]] && continue
          if [[ -z "''${YAML_NAMES[$db_name]:-}" ]]; then
            if $DRY_RUN; then
              echo "REMOVE: $db_name ($id)"
            else
              zeroclaw cron remove "$id" > /dev/null
              echo "Removed: $db_name"
            fi
            removed=$((removed + 1))
          fi
        done < <(q "SELECT id, name FROM cron_jobs WHERE name IS NOT NULL AND length(name) > 0")

        while IFS= read -r id; do
          [[ -z "$id" ]] && continue
          if $DRY_RUN; then
            echo "REMOVE (unnamed): $id"
          else
            zeroclaw cron remove "$id" > /dev/null
            echo "Removed unnamed job: $id"
          fi
          removed=$((removed + 1))
        done < <(q "SELECT id FROM cron_jobs WHERE name IS NULL OR length(name) = 0")
      fi

      echo ""
      echo "Sync complete: $added added, $updated updated, $unchanged unchanged, $removed removed"
    '';
  };

  # Wrapper that enforces declarative cron management — blocks direct cron add/remove/update
  zeroclawWrapper = pkgs.writeShellApplication {
    name = "zeroclaw";
    text = ''
      if [[ "''${1:-}" == "cron" ]] && [[ "''${2:-}" =~ ^(add|remove|update)$ ]]; then
        echo "ERROR: Direct cron management is disabled." >&2
        echo "Edit YAML files in /etc/nixos/zeroclaw/cron/jobs/ and run 'cron-sync'" >&2
        echo "or 'sudo nixos-rebuild switch ...' to auto-apply on next rebuild." >&2
        exit 1
      fi
      exec ${zeroclawPkg}/bin/zeroclaw "$@"
    '';
  };

  kapsoPackages = inputs.kapso-whatsapp-plugin.packages.${pkgs.stdenv.hostPlatform.system};

in
{
  imports = [
    inputs.kapso-whatsapp-plugin.homeManagerModules.default
  ];

  home.packages = [ zeroclawWrapper cronSync ];

  # Config file — source is zeroclaw/config.toml (version-controlled), brave_api_key injected at activation
  home.activation.zeroclawConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD rm -f "$HOME/.zeroclaw/config.toml"
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

  # Cron sync — reconciles SQLite to YAML files on every rebuild (source of truth = git)
  home.activation.zeroclawCronSync = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if compgen -G "/etc/nixos/zeroclaw/cron/jobs/*.yaml" > /dev/null 2>&1; then
      $DRY_RUN_CMD ${cronSync}/bin/cron-sync --remove-missing
    fi
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
      After = [ "network-online.target" "chromedriver.service" ];
      Wants = [ "kapso-whatsapp-bridge.service" "chromedriver.service" ];
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

  # ChromeDriver for headless browser automation (rust_native backend)
  systemd.user.services.chromedriver = {
    Unit = {
      Description = "ChromeDriver WebDriver server";
      PartOf = [ "zeroclaw-gateway.service" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.chromedriver}/bin/chromedriver --port=9515";
      Restart = "on-failure";
      RestartSec = 3;
    };
  };
}
