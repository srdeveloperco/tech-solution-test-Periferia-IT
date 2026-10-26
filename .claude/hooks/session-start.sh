#!/bin/bash
# SessionStart: en sesiones cloud de Claude Code deja listo el entorno (bun + dependencias).
# Idempotente y no interactivo. En local no hace nada.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

BUN_VERSION="1.4.4"
if ! command -v bun >/dev/null 2>&1; then
  if [ ! -x "$HOME/.bun/bin/bun" ]; then
    installer="$(mktemp)"
    curl -fsSL https://bun.sh/install -o "$installer"
    bash "$installer" "bun-v${BUN_VERSION}" >/dev/null
    rm -f "$installer"
  fi
  export PATH="$HOME/.bun/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$HOME/.bun/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

# `bun install` (no --frozen-lockfile) aprovecha la caché del contenedor entre sesiones.
bun install >/dev/null
echo "Entorno listo: bun $(bun --version), dependencias instaladas."
