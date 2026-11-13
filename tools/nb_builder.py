# Minimal notebook builder used to generate the project notebooks reproducibly.
#
# Each builder script defines a list of cells and calls `write_notebook`, which writes a valid
# .ipynb that is then executed with `jupyter nbconvert --execute` so the committed notebooks
# contain real outputs. This keeps the notebook text reviewable in a diff-friendly form.

from __future__ import annotations

from pathlib import Path

import nbformat


def md(text: str) -> tuple[str, str]:
    return ("markdown", text.strip("\n"))


def code(text: str) -> tuple[str, str]:
    return ("code", text.strip("\n"))


def write_notebook(path: Path, cells: list[tuple[str, str]], kernel: str = "python3") -> None:
    notebook = nbformat.v4.new_notebook()
    notebook.metadata = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": kernel},
        "language_info": {"name": "python"},
    }
    for kind, text in cells:
        if kind == "markdown":
            notebook.cells.append(nbformat.v4.new_markdown_cell(text))
        else:
            notebook.cells.append(nbformat.v4.new_code_cell(text))
    path.parent.mkdir(parents=True, exist_ok=True)
    nbformat.write(notebook, path)
    print(f"wrote {path} ({len(cells)} cells)")
