#!/bin/bash
# Assembles the private Python the app ships with: build/python-<x64|arm64>/.
# The arm64 one is put together on any Mac by installing prebuilt packages for that chip.
set -euo pipefail
ARCH="${1:?usage: build-python-runtime.sh <x64|arm64>}"
PY_VERSION=3.12.16
PBS_TAG=20261110
VOXCPM_VERSION=2.0.3
cd "$(dirname "$0")/.."
case "$ARCH" in
  x64) TRIPLE=x86_64-apple-darwin ;;
  arm64) TRIPLE=aarch64-apple-darwin ;;
  *) echo "unknown arch $ARCH" >&2; exit 1 ;;
esac
OUT="build/python-$ARCH"
STAMP="$OUT/.built-$PY_VERSION-$PBS_TAG-$VOXCPM_VERSION-$(cat python/requirements-*.txt | shasum | cut -c1-12)"
if [ -f "$STAMP" ]; then echo "$OUT is up to date"; exit 0; fi
rm -rf "$OUT"; mkdir -p "$OUT"
curl -fsSL "https://github.com/astral-sh/python-build-standalone/releases/download/$PBS_TAG/cpython-$PY_VERSION+$PBS_TAG-$TRIPLE-install_only_stripped.tar.gz" | tar xz -C "$OUT" --strip-components=1
SITE="$OUT/lib/python3.12/site-packages"

# pip must run on this machine's chip; the packages it fetches are for the target chip.
HOST_ARCH=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)
if [ "$ARCH" = "$HOST_ARCH" ]; then
  PIP=("$OUT/bin/python3" -m pip install --no-warn-script-location --only-binary=:all:)
else
  [ -x "build/python-$HOST_ARCH/bin/python3" ] || "$0" "$HOST_ARCH"
  PLAT=$([ "$ARCH" = arm64 ] && echo arm64 || echo x86_64)
  PIP=("build/python-$HOST_ARCH/bin/python3" -m pip install --target "$SITE" --only-binary=:all: --python-version 3.12 --implementation cp --abi cp312 --abi abi3 --abi none)
  for v in 10_9 10_12 10_13 11_0 12_0; do PIP+=(--platform "macosx_${v}_${PLAT}" --platform "macosx_${v}_universal2"); done
fi
"${PIP[@]}" -r "python/requirements-$ARCH.txt"
"${PIP[@]}" --no-deps "voxcpm==$VOXCPM_VERSION"

# Trim what the app never uses.
rm -rf "$OUT/lib/python3.12/test" "$OUT/lib/python3.12/idlelib" "$OUT/lib/python3.12/tkinter" "$OUT/lib/python3.12/ensurepip" \
       "$OUT/lib/tcl"* "$OUT/lib/tk"* "$OUT/lib/itcl"* "$OUT/lib/thread"* "$OUT/share" \
       "$SITE/torch/include" "$SITE/torch/share" "$SITE/torch/test" "$SITE/bin"
find "$OUT" -name __pycache__ -type d -prune -exec rm -rf {} +
touch "$STAMP"
du -sh "$OUT"
