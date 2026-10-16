// 해담 서비스 워커: 웹 푸시 알림만 다룬다 (화면 · 사진은 저장하지 않는다).
// 푸시에는 내용이 없다. 받으면 해담에 로그인한 상태로 새 알림 문구를 가져와 보여 준다.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
