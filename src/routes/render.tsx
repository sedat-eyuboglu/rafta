import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Errors, FormBody } from "../lib/validation.js";
import { ErrorPage } from "../views/ErrorPage.js";

export function page(c: Context, node: JSX.Element, status: ContentfulStatusCode = 200) {
  return c.html(`<!doctype html>${node}`, status);
}

export function renderError(c: Context, status: ContentfulStatusCode, title: string, message: string) {
  return page(c, <ErrorPage status={status} title={title} message={message} />, status);
}

export const isHtmx = (c: Context) => c.req.header("hx-request") === "true";

/** htmx isteğinde tam sayfa yönlendirmesi, normal formda 303. */
export function redirect(c: Context, to: string) {
  if (isHtmx(c)) {
    c.header("HX-Redirect", to);
    return c.body(null, 204);
  }
  return c.redirect(to, 303);
}

export function parseId(raw: string | undefined): number | undefined {
  if (!raw || !/^\d{1,15}$/.test(raw)) return undefined;
  return Number(raw);
}

const FLASH: Record<string, string> = {
  created: "Sunucu eklendi.",
  saved: "Değişiklikler kaydedildi.",
  unchanged: "Değişiklik yoktu; kayıt aynı kaldı.",
  deleted: "Sunucu silindi.",
  cred_saved: "Erişim bilgisi kaydedildi.",
  cred_deleted: "Erişim bilgisi silindi.",
  pw_added: "Şifre eklendi.",
  pw_saved: "Şifre kaydedildi.",
  pw_deleted: "Şifre silindi.",
  recovery_used: "Kurtarma koduyla giriş yaptın; o kod artık geçersiz. Authenticator'ı yeniden bağlamayı unutma.",
  sessions_closed: "Diğer tüm cihazlardan çıkış yapıldı.",
  totp_rebound: "Authenticator yeniden bağlandı. Eski telefondaki kod artık çalışmaz.",
};

export const flashFor = (c: Context) => FLASH[c.req.query("ok") ?? ""];

/** Hatalı formda girilen şifre geri gösterilmediği için kullanıcıyı uyar. */
export function withSecretNote(errors: Errors, body: FormBody): Errors {
  if (typeof body.secret === "string" && body.secret !== "" && !errors.secret) {
    return { ...errors, secret: "Güvenlik için şifre alanı temizlendi; tekrar gir." };
  }
  return errors;
}
