#!/usr/bin/env bash
# End-to-end verification of Asymptote build pipeline
set -u
ASY="${ASY:-asy}"
TESTDIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0

ok()   { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1"; }

check() {
  local label="$1"
  shift
  if "$@" 2>/dev/null; then ok "$label"; else fail "$label"; fi
}

echo "=== Asymptote Workshop — Build Verification ==="
echo ""

# 1. CLI exists
echo "--- System ---"
check "asy is installed" test -x "$(command -v "$ASY")"

# 2. Good file → SVG
echo "--- Good file ---"
cd "$TESTDIR"
rm -f good.svg
"$ASY" -f svg good.asy
check "good.svg was created" test -f good.svg
check "good.svg is not empty" test -s good.svg
check "good.svg contains <svg" grep -q '<svg' good.svg
check "good.svg has viewBox" grep -q 'viewBox' good.svg

# 3. Error file → stderr
echo "--- Error file ---"
rm -f error.svg
ERR=$("$ASY" -f svg error.asy 2>&1) && true
check "error.svg NOT created" test ! -f error.svg
check "error output non-empty" test -n "$ERR"
check "error contains line:col" grep -qE '^[a-zA-Z.]+:[0-9]+\.[0-9]+:' <<< "$ERR"

# 4. SVG output is valid for webview
echo "--- SVG preview compatibility ---"
SVG=$(cat good.svg)
check "SVG starts with <svg or <?xml" grep -qE '^(<\?xml|<svg)' good.svg
check "SVG is self-closing" grep -q '</svg>' good.svg

echo ""
echo "=== $PASS passed, $FAIL failed ==="
exit $FAIL
