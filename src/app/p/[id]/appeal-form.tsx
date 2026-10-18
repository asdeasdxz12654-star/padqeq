"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EVIDENCE_ACCEPT, evidenceFileProblem, isEvidenceType } from "@/lib/moderation/evidence";
import { startAppealEvidence, submitAppeal } from "./actions";

const MAX_APPEAL_FILES = 5;

/** 증빙 하나 올리기: 자리 만들기 → 파일 올리기 */
async function uploadAppealEvidence(appealId: string, file: File): Promise<boolean> {
  if (!isEvidenceType(file.type)) return false;
  const slot = await startAppealEvidence({ appealId, contentType: file.type, bytes: file.size });
  if (!slot.ok) return false;
  const response = await fetch(`/api/appeals/evidence/${slot.id}`, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  }).catch(() => null);
  return response?.ok ?? false;
}

/** 소명 (S-19 ⑤~⑧): 조치 1건당 한 번 · 30일 안 · 1,000자 · 증빙 5개 */
export function AppealForm({ postId, deadline }: { postId: string; deadline: string }) {
  const router = useRouter();
  const [statement, setStatement] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const length = statement.trim().length;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitAppeal({ postId, statement });
          if (!result.ok) return setError(result.error);
          let failed = 0;
          for (const file of files) if (!(await uploadAppealEvidence(result.appealId, file))) failed++;
          if (failed) setError(`소명은 보냈지만 증빙 ${failed}개를 올리지 못했어요. 1:1 문의로 보내 주세요.`);
          setStatement("");
          setFiles([]);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-warn">
          소명 내용 <span className="text-xs">(10~1,000자 · 이 조치에 한 번 · {deadline}까지)</span>
        </span>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="예) 촬영 전에 모델분께 게시 동의를 받았어요. 동의 날짜와 방법은 ..."
          className="rounded-xl border border-line bg-bg px-3 py-2 text-base text-text"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-warn">
        <span>
          증빙 <span className="text-xs">(선택 · 동의서 · 촬영 당시 대화 등 사진 {MAX_APPEAL_FILES}장까지 · 운영자만 보고 처리 90일 뒤 지워져요)</span>
        </span>
        <input
          type="file"
          accept={EVIDENCE_ACCEPT}
          multiple
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            const problem =
              picked.map(evidenceFileProblem).find((p) => p !== null) ??
              (picked.length > MAX_APPEAL_FILES ? `${MAX_APPEAL_FILES}장까지 고를 수 있어요` : null);
            setFileError(problem);
            setFiles(problem ? [] : picked);
            if (problem) e.target.value = "";
          }}
          className="text-sm text-text file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-bg file:px-3 file:text-text"
        />
        {fileError && (
          <span role="alert" className="text-xs text-danger">
            {fileError}
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || length < 10}
        className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "보내는 중…" : "소명 보내기"}
      </button>
    </form>
  );
}
