"""
PyInstaller runtime hook: fix yt_dlp.__init__ submodule resolution.

scdl imports `yt_dlp.__init__` as a submodule for monkey-patching.
PyInstaller incorrectly packages this as a nested package directory,
breaking relative imports inside __init__.py (e.g. `.cookies`).
Register a synthetic module before scdl loads.
"""
import sys
import types


def _install_ytdlp_init_module() -> None:
    existing = sys.modules.get('yt_dlp.__init__')
    if existing is not None and hasattr(existing, 'validate_options'):
        return

    import yt_dlp

    mod = types.ModuleType('yt_dlp.__init__')
    mod.__package__ = 'yt_dlp'
    if getattr(yt_dlp, '__file__', None):
        mod.__file__ = yt_dlp.__file__

    for name in dir(yt_dlp):
        if name.startswith('_'):
            continue
        try:
            setattr(mod, name, getattr(yt_dlp, name))
        except Exception:
            pass

    sys.modules['yt_dlp.__init__'] = mod

    # Without this, `yt_dlp.__init__` stays a method-wrapper until the submodule
    # is imported; scdl assigns to `yt_dlp.__init__.validate_options` at import time.
    yt_dlp.__init__ = mod


_install_ytdlp_init_module()
