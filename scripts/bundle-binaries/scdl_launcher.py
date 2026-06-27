"""PyInstaller entry point for the bundled scdl CLI.

Also provides an offline self-test (``--pk-selftest``) used by the bundling
scripts to verify the frozen binary at build time without any network access:
it exercises the full scdl + yt_dlp import chain (including the runtime hook
that fixes ``yt_dlp.__init__``) and confirms the bundled ``scdl.cfg`` data
file was packaged. This catches packaging regressions that ``--help`` misses.
"""
import sys


def _pk_selftest() -> int:
    import os

    try:
        import scdl
        import scdl.scdl  # noqa: F401  triggers scdl.patches import chain
        import yt_dlp  # noqa: F401
        import curl_cffi  # noqa: F401  required for yt-dlp browser impersonation
    except Exception as exc:  # pragma: no cover - exercised at build time
        print(f"SELFTEST FAIL: import error: {exc!r}", file=sys.stderr)
        return 1

    cfg = os.path.join(os.path.dirname(scdl.__file__), "scdl.cfg")
    if not os.path.isfile(cfg):
        print(f"SELFTEST FAIL: bundled scdl.cfg missing at {cfg}", file=sys.stderr)
        return 1

    print("SELFTEST OK")
    return 0


if __name__ == "__main__":
    if "--pk-selftest" in sys.argv:
        sys.exit(_pk_selftest())

    # Dispatch to the embedded yt-dlp CLI for non-SoundCloud sources (e.g. audio
    # from YouTube). yt-dlp is already collected into this binary, so this exposes
    # it as `scdl pk-ytdlp <yt-dlp args...>` with no extra binary or download.
    if len(sys.argv) > 1 and sys.argv[1] == "pk-ytdlp":
        from yt_dlp import main as ytdlp_main

        sys.exit(ytdlp_main(sys.argv[2:]))

    from scdl.scdl import _main

    sys.exit(_main())
