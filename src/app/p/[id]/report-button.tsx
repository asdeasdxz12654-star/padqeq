"use client";

import { useRef, useState, useTransition } from "react";
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_FILES, acceptsEvidence, evidenceFileProblem, isEvidenceType } from "@/lib/moderation/evidence";
import { REASON_LABEL, REPORT_REASONS, type ReportReason } from "@/lib/moderation/reasons";
import { startEvidence, submitReport } from "./actions";

/** 증거 사진 하나 올리기: 자리 만들기 → 파일 올리기. 실패하면 false */
async function uploadEvidence(reportId: string, file: File): Promise<boolean> {
  if (!isEvidenceType(file.type)) return false;
  const slot = await startEvidence({ reportId, contentType: file.type, bytes: file.size });
  if (!slot.ok) return false;
  const response = await fetch(`/api/reports/evidence/${slot.id}`, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  }).catch(() => null);
  return response?.ok ?? false;
}

// S-15 신고 (게시물 › 신고). 접수되면 신고자 피드에서 바로 빠진다.
export function ReportButton({ postId, photoCount }: { postId: string; photoCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [photo, setPhoto] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [failedUploads, setFailedUploads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="self-start text-sm text-quiet underline underline-offset-4 hover:text-text"
      >
        {done ? "신고 접수됨" : "신고"}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="report-title"
        className="m-auto max-h-[90dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-text backdrop:bg-black/70"
      >
        {done ? (
          <div className="flex flex-col gap-4 p-5">
            <h2 id="report-title" className="text-lg font-bold">
              접수되었어요
            </h2>
            <p className="text-sm leading-relaxed text-quiet">운영팀이 확인할게요. 이 게시물은 내 피드에서 더 이상 보이지 않아요.</p>
            {failedUploads > 0 && (
              <p role="alert" className="text-sm text-danger">
                증거 사진 {failedUploads}장을 올리지 못했어요. 신고는 접수됐으니 필요하면 문의 이메일로 보내 주세요.
              </p>
            )}
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent"
            >
              닫기
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason) return;
              setError(null);
              startTransition(async () => {
                const result = await submitReport({
                  postId,
                  reason,
                  detail,
                  photoPosition: photo === "" ? null : Number(photo),
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                // 신고는 이미 접수됐다. 증거 실패는 알려만 준다.
                let failed = 0;
                if (acceptsEvidence(reason)) for (const file of files) if (!(await uploadEvidence(result.reportId, file))) failed++;
                setFailedUploads(failed);
                setDone(true);
              });
            }}
          >
            <h2 id="report-title" className="text-lg font-bold">
              신고 사유를 선택하세요
            </h2>
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">신고 사유</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slot has-checked:bg-slot">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm">
                    {REASON_LABEL[r].title}
                    {REASON_LABEL[r].hint && <span className="block text-xs text-quiet">{REASON_LABEL[r].hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>

            {photoCount > 1 && (
              <label className="flex flex-col gap-1.5 text-sm">
                문제가 있는 사진
                <select
                  value={photo}
                  onChange={(e) => setPhoto(e.target.value)}
                  className="min-h-11 rounded-xl border border-line bg-bg px-3"
                >
                  <option value="">게시물 전체</option>
                  {Array.from({ length: photoCount }, (_, i) => (
                    <option key={i} value={i}>
                      {i + 1}번째 사진
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              자세한 내용 <span className="text-xs text-quiet">(선택 · 운영팀만 봐요)</span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={1000}
                rows={3}
                className="rounded-xl border border-line bg-bg px-3 py-2 text-base"
              />
            </label>

            {acceptsEvidence(reason) && (
            <div className="flex flex-col gap-1.5 text-sm">
              <label htmlFor={`evidence-${postId}`}>
                증거 사진 <span className="text-xs text-quiet">(선택 · {MAX_EVIDENCE_FILES}장까지 · 운영팀만 봐요)</span>
              </label>
              <input
                id={`evidence-${postId}`}
                type="file"
                accept={EVIDENCE_ACCEPT}
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  const problem = picked.map(evidenceFileProblem).find((p) => p !== null) ?? null;
                  const tooMany = picked.length > MAX_EVIDENCE_FILES ? `${MAX_EVIDENCE_FILES}장까지 고를 수 있어요` : null;
                  setFileError(problem ?? tooMany);
                  setFiles(problem || tooMany ? [] : picked);
                  if (problem || tooMany) e.target.value = "";
                }}
                className="text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-bg file:px-3 file:text-text"
              />
              <span className="text-xs leading-relaxed text-quiet">
                내 원본 사진 · 동의하지 않았다는 대화 화면 등. 원본 사진의 촬영 정보(날짜 · 기기 · 위치)도 본인 확인을 위해 그대로 전달돼요.
              </span>
              {fileError && <span role="alert" className="text-xs text-danger">{fileError}</span>}
              <span className="text-xs text-quiet">처리가 끝나고 90일 뒤 자동으로 지워져요.</span>
            </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!reason || pending}
                className="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
              >
                {pending ? "보내는 중…" : "신고하기"}
              </button>
              <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-xl border border-line px-4">
                취소
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
