#!/bin/sh
# Build report.pdf from report.tex (run twice so contents, figure/table lists and references are filled in).
cd "$(dirname "$0")"
pdflatex -interaction=nonstopmode -halt-on-error report.tex > /dev/null && \
pdflatex -interaction=nonstopmode -halt-on-error report.tex > /dev/null && \
echo "built docs/latex/report.pdf" || { echo "build failed, see report.log"; exit 1; }
rm -f report.aux report.out report.toc report.lof report.lot report.log
