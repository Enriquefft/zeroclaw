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
  # Build zeroclaw directly — upstream flake's packages.default is the Rust toolchain, not the binary
  zeroclawPkg = pkgs.rustPlatform.buildRustPackage {
    pname = "zeroclaw";
    version = "0.1.8";
    src = inputs.zeroclaw;
    cargoLock.lockFile = "${inputs.zeroclaw}/Cargo.lock";
    buildFeatures = [ "browser-native" ];
    doCheck = false;
    meta.mainProgram = "zeroclaw";
    patches = [
      ./patches/fix-screenshot-multimodal.patch
    ];
  };

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

      # Resolve bare binary names to full nix store paths.
      # The ZeroClaw daemon runs as a systemd service without the user's PATH,
      # so commands like "bun run ..." fail with "No such file or directory".
      # YAML stays readable; the registered command gets the absolute path.
      resolve_command() {
        local cmd="$1"
        cmd="''${cmd/#bun /${pkgs.bun}/bin/bun }"
        cmd="''${cmd/#node /${pkgs.nodejs}/bin/node }"
        cmd="''${cmd/#python3 /${pkgs.python3}/bin/python3 }"
        cmd="''${cmd/#claude /$HOME/.local/bin/claude }"
        printf '%s' "$cmd"
      }

      q() { sqlite3 "$DB" "$1"; }

      added=0; updated=0; unchanged=0; removed=0
      declare -A YAML_NAMES

      for yaml_file in "$JOBS_DIR"/*.yaml; do
        [[ -f "$yaml_file" ]] || continue

        name=$(yq -r '.name' "$yaml_file")
        schedule=$(yq -r '.schedule' "$yaml_file")
        tz=$(yq -r '.tz // ""' "$yaml_file")
        job_type=$(yq -r '.type // "shell"' "$yaml_file")

        if [[ "$job_type" == "agent" ]]; then
          # Agent job: auto-generate command from orchestrate.ts + yaml path
          # User writes goal/steps/notify in YAML, NOT a command field
          command="${pkgs.bun}/bin/bun run /etc/nixos/zeroclaw/bin/orchestrate.ts $(realpath "$yaml_file")"
        else
          # Shell job: existing behavior — read command from YAML and resolve
          command=$(resolve_command "$(yq -r '.command' "$yaml_file")")
        fi

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

  # Wrapper that enforces declarative management — blocks direct cron and external skill installs
  zeroclawWrapper = pkgs.writeShellApplication {
    name = "zeroclaw";
    text = ''
      if [[ "''${1:-}" == "cron" ]] && [[ "''${2:-}" =~ ^(add|remove|update)$ ]]; then
        echo "ERROR: Direct cron management is disabled." >&2
        echo "Edit YAML files in /etc/nixos/zeroclaw/cron/jobs/ and run 'cron-sync'" >&2
        echo "or 'sudo nixos-rebuild switch ...' to auto-apply on next rebuild." >&2
        exit 1
      fi
      if [[ "''${1:-}" == "skills" ]] && [[ "''${2:-}" == "install" ]]; then
        _source="''${3:-}"
        if [[ "$_source" != /etc/nixos/zeroclaw/skills/* ]] && \
           [[ "$_source" != ./skills/* ]]; then
          echo "ERROR: Skills must be installed from /etc/nixos/zeroclaw/skills/ only." >&2
          echo "Add the skill source to git first, then:" >&2
          echo "  zeroclaw skills install /etc/nixos/zeroclaw/skills/<name>" >&2
          exit 1
        fi
      fi
      exec ${zeroclawPkg}/bin/zeroclaw "$@"
    '';
  };

  # skills-sync: reconciles zeroclaw/skills/* → ZeroClaw workspace via CLI.
  # Uses zeroclawPkg in runtimeInputs so the real binary is found (bypasses wrapper).
  skillsSync = pkgs.writeShellApplication {
    name = "skills-sync";
    runtimeInputs = [ zeroclawPkg pkgs.coreutils pkgs.gnused pkgs.python3 ];
    text = ''
      SKILLS_DIR="/etc/nixos/zeroclaw/skills"
      WORKSPACE="$HOME/.zeroclaw/workspace/skills"
      DRY_RUN=false
      REMOVE_MISSING=false

      for arg in "$@"; do
        case "$arg" in
          --dry-run) DRY_RUN=true ;;
          --remove-missing) REMOVE_MISSING=true ;;
          -h|--help)
            echo "Usage: skills-sync [--dry-run] [--remove-missing]"
            echo ""
            echo "Syncs skill directories in $SKILLS_DIR to ZeroClaw workspace."
            echo "Git is the source of truth — edit skills there, then run this or rebuild."
            echo ""
            echo "  --dry-run          Show what would change without applying"
            echo "  --remove-missing   Remove workspace skills not in git"
            exit 0
            ;;
        esac
      done

      mkdir -p "$WORKSPACE"

      # Clear download-policy aliases — prevents ZeroClaw from blocking local installs
      # of skills that were previously installed from skills.sh (find-skills, skill-creator)
      POLICY_FILE="$WORKSPACE/.download-policy.toml"
      if [[ -f "$POLICY_FILE" ]]; then
        printf 'version = 1\ntrusted_domains = []\nblocked_domains = []\n\n[aliases]\n' \
          > "$POLICY_FILE"
      fi

      declare -A GIT_SKILLS
      installed=0; removed=0

      for skill_dir in "$SKILLS_DIR"/*/; do
        [[ -d "$skill_dir" ]] || continue
        [[ -f "$skill_dir/SKILL.md" ]] || continue
        name=$(basename "$skill_dir")
        GIT_SKILLS["$name"]=1
        if $DRY_RUN; then
          echo "INSTALL: $name"
        else
          if zeroclaw skills audit "$skill_dir" > /dev/null 2>&1; then
            zeroclaw skills remove "$name" > /dev/null 2>&1 || true
            rm -rf "''${WORKSPACE:?}/$name"
            zeroclaw skills install "$skill_dir" > /dev/null 2>&1 || true
            echo "Installed: $name"
          else
            echo "Audit failed: $name (skipped)"
            continue
          fi
        fi
        installed=$((installed + 1))

        # Auto-whitelist cli_command from SKILL.toml into allowed_commands
        toml="$skill_dir/SKILL.toml"
        if [[ -f "$toml" ]]; then
          cli_cmd=$(grep -m1 '^cli_command' "$toml" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')
          if [[ -n "$cli_cmd" ]]; then
            config="$HOME/.zeroclaw/config.toml"
            if [[ -f "$config" ]] && ! grep -q "\"$cli_cmd\"" "$config"; then
              if $DRY_RUN; then
                echo "  → would add \"$cli_cmd\" to allowed_commands"
              else
                python3 - "$config" "$cli_cmd" <<'PYEOF'
import sys, re
path, cmd = sys.argv[1], sys.argv[2]
text = open(path).read()
# Insert cmd before the closing ] of the allowed_commands array
text = re.sub(
    r'(allowed_commands\s*=\s*\[.*?)(])',
    lambda m: m.group(1).rstrip() + f',\n  "{cmd}"\n]',
    text, count=1, flags=re.DOTALL
)
open(path, 'w').write(text)
PYEOF
                echo "  → added \"$cli_cmd\" to allowed_commands"
              fi
            fi
          fi
        fi
      done

      if $REMOVE_MISSING; then
        for installed_dir in "$WORKSPACE"/*/; do
          [[ -d "$installed_dir" ]] || continue
          name=$(basename "$installed_dir")
          if [[ -z "''${GIT_SKILLS[$name]:-}" ]]; then
            if $DRY_RUN; then
              echo "REMOVE: $name"
            else
              zeroclaw skills remove "$name" > /dev/null 2>&1 || true
              echo "Removed: $name"
            fi
            removed=$((removed + 1))
          fi
        done
      fi

      echo ""
      echo "Sync complete: $installed installed, $removed removed"
    '';
  };

  # Chrome wrapper: sets window class for Hyprland targeting, forces XWayland (wayland+Vulkan crashes renderer)
  zeroclawChrome = pkgs.writeShellApplication {
    name = "zeroclaw-chrome";
    text = ''
      exec ${pkgs.google-chrome}/bin/google-chrome-stable \
        --class=zeroclaw-browser \
        --ozone-platform=x11 \
        "$@"
    '';
  };

  kapsoPackages = inputs.kapso-whatsapp-plugin.packages.${pkgs.stdenv.hostPlatform.system};

in
{
  imports = [
    inputs.kapso-whatsapp-plugin.homeManagerModules.default
  ];

  home.packages = [ zeroclawWrapper cronSync skillsSync zeroclawChrome ];

  # Config file — source is zeroclaw/config.toml (version-controlled), secrets injected at activation
  home.activation.zeroclawConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD rm -f "$HOME/.zeroclaw/config.toml"
    $DRY_RUN_CMD sed \
      -e "s|@BRAVE_API_KEY@|$(cat ${osConfig.sops.secrets."zeroclaw/brave-api-key".path})|g" \
      -e "s|@ZAI_API_KEY@|$(cat ${osConfig.sops.secrets."zeroclaw/zai-api-key".path})|g" \
      -e "s|@ZEROCLAW_CHROME@|${zeroclawChrome}/bin/zeroclaw-chrome|g" \
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

  # Skills sync — reconciles workspace skills to git source on every rebuild
  home.activation.zeroclawSkillsSync = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if [[ -d "/etc/nixos/zeroclaw/skills" ]]; then
      $DRY_RUN_CMD ${skillsSync}/bin/skills-sync --remove-missing
    fi
  '';

  # Himalaya config — SpaceMail IMAP/SMTP (password read from SPACEMAIL_PASSWORD env at runtime)
  home.file.".config/himalaya/config.toml".text = ''
    [accounts.spacemail]
    email = "enriquefft@404tf.com"
    display-name = "Enrique"
    default = true

    [accounts.spacemail.backend]
    type = "imap"
    host = "mail.spacemail.com"
    port = 993
    login = "enriquefft@404tf.com"

    [accounts.spacemail.backend.encryption]
    type = "tls"

    [accounts.spacemail.backend.auth]
    type = "password"
    cmd = "printenv SPACEMAIL_PASSWORD"

    [accounts.spacemail.message.send.backend]
    type = "smtp"
    host = "mail.spacemail.com"
    port = 465
    login = "enriquefft@404tf.com"

    [accounts.spacemail.message.send.backend.encryption]
    type = "tls"

    [accounts.spacemail.message.send.backend.auth]
    type = "password"
    cmd = "printenv SPACEMAIL_PASSWORD"
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
      errorMessage = "Sorry, I'm having trouble right now. Please try again in a moment.";
      tracePath = "${config.home.homeDirectory}/.zeroclaw/workspace/state/runtime-trace.jsonl";
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
      After = [ "network-online.target" "chromedriver.service" "zai-proxy.service" ];
      Wants = [ "kapso-whatsapp-bridge.service" "chromedriver.service" "zai-proxy.service" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${zeroclawPkg}/bin/zeroclaw daemon";
      Restart = "on-failure";
      RestartSec = 5;
      EnvironmentFile = [ "/run/secrets/rendered/zeroclaw.env" ];
      Environment = [
        "PATH=${pkgs.bash}/bin:${pkgs.coreutils}/bin:${pkgs.bun}/bin:/run/current-system/sw/bin:/home/hybridz/.local/bin"
      ];
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

  # Z.AI tool_stream proxy — injects tool_stream=true into GLM-5 requests
  # Required for reliable tool calling (without it, glm-5 never generates tool calls)
  systemd.user.services.zai-proxy = {
    Unit = {
      Description = "Z.AI tool_stream proxy";
      PartOf = [ "zeroclaw-gateway.service" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.bun}/bin/bun run /etc/nixos/zeroclaw/bin/zai-proxy.ts";
      Environment = [
        "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
        "NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
      Restart = "on-failure";
      RestartSec = 3;
    };
  };

  # ChromeDriver for browser automation (rust_native backend, visible via XWayland)
  systemd.user.services.chromedriver = {
    Unit = {
      Description = "ChromeDriver WebDriver server";
      PartOf = [ "zeroclaw-gateway.service" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.chromedriver}/bin/chromedriver --port=9515";
      Environment = [ "DISPLAY=:0" ];
      Restart = "on-failure";
      RestartSec = 3;
    };
  };
}
