// Alan değerleri ve arayüzdeki Türkçe karşılıkları. Sıra, formlardaki ve filtrelerdeki sıradır.

export const ENVIRONMENTS = { prod: "Prod", staging: "Staging", dev: "Dev", test: "Test" } as const;
export const STATUSES = {
  active: "Aktif",
  maintenance: "Bakımda",
  offline: "Kapalı",
  retired: "Emekli",
} as const;
export const SERVER_TYPES = {
  physical: "Fiziksel",
  vm: "Sanal makine",
  vps: "VPS",
  cloud: "Bulut instance",
  container_host: "Konteyner host",
} as const;
export const IP_KINDS = { public: "Public", private: "Private", mgmt: "Yönetim", ipmi: "IPMI / iLO" } as const;
export const CURRENCIES = { TRY: "₺", USD: "$", EUR: "€" } as const;

export type Environment = keyof typeof ENVIRONMENTS;
export type Status = keyof typeof STATUSES;
export type ServerType = keyof typeof SERVER_TYPES;
export type IpKind = keyof typeof IP_KINDS;
export type Currency = keyof typeof CURRENCIES;

export const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** Geçmiş kaydında ve CSV başlıklarında kullanılan alan adları. */
export const FIELD_LABELS: Record<string, string> = {
  hostname: "Hostname",
  role: "Rol",
  environment: "Ortam",
  status: "Durum",
  type: "Tip",
  cpu_cores: "CPU çekirdek",
  ram_gb: "RAM (GB)",
  disk_gb: "Disk (GB)",
  storage_note: "Depolama notu",
  provider: "Sağlayıcı",
  location: "Konum",
  rack: "Rack",
  os_name: "İşletim sistemi",
  os_version: "OS sürümü",
  owner: "Sorumlu",
  monthly_cost_cents: "Aylık maliyet",
  currency: "Para birimi",
  renewal_date: "Yenileme tarihi",
  ssh_port: "SSH portu",
  notes: "Notlar",
  ips: "IP adresleri",
  tags: "Etiketler",
  credential: "Erişim bilgisi",
};
