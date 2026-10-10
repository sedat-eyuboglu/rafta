import type { Currency, Environment, IpKind, ServerType, Status } from "../lib/labels.js";

export interface ServerRow {
  id: number;
  hostname: string;
  role: string;
  environment: Environment;
  status: Status;
  type: ServerType | null;
  cpu_cores: number | null;
  ram_gb: number | null;
  disk_gb: number | null;
  storage_note: string;
  provider: string;
  location: string;
  rack: string;
  os_name: string;
  os_version: string;
  owner: string;
  monthly_cost_cents: number | null;
  currency: Currency;
  renewal_date: string | null;
  ssh_port: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface IpRecord {
  id: number;
  server_id: number;
  address: string;
  kind: IpKind;
  label: string;
  is_primary: number;
}

export interface Server extends ServerRow {
  ips: IpRecord[];
  tags: string[];
}

export interface CredentialRow {
  id: number;
  server_id: number;
  label: string;
  username: string;
  has_secret: number;
  url: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface HistoryRow {
  id: number;
  server_id: number;
  hostname: string;
  at: string;
  action: "create" | "update" | "delete";
  field: string | null;
  old_value: string | null;
  new_value: string | null;
}

export interface PasswordRow {
  id: number;
  title: string;
  username: string;
  has_secret: number;
  url: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ServerCredentialRow {
  id: number;
  server_id: number;
  hostname: string;
  label: string;
  username: string;
  has_secret: number;
  url: string;
}
