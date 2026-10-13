/** Письма локального Supabase (Mailpit, порт из supabase/config.toml [inbucket]). */
const MAILPIT = "http://127.0.0.1:54424";

const search = (email: string) => `query=${encodeURIComponent(`to:"${email}"`)}`;

/** Удаляет письма адресата — тест не возьмёт ссылку из прошлого прогона. */
export async function clearMailbox(email: string): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/search?${search(email)}`, { method: "DELETE" });
}

/** Ждёт письмо на адрес и возвращает путь+параметры ссылки /auth/confirm (без домена site_url). */
export async function waitForConfirmLink(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?${search(email)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as {
        HTML: string;
      };
      const href = msg.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (!href) throw new Error("В письме нет ссылки /auth/confirm");
      // Ссылка строится от site_url Supabase (порт 3000); тестовый сервер — на своём порту.
      const url = new URL(href.replaceAll("&amp;", "&"));
      return url.pathname + url.search;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Письмо для ${email} не пришло`);
}

/** Сколько писем пришло адресату (проверка «письма не было»). */
export async function countMessages(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?${search(email)}`);
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}
