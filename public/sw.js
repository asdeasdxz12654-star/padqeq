// 해담 서비스 워커: 웹 푸시 알림 + 오프라인 안내 (화면 · 사진은 저장하지 않는다).
// 푸시에는 내용이 없다. 받으면 해담에 로그인한 상태로 새 알림 문구를 가져와 보여 준다.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // 화면 요청을 서비스 워커가 깨어나는 동안 미리 보내 둔다 (화면 이동이 느려지지 않게)
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  ),
);

// 오프라인: 화면 이동(navigate)이 네트워크 문제로 실패했을 때만 안내 화면. 사진 · 화면은 저장하지 않는다 (보호).
const OFFLINE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>연결이 끊겼어요 · 해담</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff;color:#111}
@media (prefers-color-scheme:dark){body{background:#0d0d0d;color:#f2f2f2}}main{text-align:center;padding:24px;max-width:340px;word-break:keep-all}h1{font-size:22px}
p{color:#777;line-height:1.6}a{display:inline-block;margin-top:12px;padding:12px 22px;border-radius:999px;background:#c54a40;color:#fff;font-weight:700;text-decoration:none}</style></head>
<body><main><svg width="96" height="80" viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><g transform="rotate(-5 60 50)"><path d="M30 14 C48 12, 74 15, 92 13 C94 38, 92 62, 94 86 C74 88, 48 86, 29 87 C31 62, 28 38, 30 14 Z"/><circle cx="70" cy="36" r="8" stroke="#e2574b" stroke-dasharray="3 4"/><path d="M36 66 C44 54, 50 51, 56 57 C61 48, 69 47, 78 56" stroke-width="2.6"/></g></svg>
<h1>인터넷 연결이 끊겼어요</h1><p>연결되면 다시 보여 드릴게요.</p><a href="">다시 시도</a></main></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let note = { title: "해담", body: "새 알림이 있어요.", url: "/notifications", tag: "haedam" };
      try {
        const response = await fetch("/api/me/notifications/latest", { credentials: "same-origin", cache: "no-store" });
        if (response.ok) note = { ...note, ...(await response.json()) };
      } catch {
        // 문구를 못 가져와도 알림은 띄운다 (브라우저 규칙)
      }
      await self.registration.showNotification(note.title, {
        body: note.body,
        tag: note.tag,
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        lang: "ko",
        data: { url: note.url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  // 다른 사이트로는 열지 않는다
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(target.href);
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
