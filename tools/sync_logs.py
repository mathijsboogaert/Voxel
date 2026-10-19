#!/usr/bin/env python3
"""Download the Minecraft server's logs over SFTP so build_stats.py can read them.

Usage:  python3 tools/sync_logs.py <local-folder>

Reads its settings from environment variables (in CI these are repository secrets):
  SFTP_HOST            required   e.g. node1.example.com
  SFTP_USER            required   Pterodactyl SFTP username (looks like  name.1a2b3c4d)
  SFTP_PASSWORD        required*  the panel account password
  SFTP_KEY             optional   a private key (PEM text) to use instead of the password
  SFTP_PORT            optional   default 2022 (Pterodactyl's SFTP port)
  SFTP_LOG_DIR         optional   default "logs"
  SFTP_SCOREBOARD      optional   default "world/data/minecraft/scoreboard.dat" (the datapack's AFK counters)
  SFTP_HOST_FINGERPRINT optional  SHA256 fingerprint of the server's host key; when set, the
                                  connection is refused if it does not match
Only the files build_stats.py needs are fetched: YYYY-MM-DD-n.log.gz and latest.log. Their
modified times are kept, because latest.log has no date in its name and is dated from its mtime.
"""
import base64, hashlib, io, os, re, sys

LOG_NAME = re.compile(r'^(\d{4}-\d{2}-\d{2}-\d+\.log\.gz|latest\.log)$')


def wanted(names):
    """Filter a remote directory listing down to the log files that matter."""
    return [n for n in names if LOG_NAME.match(n)]


def connect():
    import paramiko
    host, user = os.environ['SFTP_HOST'], os.environ['SFTP_USER']
    port = int(os.environ.get('SFTP_PORT') or 2022)
    transport = paramiko.Transport((host, port))
    transport.connect()
    expect = (os.environ.get('SFTP_HOST_FINGERPRINT') or '').strip()
    seen = 'SHA256:' + base64.b64encode(hashlib.sha256(transport.get_remote_server_key().asbytes()).digest()).decode().rstrip('=')
    if expect and expect != seen:
        transport.close()
        sys.exit(f'Host key mismatch: expected {expect}, server presented {seen}. Refusing to connect.')
    if not expect:
        print(f'note: host key not pinned. To pin it, set SFTP_HOST_FINGERPRINT to {seen}')
    key = (os.environ.get('SFTP_KEY') or '').strip()
    if key:
        pkey = paramiko.PKey.from_private_key(io.StringIO(key))
        transport.auth_publickey(user, pkey)
    else:
        transport.auth_password(user, os.environ['SFTP_PASSWORD'])
    return transport, paramiko.SFTPClient.from_transport(transport)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    dest = sys.argv[1]
    os.makedirs(dest, exist_ok=True)
    remote = (os.environ.get('SFTP_LOG_DIR') or 'logs').strip('/')
    transport, sftp = connect()
    try:
        listing = {a.filename: a for a in sftp.listdir_attr(remote)}
        names = wanted(listing)
        for name in sorted(names):
            local = os.path.join(dest, name)
            sftp.get(f'{remote}/{name}', local)
            os.utime(local, (listing[name].st_atime, listing[name].st_mtime))
        print(f'downloaded {len(names)} log files into {dest}')
        board = (os.environ.get('SFTP_SCOREBOARD') or 'world/data/minecraft/scoreboard.dat').strip('/')
        try:
            sftp.get(board, os.path.join(dest, 'scoreboard.dat'))
            print('downloaded the scoreboard')
        except OSError as e:
            print(f'note: could not fetch {board} ({e}); AFK counters are skipped this time')
        if 'latest.log' not in names:
            sys.exit('latest.log was not found on the server; check SFTP_LOG_DIR')
    finally:
        sftp.close()
        transport.close()


if __name__ == '__main__':
    main()
