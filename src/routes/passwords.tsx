import { Hono, type Context } from "hono";
import type { Env } from "../app.js";
import { parsePasswordForm, type FormBody } from "../lib/validation.js";
import {
  countPasswords,
  createPassword,
  deletePassword,
  getPassword,
  knownUsernames,
  listPasswords,
  listServerCredentials,
  revealPassword,
  updatePassword,
} from "../repo/passwords.js";
import {
  PasswordForm,
  PasswordFormPage,
  PasswordsPage,
  QuickAdd,
  VaultResults,
  type PasswordFormProps,
  type QuickAddProps,
} from "../views/Passwords.js";
import { flashFor, isHtmx, page, parseId, redirect, renderError, withSecretNote } from "./render.js";

export const passwordRoutes = new Hono<Env>();

function renderPage(c: Context<Env>, add: QuickAddProps, status: 200 | 422 = 200) {
  const db = c.var.db;
  const q = c.req.query("q")?.trim().slice(0, 200) ?? "";
  const total = countPasswords(db);
  return page(
    c,
    <PasswordsPage
      passwords={listPasswords(db, q)}
      serverCredentials={listServerCredentials(db, q)}
      total={total}
      q={q}
      usernames={knownUsernames(db)}
      add={{ ...add, focus: add.focus ?? (total === 0 && !q) }}
      newId={parseId(c.req.query("new"))}
      flash={flashFor(c)}
    />,
    status,
  );
}

/** Şifre geri gönderilmez: hatalı formda tarayıcı geçmişine/HTML'e düşmesin. */
function formValues(body: FormBody): Record<string, string> {
  const values: Record<string, string> = {};
  for (const k of ["title", "username", "url", "notes"]) {
    const v = body[k];
    if (typeof v === "string") values[k] = v;
  }
  return values;
}

const notFound = (c: Context) => renderError(c, 404, "Şifre bulunamadı", "Bu kayıt silinmiş olabilir.");

passwordRoutes.get("/passwords", (c) => {
  // Arama htmx ile yalnızca sonuçları yeniler.
  if (isHtmx(c) && c.req.header("hx-target") === "vault-results" && !c.req.header("hx-history-restore-request")) {
    const db = c.var.db;
    const q = c.req.query("q")?.trim().slice(0, 200) ?? "";
    return c.html(
      <VaultResults
        passwords={listPasswords(db, q)}
        serverCredentials={listServerCredentials(db, q)}
        total={countPasswords(db)}
        q={q}
      />,
    );
  }
  return renderPage(c, { values: {}, errors: {}, focus: c.req.query("ok") === "pw_added" ? true : undefined });
});

passwordRoutes.post("/passwords", async (c) => {
  const body = (await c.req.parseBody()) as FormBody;
  const result = parsePasswordForm(body, false);
  if (!result.ok) {
    // htmx'te girilen şifreyi tarayıcı geri koyar (app.js); JS'siz formda kullanıcı uyarılır.
    if (isHtmx(c)) return c.html(<QuickAdd values={formValues(body)} errors={result.errors} />, 422);
    return renderPage(c, { values: formValues(body), errors: withSecretNote(result.errors, body) }, 422);
  }
  const id = createPassword(c.var.db, c.var.box, result.value);
  return redirect(c, `/passwords?ok=pw_added&new=${id}`);
});

function renderForm(c: Context<Env>, props: PasswordFormProps, status: 200 | 422 = 200) {
  if (isHtmx(c)) return c.html(<PasswordForm {...props} />, status);
  return page(c, <PasswordFormPage {...props} />, status);
}

passwordRoutes.get("/passwords/:id/edit", (c) => {
  const id = parseId(c.req.param("id"));
  const pw = id ? getPassword(c.var.db, id) : undefined;
  if (!pw) return notFound(c);
  return renderForm(c, {
    id: pw.id,
    hasSecret: !!pw.has_secret,
    values: { title: pw.title, username: pw.username, url: pw.url, notes: pw.notes },
    errors: {},
  });
});

passwordRoutes.post("/passwords/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const pw = id ? getPassword(c.var.db, id) : undefined;
  if (!pw) return notFound(c);
  const body = (await c.req.parseBody()) as FormBody;
  const result = parsePasswordForm(body, true);
  if (!result.ok) {
    return renderForm(
      c,
      { id: pw.id, hasSecret: !!pw.has_secret, values: formValues(body), errors: withSecretNote(result.errors, body) },
      422,
    );
  }
  updatePassword(c.var.db, c.var.box, pw.id, result.value);
  return redirect(c, `/passwords?ok=pw_saved#pw-${pw.id}`);
});

passwordRoutes.post("/passwords/:id/delete", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id || !deletePassword(c.var.db, id)) return notFound(c);
  return redirect(c, "/passwords?ok=pw_deleted");
});

passwordRoutes.get("/passwords/:id/secret", (c) => {
  const id = parseId(c.req.param("id"));
  const secret = id ? revealPassword(c.var.db, c.var.box, id) : undefined;
  if (secret === undefined) return c.text("Bulunamadı", 404);
  c.header("Cache-Control", "no-store");
  return c.text(secret);
});
