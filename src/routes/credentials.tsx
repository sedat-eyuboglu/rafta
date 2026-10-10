import { Hono, type Context } from "hono";
import type { Env } from "../app.js";
import { parseCredentialForm, type FormBody } from "../lib/validation.js";
import {
  createCredential,
  deleteCredential,
  getCredential,
  revealSecret,
  updateCredential,
} from "../repo/credentials.js";
import { getServer } from "../repo/servers.js";
import type { Server } from "../repo/types.js";
import { CredentialForm, CredentialFormPage, type CredentialFormProps } from "../views/ServerDetail.js";
import { isHtmx, page, parseId, redirect, renderError, withSecretNote } from "./render.js";

export const credentialRoutes = new Hono<Env>();

function loadServer(c: Context<Env>): Server | undefined {
  const id = parseId(c.req.param("id"));
  return id ? getServer(c.var.db, id) : undefined;
}

/** htmx isteğinde dialog içeriği, aksi halde tam sayfa form. */
function renderForm(c: Context<Env>, props: CredentialFormProps, status: 200 | 422 = 200) {
  if (isHtmx(c)) return c.html(<CredentialForm {...props} />, status);
  return page(c, <CredentialFormPage {...props} />, status);
}

function formValues(body: FormBody): Record<string, string> {
  const values: Record<string, string> = {};
  // Şifre geri gönderilmez: hatalı formda tarayıcı geçmişine/HTML'e düşmesin.
  for (const k of ["label", "username", "url", "notes"]) {
    const v = body[k];
    if (typeof v === "string") values[k] = v;
  }
  return values;
}

const notFound = (c: Context) =>
  renderError(c, 404, "Kayıt bulunamadı", "Bu erişim bilgisi ya da sunucu artık mevcut değil.");

credentialRoutes.get("/servers/:id/credentials/new", (c) => {
  const server = loadServer(c);
  if (!server) return notFound(c);
  return renderForm(c, { serverId: server.id, hostname: server.hostname, values: {}, errors: {} });
});

credentialRoutes.post("/servers/:id/credentials", async (c) => {
  const server = loadServer(c);
  if (!server) return notFound(c);
  const body = (await c.req.parseBody()) as FormBody;
  const result = parseCredentialForm(body, false);
  if (!result.ok) {
    return renderForm(
      c,
      { serverId: server.id, hostname: server.hostname, values: formValues(body), errors: withSecretNote(result.errors, body) },
      422,
    );
  }
  createCredential(c.var.db, c.var.box, server.id, result.value);
  return redirect(c, `/servers/${server.id}?ok=cred_saved#credentials`);
});

credentialRoutes.get("/servers/:id/credentials/:cid/edit", (c) => {
  const server = loadServer(c);
  const cid = parseId(c.req.param("cid"));
  const cred = server && cid ? getCredential(c.var.db, server.id, cid) : undefined;
  if (!server || !cred) return notFound(c);
  return renderForm(c, {
    serverId: server.id,
    hostname: server.hostname,
    credId: cred.id,
    hasSecret: !!cred.has_secret,
    values: { label: cred.label, username: cred.username, url: cred.url, notes: cred.notes },
    errors: {},
  });
});

credentialRoutes.post("/servers/:id/credentials/:cid", async (c) => {
  const server = loadServer(c);
  const cid = parseId(c.req.param("cid"));
  const cred = server && cid ? getCredential(c.var.db, server.id, cid) : undefined;
  if (!server || !cred) return notFound(c);
  const body = (await c.req.parseBody()) as FormBody;
  const result = parseCredentialForm(body, true);
  if (!result.ok) {
    return renderForm(
      c,
      {
        serverId: server.id,
        hostname: server.hostname,
        credId: cred.id,
        hasSecret: !!cred.has_secret,
        values: formValues(body),
        errors: withSecretNote(result.errors, body),
      },
      422,
    );
  }
  updateCredential(c.var.db, c.var.box, server.id, cred.id, result.value);
  return redirect(c, `/servers/${server.id}?ok=cred_saved#credentials`);
});

credentialRoutes.post("/servers/:id/credentials/:cid/delete", (c) => {
  const server = loadServer(c);
  const cid = parseId(c.req.param("cid"));
  if (!server || !cid || !deleteCredential(c.var.db, server.id, cid)) return notFound(c);
  return redirect(c, `/servers/${server.id}?ok=cred_deleted#credentials`);
});

credentialRoutes.get("/servers/:id/credentials/:cid/secret", (c) => {
  const sid = parseId(c.req.param("id"));
  const cid = parseId(c.req.param("cid"));
  const secret = sid && cid ? revealSecret(c.var.db, c.var.box, sid, cid) : undefined;
  if (secret === undefined) return c.text("Bulunamadı", 404);
  c.header("Cache-Control", "no-store");
  return c.text(secret);
});
