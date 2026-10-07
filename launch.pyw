# Vault of Cringe launcher: double-click (or use the desktop shortcut) to play.
# Starts the local no-cache server with no console window, opens the game in its own app window,
# and shuts the server down when that window closes. If the server is already running, it just opens a window.
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
import http.server

PORT = 8642
URL = f"http://localhost:{PORT}/"
ROOT = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", ROOT), "VaultOfCringe", "browser")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):  # quiet: there's no console to print to
        pass


def port_in_use():
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def find_browser():
    pf, pf86, local = os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", ""), os.environ.get("LOCALAPPDATA", "")
    for p in (
        os.path.join(pf86, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(pf, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(pf, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(pf86, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(local, r"Google\Chrome\Application\chrome.exe"),
    ):
        if p and os.path.exists(p):
            return p
    return shutil.which("msedge") or shutil.which("chrome")


def open_window():
    """Open the game in a chromeless app window. Returns the browser process to wait on, or None."""
    exe = find_browser()
    if not exe:
        webbrowser.open(URL)
        return None
    os.makedirs(PROFILE, exist_ok=True)
    # a dedicated profile makes the browser process live exactly as long as the game window
    return subprocess.Popen([exe, f"--app={URL}", f"--user-data-dir={PROFILE}", "--window-size=1600,900",
                             "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required"])


def main():
    if port_in_use():  # already being served (another launcher, start.bat, or a dev server)
        open_window()
        return
    server = http.server.ThreadingHTTPServer(("", PORT), NoCache)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    proc = open_window()
    if proc is None:
        # no app-mode browser found: it opened in the default browser, so keep serving until killed
        server.serve_forever()
        return
    proc.wait()
    # Chrome/Edge sometimes hand off to an already-running instance of the same profile and exit early;
    # keep serving while that profile's window is still open (its lockfile exists)
    lock = os.path.join(PROFILE, "lockfile")
    while os.path.exists(lock):
        try:
            os.remove(lock)  # removable only once no browser holds it
        except OSError:
            time.sleep(2)
            continue
        break
    server.shutdown()


if __name__ == "__main__":
    main()
    sys.exit(0)
