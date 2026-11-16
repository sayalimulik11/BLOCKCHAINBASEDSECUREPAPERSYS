import { ExamMetaSchema } from '@sigil/core/schemas';
import type { paths } from '../../api/generated';

type ExamDetailsResponse =
  paths['/api/exams/{id}']['get']['responses'][200]['content']['application/json'];
export type EncryptedShareResponse =
  paths['/api/exams/{id}/shares/me']['get']['responses'][200]['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function fetchExamMetadata(examId: string): Promise<ReturnType<typeof ExamMetaSchema.parse>> {
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Exam No. ${examId.padStart(4, '0')} metadata request failed with HTTP ${response.status}.`);
  }
  const details = await response.json() as ExamDetailsResponse;
  if (!isRecord(details) || !('metaJson' in details)) {
    throw new Error(`Exam No. ${examId.padStart(4, '0')} has no stored metadata.`);
  }
  let metadata: unknown = details.metaJson;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      throw new Error(`Exam No. ${examId.padStart(4, '0')} metadata is not valid JSON.`);
    }
  }
  const parsed = ExamMetaSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new Error(`Exam No. ${examId.padStart(4, '0')} metadata does not match the exam schema.`);
  }
  return parsed.data;
}

export async function fetchMyEncryptedShare(examId: string): Promise<EncryptedShareResponse> {
  const response = await fetch(
    `${apiOrigin}/api/exams/${encodeURIComponent(examId)}/shares/me`,
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) {
    let message = `Encrypted share request failed with HTTP ${response.status}.`;
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
        message = payload.error.message;
      }
    } catch {
      throw new Error(message);
    }
    throw new Error(message);
  }
  return response.json() as Promise<EncryptedShareResponse>;
}
