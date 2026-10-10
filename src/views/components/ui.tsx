import type { Child, FC } from "hono/jsx";
import { ENVIRONMENTS, STATUSES, type Environment, type Status } from "../../lib/labels.js";

// 24px grid, 1.75 çizgi; Lucide ikon setinden uyarlanmıştır (ISC).
const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" /></>,
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  terminal: <><path d="m4 17 6-6-6-6M12 19h8" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
  external: <><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  server: <><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><path d="M7 6.5h.01M7 17.5h.01" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  printer: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export const Icon: FC<{ name: IconName; size?: number; class?: string }> = ({ name, size = 16, class: cls }) => (
  <svg
    class={cls ? `icon ${cls}` : "icon"}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {ICONS[name]}
  </svg>
);

/** Ön paneldeki durum LED'i. */
export const StatusDot: FC<{ status: Status; label?: boolean }> = ({ status, label }) => (
  <span class={`status status-${status}`} title={STATUSES[status]}>
    <span class="led" aria-hidden="true" />
    {label ? <span>{STATUSES[status]}</span> : <span class="sr-only">{STATUSES[status]}</span>}
  </span>
);

export const EnvBadge: FC<{ env: Environment }> = ({ env }) => (
  <span class={`env env-${env}`}>{ENVIRONMENTS[env]}</span>
);

/** Tıklanınca data-copy içeriğini panoya kopyalayan küçük buton. */
export const CopyButton: FC<{ value: string; label: string; class?: string }> = (p) => (
  <button type="button" class={`icon-btn copy ${p.class ?? ""}`} data-copy={p.value} title={p.label} aria-label={p.label}>
    <Icon name="copy" size={14} />
  </button>
);

interface FieldProps {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string;
  class?: string;
  children: Child;
}

/** Etiket + kontrol + hata/ipucu. Hata varsa kontrolün aria-describedby'ı buna bağlanmalı. */
export const Field: FC<FieldProps> = (p) => (
  <div class={`field ${p.error ? "has-error" : ""} ${p.class ?? ""}`}>
    <label for={`f-${p.name}`}>{p.label}</label>
    {p.children}
    {p.error ? (
      <p class="field-error" id={`e-${p.name}`}>
        {p.error}
      </p>
    ) : p.hint ? (
      <p class="field-hint" id={`e-${p.name}`}>
        {p.hint}
      </p>
    ) : null}
  </div>
);

export const describedBy = (name: string, error?: string, hint?: string) =>
  error || hint ? { "aria-describedby": `e-${name}` } : {};

export const Options: FC<{ options: Record<string, string>; value: string; empty?: string }> = (p) => (
  <>
    {p.empty !== undefined ? <option value="">{p.empty}</option> : null}
    {Object.entries(p.options).map(([k, v]) => (
      <option value={k} selected={k === p.value}>
        {v}
      </option>
    ))}
  </>
);

export const Datalist: FC<{ id: string; values: string[] }> = ({ id, values }) => (
  <datalist id={id}>
    {values.map((v) => (
      <option value={v} />
    ))}
  </datalist>
);
