export const PARTICIPANT_ROLES = ["AUTHORITY", "SETTER", "HOLDER", "CENTRE", "AUDITOR"] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export interface ParticipantRecord {
  address: string;
  roles: ParticipantRole[];
  displayName: string | null;
  organisation: string | null;
  profileHash: string | null;
}
