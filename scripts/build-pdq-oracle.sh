#!/bin/sh
set -eu

REFERENCE_REPOSITORY="https://github.com/facebook/ThreatExchange.git"
REFERENCE_COMMIT="baefb4ed67b6cdc1d4c82dbaef858d50866ac424"
ORACLE_CXX="${PDQ_ORACLE_CXX:-c++}"

SCRIPT_DIRECTORY=$(CDPATH='' cd -P -- "$(dirname -- "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH='' cd -P -- "$SCRIPT_DIRECTORY/.." && pwd -P)
WRAPPER_SOURCE="$REPOSITORY_ROOT/tools/pdq-oracle/main.cpp"

OUTPUT_DIRECTORY=""
SOURCE_DIRECTORY=""

usage() {
  printf '%s\n' \
    "Usage: $0 --output <empty-directory> [--source <verified-checkout>]" \
    "" \
    "Without --source, the pinned ThreatExchange commit is fetched into the output directory." \
    "Set PDQ_ORACLE_CXX to override the default C++ compiler."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      shift
      ;;
    --output)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      OUTPUT_DIRECTORY=$2
      shift 2
      ;;
    --source)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      SOURCE_DIRECTORY=$2
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[ -n "$OUTPUT_DIRECTORY" ] || { usage >&2; exit 2; }

if [ -e "$OUTPUT_DIRECTORY" ] && [ -n "$(ls -A "$OUTPUT_DIRECTORY")" ]; then
  printf 'Output directory must be empty: %s\n' "$OUTPUT_DIRECTORY" >&2
  exit 2
fi
mkdir -p "$OUTPUT_DIRECTORY"
OUTPUT_DIRECTORY=$(CDPATH='' cd -P -- "$OUTPUT_DIRECTORY" && pwd -P)

case "$OUTPUT_DIRECTORY/" in
  "$REPOSITORY_ROOT/"*)
    printf 'Oracle output must be outside the repository: %s\n' "$OUTPUT_DIRECTORY" >&2
    exit 2
    ;;
esac

if [ -z "$SOURCE_DIRECTORY" ]; then
  SOURCE_DIRECTORY="$OUTPUT_DIRECTORY/ThreatExchange"
  git init --quiet "$SOURCE_DIRECTORY"
  git -C "$SOURCE_DIRECTORY" remote add origin "$REFERENCE_REPOSITORY"
  git -C "$SOURCE_DIRECTORY" fetch --quiet --depth 1 origin "$REFERENCE_COMMIT"
  git -C "$SOURCE_DIRECTORY" checkout --quiet --detach FETCH_HEAD
else
  SOURCE_DIRECTORY=$(CDPATH='' cd -P -- "$SOURCE_DIRECTORY" && pwd -P)
fi

ACTUAL_COMMIT=$(git -C "$SOURCE_DIRECTORY" rev-parse HEAD)
if [ "$ACTUAL_COMMIT" != "$REFERENCE_COMMIT" ]; then
  printf 'Expected ThreatExchange commit %s, received %s\n' \
    "$REFERENCE_COMMIT" "$ACTUAL_COMMIT" >&2
  exit 2
fi

if [ -n "$(git -C "$SOURCE_DIRECTORY" status --porcelain)" ]; then
  printf 'ThreatExchange checkout is not clean: %s\n' "$SOURCE_DIRECTORY" >&2
  exit 2
fi

ORACLE_BINARY="$OUTPUT_DIRECTORY/pdq-oracle"
set -- \
  -std=c++11 \
  -O3 \
  -ffp-contract=off \
  -Wall \
  -Wextra \
  -Werror \
  -I "$SOURCE_DIRECTORY" \
  "$WRAPPER_SOURCE" \
  "$SOURCE_DIRECTORY/pdq/cpp/hashing/pdqhashing.cpp" \
  "$SOURCE_DIRECTORY/pdq/cpp/downscaling/downscaling.cpp" \
  "$SOURCE_DIRECTORY/pdq/cpp/hashing/torben.cpp" \
  "$SOURCE_DIRECTORY/pdq/cpp/common/pdqhashtypes.cpp" \
  "$SOURCE_DIRECTORY/pdq/cpp/common/pdqhamming.cpp" \
  -o "$ORACLE_BINARY"

"$ORACLE_CXX" "$@"

printf '%s\n' \
  "pdq_oracle_binary=$ORACLE_BINARY" \
  "reference_repository=$REFERENCE_REPOSITORY" \
  "reference_commit=$ACTUAL_COMMIT" \
  "compiler=$($ORACLE_CXX --version | sed -n '1p')" \
  "flags=-std=c++11 -O3 -ffp-contract=off -Wall -Wextra -Werror" \
  "third_party_notice=$REPOSITORY_ROOT/tools/pdq-oracle/THIRD_PARTY_LICENSES.md"
