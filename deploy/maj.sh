#!/usr/bin/env bash
#
# Met à jour le serveur de jeu déjà installé en service systemd.
#
#     ./deploy/maj.sh
#
# Le service n'est redémarré qu'en dernier, et seulement si la construction a
# réussi : une construction qui échoue laisse la partie en cours intacte plutôt
# que de la couper pour rien.

set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"

echo "── mise à jour du dépôt"
git pull --ff-only

echo "── dépendances"
bun install

echo "── construction"
bun run build

echo "── redémarrage du service"
sudo systemctl restart tanks
sleep 2
systemctl is-active --quiet tanks && echo "✓ tanks actif" || {
  echo "✗ le service n'a pas redémarré :"
  journalctl -u tanks -n 20 --no-pager
  exit 1
}
