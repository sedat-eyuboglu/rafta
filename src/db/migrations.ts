// Her eleman bir şema sürümüdür; `PRAGMA user_version` uygulanan son sürümü tutar.
// Mevcut bir migration'ı asla değiştirme — yeni değişiklik için sona ekle.
export const migrations: string[] = [
  /* sql */ `
  CREATE TABLE servers (
    id                 INTEGER PRIMARY KEY,
    hostname           TEXT    NOT NULL COLLATE NOCASE UNIQUE,
    role               TEXT    NOT NULL DEFAULT '',
    environment        TEXT    NOT NULL CHECK (environment IN ('prod','staging','dev','test')),
    status             TEXT    NOT NULL CHECK (status IN ('active','maintenance','offline','retired')),
    type               TEXT    CHECK (type IN ('physical','vm','vps','cloud','container_host')),
    cpu_cores          INTEGER CHECK (cpu_cores > 0),
    ram_gb             REAL    CHECK (ram_gb > 0),
    disk_gb            INTEGER CHECK (disk_gb > 0),
    storage_note       TEXT    NOT NULL DEFAULT '',
    provider           TEXT    NOT NULL DEFAULT '',
    location           TEXT    NOT NULL DEFAULT '',
    rack               TEXT    NOT NULL DEFAULT '',
    os_name            TEXT    NOT NULL DEFAULT '',
    os_version         TEXT    NOT NULL DEFAULT '',
    owner              TEXT    NOT NULL DEFAULT '',
    monthly_cost_cents INTEGER CHECK (monthly_cost_cents >= 0),
    currency           TEXT    NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','EUR')),
    renewal_date       TEXT,
    ssh_port           INTEGER NOT NULL DEFAULT 22 CHECK (ssh_port BETWEEN 1 AND 65535),
    notes              TEXT    NOT NULL DEFAULT '',
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
  );

  CREATE TABLE ip_addresses (
    id         INTEGER PRIMARY KEY,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    address    TEXT    NOT NULL,
    kind       TEXT    NOT NULL CHECK (kind IN ('public','private','mgmt','ipmi')),
    label      TEXT    NOT NULL DEFAULT '',
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    position   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (server_id, address)
  );
  CREATE INDEX ip_addresses_server ON ip_addresses(server_id);
  CREATE INDEX ip_addresses_address ON ip_addresses(address);

  CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
  );

  CREATE TABLE server_tags (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, tag_id)
  ) WITHOUT ROWID;
  CREATE INDEX server_tags_tag ON server_tags(tag_id);

  CREATE TABLE credentials (
    id         INTEGER PRIMARY KEY,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    label      TEXT    NOT NULL,
    username   TEXT    NOT NULL DEFAULT '',
    secret_enc BLOB,
    url        TEXT    NOT NULL DEFAULT '',
    notes      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  CREATE INDEX credentials_server ON credentials(server_id);

  -- Sunucu silinse de geçmişi kalsın diye FK yok; hostname ayrıca saklanır.
  CREATE TABLE history (
    id        INTEGER PRIMARY KEY,
    server_id INTEGER NOT NULL,
    hostname  TEXT    NOT NULL,
    at        TEXT    NOT NULL,
    action    TEXT    NOT NULL CHECK (action IN ('create','update','delete')),
    field     TEXT,
    old_value TEXT,
    new_value TEXT
  );
  CREATE INDEX history_server ON history(server_id, at DESC);

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;
  `,
  /* sql */ `
  -- Sunuculardan bağımsız şifreler (site, uygulama, banka…).
  CREATE TABLE passwords (
    id         INTEGER PRIMARY KEY,
    title      TEXT    NOT NULL,
    username   TEXT    NOT NULL DEFAULT '',
    secret_enc BLOB,
    url        TEXT    NOT NULL DEFAULT '',
    notes      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  CREATE INDEX passwords_title ON passwords(title COLLATE NOCASE);
  `,
  /* sql */ `
  -- Authenticator (TOTP) girişi. Çerezdeki oturum anahtarının yalnızca SHA-256 özeti saklanır.
  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent   TEXT NOT NULL DEFAULT ''
  ) WITHOUT ROWID;

  -- Authenticator kaybolursa girişi açan tek kullanımlık kodlar (özetleri).
  CREATE TABLE recovery_codes (
    code_hash TEXT PRIMARY KEY,
    used_at   TEXT
  ) WITHOUT ROWID;
  `,
];
