"use client";

import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import { useState } from "react";

const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

// 회원 시안 46 ③: 가입 직후 3장 카드 — 해마다 담기 → 크레딧 → 지켜요
const CARDS = [
  {
    hand: "해마다, 잊지 않도록",
    title: "해마다 담아요",
    body: (
      <>
        사진마다 <b>찍은 해</b>가 있어요. 내 프로필에는 해마다 한 권씩 <b>연도 책장</b>이 쌓이고, 몇 년 뒤 같은 날엔 <b>이맘때</b>로 다시 보여 드려요.
      </>
    ),
    next: "크레딧",
  },
  {
    hand: "함께 찍은 사람까지",
    title: "크레딧을 남겨요",
    body: (
      <>
        코스어 · 모델 · 촬영 · 보정, 함께한 사람의 <b>이름을 사진에 걸어요</b>. 해담 회원이면 그분이 <b>승인</b>한 뒤 그분 프로필에도 모여요.
      </>
    ),
    next: "지켜요",
  },
  {
    hand: "찍은 사람도, 찍힌 사람도",
    title: "함께 지켜요",
    body: (
      <>
        사진은 <b>내려받을 수 없어요</b>. 사람이 나온 사진은 <b>촬영 동의 기록</b>을 남기고, 보기 불편할 수 있는 사진은 <b>가림 표시</b>로 한 번 가려요. 문제가 있으면 언제든 <b>신고</b>해 주세요.
      </>
    ),
    next: null,
  },
];

/** 한 장씩 넘기는 소개 카드 (건너뛸 수 있음) */
export function IntroCards({ doneHref }: { doneHref: string }) {
  const [step, setStep] = useState(0);
  const card = CARDS[step];
  return (
    <div className="flex flex-col gap-5">
      <section aria-live="polite" aria-label={`${step + 1} / ${CARDS.length}`} className="flex min-h-80 flex-col gap-3 rounded-2xl bg-accent-soft/50 p-6">
        <span className={`${pen.className} text-3xl text-accent`}>{card.hand}</span>
        <h2 className="text-xl font-bold">{card.title}</h2>
        <p className="text-sm leading-relaxed text-quiet [&_b]:font-semibold [&_b]:text-text">{card.body}</p>
      </section>

      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {CARDS.map((c, i) => (
          <span key={c.title} className={`size-2 rounded-full ${i === step ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {card.next ? (
          <button type="button" onClick={() => setStep(step + 1)} className="min-h-12 rounded-xl bg-accent font-semibold text-on-accent">
            다음 · {card.next}
          </button>
        ) : (
          <Link href={doneHref} className="flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-on-accent">
            시작하기
          </Link>
        )}
        {card.next && (
          <Link href={doneHref} className="flex min-h-12 items-center justify-center text-sm text-quiet">
            건너뛰기
          </Link>
        )}
      </div>
    </div>
  );
}
