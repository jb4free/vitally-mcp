#!/bin/bash
set -euo pipefail

# Vitally MCP Installer for macOS
# Usage: bash install.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/jb4free/vitally-mcp.git"
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

print_step() { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
print_ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
print_warn() { echo -e "${YELLOW}  ! $1${NC}"; }
print_err()  { echo -e "${RED}  ✗ $1${NC}"; }

# ── macOS check ───────────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  print_err "This installer only supports macOS."
  exit 1
fi

echo -e "\n${BOLD}Vitally MCP Installer${NC}"
echo "────────────────────────────────────────"

# ── Homebrew ──────────────────────────────────────────────────────────────────

print_step "Checking for Homebrew"
if ! command -v brew &>/dev/null; then
  print_warn "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  print_ok "Homebrew installed"
else
  print_ok "Homebrew found: $(brew --version | head -1)"
fi

# Always eval shellenv so Homebrew's bin is on PATH for the rest of this
# script, regardless of whether brew was just installed or already present.
if [[ -f /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -f /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

# ── Node.js / npm ─────────────────────────────────────────────────────────────

print_step "Checking for Node.js"
if ! command -v node &>/dev/null; then
  print_warn "Node.js not found. Installing via Homebrew..."
  brew install node
  # Re-eval so the newly installed binary is found immediately.
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -f /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  print_ok "Node.js installed: $(node --version)"
else
  NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -lt 18 ]]; then
    print_warn "Node.js $(node --version) found but v18+ is required. Upgrading..."
    brew upgrade node || brew install node
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  print_ok "Node.js $(node --version)"
  print_ok "npm $(npm --version)"
fi

# ── Install directory ─────────────────────────────────────────────────────────

print_step "Choose install location"
DEFAULT_DIR="$HOME/vitally-mcp"
printf "  Install directory [%s]: " "$DEFAULT_DIR"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  print_warn "Directory already exists. Pulling latest changes..."
  git -C "$INSTALL_DIR" pull
  print_ok "Repository updated"
else
  if [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR")" ]]; then
    print_err "Directory '$INSTALL_DIR' already exists and is not empty. Choose a different path."
    exit 1
  fi
  print_step "Cloning repository"
  git clone "$REPO_URL" "$INSTALL_DIR"
  print_ok "Cloned to $INSTALL_DIR"
fi

# ── Install dependencies and build ───────────────────────────────────────────

print_step "Installing dependencies"
npm --prefix "$INSTALL_DIR" install
print_ok "Dependencies installed"

print_step "Building project"
npm --prefix "$INSTALL_DIR" run build
print_ok "Build complete"

# ── Gather API credentials ────────────────────────────────────────────────────

print_step "Vitally API configuration"
echo -e "  Find your API key and subdomain in Vitally under"
echo -e "  Settings → Integrations → REST API.\n"

while [[ -z "${VITALLY_API_KEY:-}" ]]; do
  printf "  API key: "
  read -r VITALLY_API_KEY
  if [[ -z "$VITALLY_API_KEY" ]]; then
    print_warn "API key cannot be empty."
  fi
done

while [[ -z "${VITALLY_API_SUBDOMAIN:-}" ]]; do
  printf "  Subdomain (e.g. 'acme' from acme.vitally.io): "
  read -r VITALLY_API_SUBDOMAIN
  if [[ -z "$VITALLY_API_SUBDOMAIN" ]]; then
    print_warn "Subdomain cannot be empty."
  fi
done

printf "  Data center — US or EU [US]: "
read -r VITALLY_DATA_CENTER
VITALLY_DATA_CENTER=$(echo "${VITALLY_DATA_CENTER:-US}" | tr '[:lower:]' '[:upper:]')
if [[ "$VITALLY_DATA_CENTER" != "US" && "$VITALLY_DATA_CENTER" != "EU" ]]; then
  print_warn "Unrecognised value '$VITALLY_DATA_CENTER', defaulting to US."
  VITALLY_DATA_CENTER="US"
fi

# ── Update Claude Desktop config ──────────────────────────────────────────────

print_step "Configuring Claude Desktop"

mkdir -p "$(dirname "$CLAUDE_CONFIG")"

python3 - <<PYEOF
import json, os

config_path = "$CLAUDE_CONFIG"
install_dir = "$INSTALL_DIR"
api_key     = "$VITALLY_API_KEY"
subdomain   = "$VITALLY_API_SUBDOMAIN"
data_center = "$VITALLY_DATA_CENTER"

if os.path.exists(config_path):
    try:
        with open(config_path) as f:
            config = json.load(f)
    except json.JSONDecodeError:
        print("  Warning: existing config is invalid JSON — backing up and starting fresh.")
        os.rename(config_path, config_path + ".bak")
        config = {}
else:
    config = {}

config.setdefault("mcpServers", {})

config["mcpServers"]["vitally"] = {
    "command": "node",
    "args": [
        "--experimental-modules",
        "--experimental-specifier-resolution=node",
        os.path.join(install_dir, "build", "index.js")
    ],
    "env": {
        "VITALLY_API_KEY": api_key,
        "VITALLY_API_SUBDOMAIN": subdomain,
        "VITALLY_DATA_CENTER": data_center
    }
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")

print("  Written to: " + config_path)
PYEOF

print_ok "Claude Desktop configured"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo "────────────────────────────────────────"
echo -e "  Installed to: ${BOLD}$INSTALL_DIR${NC}"
echo -e "  Config:       ${BOLD}$CLAUDE_CONFIG${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Open a new terminal tab so node and npm are on your PATH."
echo -e "     Or run:  source ~/.zprofile"
echo -e "  2. Fully quit and relaunch Claude Desktop (Cmd+Q, then reopen)."
echo -e "     Closing the window is not enough."
echo ""
