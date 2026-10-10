import type { FC } from "hono/jsx";
import { Icon } from "./components/ui.js";
import { Layout } from "./Layout.js";

export const ErrorPage: FC<{ status: number; title: string; message: string }> = (p) => (
  <Layout title={p.title}>
    <div class="empty error-page">
      <p class="error-code">{p.status}</p>
      <h1>{p.title}</h1>
      <p>{p.message}</p>
      <a class="btn" href="/">
        <Icon name="back" />
        Sunucu listesine dön
      </a>
    </div>
  </Layout>
);
