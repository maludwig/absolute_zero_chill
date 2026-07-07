#!/bin/bash

# Bomb out if anything goes wrong
set -e

THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIR_BASE="$(basename "$THIS_DIR")"

help() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -h, --help    Show this help message"
}

OUTPUT_DIR="/tmp"
while (( "$#" > 0 )); do
  case $1 in
  -h|--help)
    help
    exit
    ;;
  -o|--output-dir)
    OUTPUT_DIR="$2"
    shift
    ;;
  *)
    help
    msg-error "Unknown argument $1"
    exit 1
    ;;
  esac
  shift
done

# This script zips the project files into a single archive for distribution.
TS="$(date -u +%Y-%m-%d_%H-%M-%S)"
ZIP_FILE="$OUTPUT_DIR/game_$TS.zip"
(
    cd "$(dirname "$THIS_DIR")" && \
    zip -rq "$ZIP_FILE" "$DIR_BASE" -x "*/node_modules/*" "*/.git/*" "*/dist/*" "*/coverage/*" "*/.DS_Store"
)
echo "Project zipped to: $ZIP_FILE"
