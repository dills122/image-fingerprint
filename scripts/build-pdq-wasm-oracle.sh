#!/bin/sh
set -eu

REFERENCE_COMMIT="baefb4ed67b6cdc1d4c82dbaef858d50866ac424"
EMSCRIPTEN_IMAGE="emscripten/emsdk@sha256:6143f5b3d58fe6e7faf9f279d27ea9ea975983ee2b5490478abda126a6762f34"

SCRIPT_DIRECTORY=$(CDPATH='' cd -P -- "$(dirname -- "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH='' cd -P -- "$SCRIPT_DIRECTORY/.." && pwd -P)

OUTPUT_DIRECTORY=""
SOURCE_DIRECTORY=""

usage() {
  printf '%s\n' \
    "Usage: $0 --output <empty-directory> --source <verified-checkout>" \
    "" \
    "Builds a disposable Node launcher and WASM oracle with a pinned Emscripten image."
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
[ -n "$SOURCE_DIRECTORY" ] || { usage >&2; exit 2; }
command -v docker >/dev/null 2>&1 || {
  printf 'Docker is required to build the WASM oracle\n' >&2
  exit 2
}

if [ -e "$OUTPUT_DIRECTORY" ] && [ -n "$(ls -A "$OUTPUT_DIRECTORY")" ]; then
  printf 'Output directory must be empty: %s\n' "$OUTPUT_DIRECTORY" >&2
  exit 2
fi
mkdir -p "$OUTPUT_DIRECTORY"
OUTPUT_DIRECTORY=$(CDPATH='' cd -P -- "$OUTPUT_DIRECTORY" && pwd -P)
SOURCE_DIRECTORY=$(CDPATH='' cd -P -- "$SOURCE_DIRECTORY" && pwd -P)

case "$OUTPUT_DIRECTORY/" in
  "$REPOSITORY_ROOT/"*)
    printf 'Oracle output must be outside the repository: %s\n' "$OUTPUT_DIRECTORY" >&2
    exit 2
    ;;
esac

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

docker run --rm --platform linux/amd64 \
  -v "$REPOSITORY_ROOT:/work:ro" \
  -v "$SOURCE_DIRECTORY:/source:ro" \
  -v "$OUTPUT_DIRECTORY:/out" \
  "$EMSCRIPTEN_IMAGE" \
  em++ \
  /work/tools/pdq-oracle/main.cpp \
  /source/pdq/cpp/hashing/pdqhashing.cpp \
  /source/pdq/cpp/downscaling/downscaling.cpp \
  /source/pdq/cpp/hashing/torben.cpp \
  /source/pdq/cpp/common/pdqhashtypes.cpp \
  /source/pdq/cpp/common/pdqhamming.cpp \
  -I/source \
  -std=c++11 \
  -O3 \
  -ffp-contract=off \
  -Wall \
  -Wextra \
  -Werror \
  -s EXIT_RUNTIME=1 \
  -s ENVIRONMENT=node \
  -s NODERAWFS=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -o /out/pdq-oracle.js

printf '%s\n' \
  "pdq_wasm_oracle_js=$OUTPUT_DIRECTORY/pdq-oracle.js" \
  "pdq_wasm_oracle_binary=$OUTPUT_DIRECTORY/pdq-oracle.wasm" \
  "reference_commit=$ACTUAL_COMMIT" \
  "emscripten_image=$EMSCRIPTEN_IMAGE" \
  "flags=-std=c++11 -O3 -ffp-contract=off -Wall -Wextra -Werror"
