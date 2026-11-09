"""Build with LG's official CLI; generate the matching Homebrew manifest."""
import argparse
import io
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cli', type=Path, help='Optional path to ares-package.js')
parser.add_argument('--repo', default='dmilin1/LGNightModeScheduler')
args = parser.parse_args()
cli = args.cli or root / 'node_modules/@webos-tools/cli/bin/ares-package.js'
if not cli.exists():
    raise SystemExit('Run npm ci before building (or provide --cli).')
dist = root / 'dist'
dist.mkdir(exist_ok=True)
# Scope CLI settings to this build. Do not change the user's global CLI config.
cli_data = root / '.tools/cli-data'
cli_data.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, APPDATA=str(cli_data))
subprocess.run(['node', str(cli.resolve()), '--no-minify', str(root / 'app'), str(root / 'service'), '--outdir', str(dist)], env=env, cwd=root, check=True)
info = json.loads((root / 'app/appinfo.json').read_text())
ipk = dist / (info['id'] + '_' + info['version'] + '_all.ipk')
if not ipk.exists():
    raise SystemExit('CLI did not produce the expected IPK: ' + str(ipk))

# Windows has no POSIX execute bit. Normalize the boot script inside the IPK
# so run-parts can execute the symlink after install/update, before opening UI.
raw = ipk.read_bytes()
if raw[:8] != b'!<arch>\n':
    raise SystemExit('Expected an unsigned Debian ar IPK from the CLI.')
members = []
offset = 8
found = False
while offset < len(raw):
    header = raw[offset:offset+60]
    length = int(header[48:58].decode('ascii').strip())
    data = raw[offset+60:offset+60+length]
    name = header[:16].decode('ascii').strip().rstrip('/')
    if name == 'data.tar.gz':
        rebuilt = io.BytesIO()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as original:
            with tarfile.open(fileobj=rebuilt, mode='w:gz', format=tarfile.GNU_FORMAT) as archive:
                for entry in original.getmembers():
                    if entry.name.endswith('/' + info['id'] + '.service/startup.sh'):
                        entry.mode = 0o755
                        found = True
                    archive.addfile(entry, original.extractfile(entry) if entry.isfile() else None)
        data = rebuilt.getvalue()
        header = header[:48] + str(len(data)).encode('ascii').ljust(10) + header[58:]
    members.append(header + data + (b'\n' if len(data) % 2 else b''))
    offset += 60 + length + length % 2
if not found:
    raise SystemExit('Startup script was missing from the IPK; refusing release.')
ipk.write_bytes(b'!<arch>\n' + b''.join(members))
repo_url = 'https://github.com/' + args.repo
manifest = {
    'id': info['id'], 'version': info['version'], 'type': info['type'], 'title': info['title'],
    'appDescription': 'Schedule blue light reduction and optional pixel brightness, with live status and manual controls.',
    'iconUri': 'https://raw.githubusercontent.com/' + args.repo + '/main/app/largeIcon.png',
    'sourceUrl': repo_url, 'rootRequired': True,
    'ipkUrl': repo_url + '/releases/download/v' + info['version'] + '/' + ipk.name,
    'ipkSize': ipk.stat().st_size,
    'ipkHash': {'sha256': hashlib.sha256(ipk.read_bytes()).hexdigest()}
}
manifest_file = dist / (info['id'] + '.manifest.json')
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('Manifest:', manifest_file)
print('SHA-256:', manifest['ipkHash']['sha256'])
