#!/bin/sh
# macOS only. faiss and scikit-learn ship their own copy of OpenMP (libomp), while LightGBM/XGBoost use
# Homebrew's. Several copies in one process make the models freeze. This points the bundled copies at
# Homebrew's libomp so only one is ever loaded. Re-run after `uv sync` reinstalls faiss or scikit-learn.
# Needs: brew install libomp
set -e
BREW="$(brew --prefix libomp)/lib/libomp.dylib"
SP="$(.venv/bin/python -c 'import site; print(site.getsitepackages()[0])')"
for pkg in faiss sklearn; do
    f="$SP/$pkg/.dylibs/libomp.dylib"
    [ -L "$f" ] && continue
    [ -f "$f" ] && mv "$f" "$f.bak" && ln -s "$BREW" "$f" && echo "linked $pkg -> $BREW"
done
