"""PyInstaller entry point for the bundled scdl CLI."""
import sys

from scdl.scdl import _main

if __name__ == '__main__':
    sys.exit(_main())
