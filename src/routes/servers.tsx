import { Hono, type Context } from "hono";
import type { Env } from "../app.js";
import { ENVIRONMENTS, STATUSES, type Environment, type Status } from "../lib/labels.js";
import { parseServerForm, readIpRows, type FormBody } from "../lib/validation.js";
import { listCredentials } from "../repo/credentials.js";
import { serverHistory } from "../repo/history.js";
import {
  HostnameTakenError,
  SORTS,
  createServer,
  deleteServer,
  distinctValues,
  getServer,
  listServers,
  updateServer,
  type ListFilter,
  type SortKey,
} from "../repo/servers.js";
import { getStats } from "../repo/stats.js";
import { ServerDetailPage } from "../views/ServerDetail.js";
import { EMPTY_VALUES, ServerFormPage, serverToValues, type FormValues } from "../views/ServerForm.js";
import { Results, ServerListPage } from "../views/ServerList.js";
import { flashFor, isHtmx, page, parseId, redirect, renderError } from "./render.js";

export const serverRoutes = new Hono<Env>();

export function readFilter(c: Context): ListFilter {
  const env = c.req.queries("env")?.filter((e): e is Environment => e in ENVIRONMENTS);
  const status = c.req.queries("status")?.filter((s): s is Status => s in STATUSES);
  const sort = c.req.query("sort");
  return {
    q: c.req.query("q")?.trim().slice(0, 200) || undefined,
    environment: env?.length ? env : undefined,
    status: status?.length ? status : undefined,
    provider: c.req.query("provider") || undefined,
    tag: c.req.query("tag") || undefined,
    sort: sort && sort in SORTS ? (sort as SortKey) : undefined,
    dir: c.req.query("dir") === "desc" ? "desc" : undefined,
  };
}

serverRoutes.get("/", (c) => {
  const db = c.var.db;
  const filter = readFilter(c);
  const servers = listServers(db, filter);
  const stats = getStats(db);
  // Arama/filtre/sıralama htmx ile yalnızca sonuç tablosunu yeniler.
  if (isHtmx(c) && c.req.header("hx-target") === "results" && !c.req.header("hx-history-restore-request")) {
    return c.html(<Results servers={servers} filter={filter} total={stats.total} oob />);
  }
  const values = distinctValues(db);
  return page(
    c,
    <ServerListPage
      servers={servers}
      filter={filter}
      stats={stats}
      providers={values.providers}
      tags={values.tags}
      flash={flashFor(c)}
    />,
  );
});

serverRoutes.get("/servers/new", (c) =>
  page(
    c,
    <ServerFormPage
      mode="new"
      values={EMPTY_VALUES}
      ips={[]}
      primary={0}
      errors={{}}
      suggestions={distinctValues(c.var.db)}
    />,
  ),
);

serverRoutes.post("/servers", async (c) => {
  const body = (await c.req.parseBody({ all: true })) as FormBody;
  const result = parseServerForm(body);
  if (result.ok) {
    try {
      const id = createServer(c.var.db, result.value);
      return redirect(c, `/servers/${id}?ok=created`);
    } catch (err) {
      if (!(err instanceof HostnameTakenError)) throw err;
      return invalidForm(c, "new", body, { hostname: err.message });
    }
  }
  return invalidForm(c, "new", body, result.errors);
});

serverRoutes.get("/servers/:id", (c) => {
  const id = parseId(c.req.param("id"));
  const server = id ? getServer(c.var.db, id) : undefined;
  if (!server) return notFound(c);
  return page(
    c,
    <ServerDetailPage
      server={server}
      credentials={listCredentials(c.var.db, server.id)}
      history={serverHistory(c.var.db, server.id)}
      flash={flashFor(c)}
    />,
  );
});

serverRoutes.get("/servers/:id/edit", (c) => {
  const id = parseId(c.req.param("id"));
  const server = id ? getServer(c.var.db, id) : undefined;
  if (!server) return notFound(c);
  const { values, ips, primary } = serverToValues(server);
  return page(
    c,
    <ServerFormPage
      mode="edit"
      id={server.id}
      hostname={server.hostname}
      values={values}
      ips={ips}
      primary={primary}
      errors={{}}
      suggestions={distinctValues(c.var.db)}
    />,
  );
});

serverRoutes.post("/servers/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const server = id ? getServer(c.var.db, id) : undefined;
  if (!server) return notFound(c);
  const body = (await c.req.parseBody({ all: true })) as FormBody;
  const result = parseServerForm(body);
  if (!result.ok) return invalidForm(c, "edit", body, result.errors, server.id, server.hostname);
  try {
    const before = server.updated_at;
    updateServer(c.var.db, server.id, result.value);
    const after = getServer(c.var.db, server.id)?.updated_at;
    return redirect(c, `/servers/${server.id}?ok=${before === after ? "unchanged" : "saved"}`);
  } catch (err) {
    if (!(err instanceof HostnameTakenError)) throw err;
    return invalidForm(c, "edit", body, { hostname: err.message }, server.id, server.hostname);
  }
});

serverRoutes.post("/servers/:id/delete", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id || !deleteServer(c.var.db, id)) return notFound(c);
  return redirect(c, "/?ok=deleted");
});

function invalidForm(
  c: Context<Env>,
  mode: "new" | "edit",
  body: FormBody,
  errors: Record<string, string>,
  id?: number,
  hostname?: string,
) {
  const values: FormValues = {};
  for (const [k, v] of Object.entries(body)) if (typeof v === "string") values[k] = v;
  const { rows, primary } = readIpRows(body);
  return page(
    c,
    <ServerFormPage
      mode={mode}
      {...(id != null ? { id } : {})}
      {...(hostname != null ? { hostname } : {})}
      values={values}
      ips={rows}
      primary={primary}
      errors={errors}
      suggestions={distinctValues(c.var.db)}
    />,
    422,
  );
}

const notFound = (c: Context) =>
  renderError(c, 404, "Sunucu bulunamadı", "Bu sunucu silinmiş ya da hiç eklenmemiş olabilir.");
