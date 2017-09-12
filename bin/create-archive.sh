#!/bin/bash

set -e

rm -f sle-archive.zip
zip -r sle-archive.zip src test bench third_party LICENSE memo-viz.html package.json
cp README.md README.txt
zip -r sle-archive.zip README.txt
rm README.txt

echo "Created sle-archive.zip"
