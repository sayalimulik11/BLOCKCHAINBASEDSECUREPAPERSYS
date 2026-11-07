import { z } from "zod";
import { getAddress } from "ethers";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine((value) => {
  try {
    return value === getAddress(value) && value !== "0x0000000000000000000000000000000000000000";
  } catch {
    return false;
  }
}, "Address must be checksummed and non-zero");
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine((value) => !/^0x0{64}$/i.test(value), "Hash must not be zero");
const safeText = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);

export const QuestionSchema = z.object({
  text: z.string().min(10).max(2000).refine(safeText, "Control characters are not allowed"),
  options: z.tuple([
    z.string().min(1).max(500).refine(safeText, "Control characters are not allowed"),
    z.string().min(1).max(500).refine(safeText, "Control characters are not allowed"),
    z.string().min(1).max(500).refine(safeText, "Control characters are not allowed"),
    z.string().min(1).max(500).refine(safeText, "Control characters are not allowed"),
  ]).superRefine((options, ctx) => {
    const trimmed = options.map((x) => x.trim());
    if (new Set(trimmed).size !== 4) ctx.addIssue({ code: "custom", message: "Options must be unique" });
  }),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().max(2000).refine(safeText, "Control characters are not allowed").optional()
});

export const BatchPlainSchema = z.object({
  v: z.literal(1),
  examId: z.string().min(1),
  sectionId: z.number().int().min(0).max(7),
  setter: address,
  questions: z.array(QuestionSchema).min(1).max(500)
});

export const ExamMetaSchema = z.object({
  title: z.string().trim().min(5).max(120),
  sections: z.array(z.object({ name: z.string().trim().min(2).max(40), quota: z.number().int().min(1).max(500) })).min(1).max(8),
  releaseOpensAt: z.number().int().nonnegative(),
  examStartsAt: z.number().int().nonnegative(),
  examEndsAt: z.number().int().nonnegative()
}).superRefine((meta, ctx) => {
  const names = meta.sections.map((section) => section.name);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "Section names must be unique" });
  }
  if (!(meta.releaseOpensAt < meta.examStartsAt && meta.examStartsAt < meta.examEndsAt)) {
    ctx.addIssue({ code: "custom", path: ["releaseOpensAt"], message: "Exam times must be strictly ordered" });
  }
  if (meta.examStartsAt - meta.releaseOpensAt > 6 * 60 * 60) {
    ctx.addIssue({ code: "custom", path: ["releaseOpensAt"], message: "Release window must be no more than six hours" });
  }
});

export const VariantItemSchema = z.object({
  qid: z.string().regex(/^\d+:\d+$/),
  opts: z.tuple([z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3))]).superRefine((opts, ctx) => {
    if (new Set(opts).size !== 4) ctx.addIssue({ code: "custom", message: "Option order must be a permutation" });
  })
});

export const VariantSchema = z.object({
  v: z.literal(1),
  examId: z.string().regex(/^\d+$/),
  centre: address,
  sections: z.array(z.object({ sectionId: z.number().int().nonnegative(), items: z.array(VariantItemSchema) }))
});

export const HashSchema = hex32;
export const AddressSchema = address;
export const ChecksummedAddressSchema = address;
export const APIErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
export const ProfilePayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  organisation: z.string().trim().min(1).max(200),
});
export const ProfileResponseSchema = z.object({
  address: ChecksummedAddressSchema,
  displayName: z.string().nullable(),
  organisation: z.string().nullable(),
  profileHash: hex32.nullable(),
});
export const AuthVerifyPayloadSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});
export const NonceResponseSchema = z.object({ nonce: z.string().min(1) });
export const AuthResponseSchema = z.object({
  address: ChecksummedAddressSchema,
  roles: z.array(z.string()),
});
export const EventsQuerySchema = z.object({
  exam: z.string().regex(/^\d+$/).optional(),
  type: z.string().min(1).max(100).optional(),
  actor: ChecksummedAddressSchema.optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  cursor: z.string().min(1).optional(),
});

export const MatchReportSchema = z.object({
  matches: z.array(z.object({
    variantHash: hex32,
    centre: address,
    score: z.number().min(0).max(1),
    evidence: z.array(z.string())
  }))
});

export const ChainEventResponseSchema = z.object({
  id: z.string(),
  blockNumber: z.string().regex(/^\d+$/),
  logIndex: z.number().int().nonnegative(),
  txHash: hex32,
  examId: z.string().nullable(),
  type: z.string(),
  actor: address.nullable(),
  payloadJson: z.record(z.string(), z.unknown()).meta({
    description:
      "Event arguments keyed by their ABI parameter names. For ParticipantRegistered: { account, role, profileHash }.",
    example: {
      account: "0x0000000000000000000000000000000000000001",
      role: "1",
      profileHash: `0x${"0".repeat(64)}`,
    },
  }),
  blockTimestamp: z.string().regex(/^\d+$/)
});
export const EventsResponseSchema = z.object({
  events: z.array(ChainEventResponseSchema),
  nextCursor: z.string().nullable()
});

export const StatsOverviewResponseSchema = z.object({
  totalExams: z.number().int().nonnegative(),
  examsByState: z.object({
    draft: z.number().int().nonnegative(),
    collecting: z.number().int().nonnegative(),
    sealed: z.number().int().nonnegative(),
    released: z.number().int().nonnegative(),
    concluded: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative()
  }),
  totalEvents: z.number().int().nonnegative(),
  batchesByStatus: z.object({
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative()
  }),
  participantsByRole: z.object({
    ADMIN: z.number().int().nonnegative(),
    AUTHORITY: z.number().int().nonnegative(),
    SETTER: z.number().int().nonnegative(),
    HOLDER: z.number().int().nonnegative(),
    CENTRE: z.number().int().nonnegative(),
    AUDITOR: z.number().int().nonnegative()
  })
});

export const ExamReadinessResponseSchema = z.object({
  examId: z.string().regex(/^\d+$/),
  holders: z.array(z.object({
    address,
    steps: z.object({
      keyRegistered: z.boolean(),
      randomnessCommitted: z.boolean()
    })
  })),
  setters: z.array(z.object({
    address,
    steps: z.object({
      batchesSubmitted: z.boolean(),
      batchCount: z.number().int().nonnegative()
    })
  })),
  notTrackedByServer: z.array(z.literal("shareVerified"))
});

export const CreateExamPayloadSchema = z.object({
  metaHash: hex32,
  releaseOpensAt: z.number().int().nonnegative(),
  examStartsAt: z.number().int().nonnegative(),
  examEndsAt: z.number().int().nonnegative(),
  threshold: z.number().int().min(2),
  holders: z.array(address).min(3).max(20),
  setters: z.array(address).min(1),
  centres: z.array(address).min(1),
  quotas: z.array(z.number().int().min(1).max(500)).min(1).max(8)
}).superRefine((exam, ctx) => {
  if (exam.threshold <= exam.holders.length / 2 || exam.threshold > exam.holders.length) {
    ctx.addIssue({ code: "custom", path: ["threshold"], message: "Threshold must be greater than half the holders and at most their count" });
  }
  const panel = [...exam.holders, ...exam.setters, ...exam.centres];
  if (new Set(panel).size !== panel.length) {
    ctx.addIssue({ code: "custom", path: ["holders"], message: "Panel addresses must not be duplicated" });
  }
  if (!(exam.releaseOpensAt < exam.examStartsAt && exam.examStartsAt < exam.examEndsAt)) {
    ctx.addIssue({ code: "custom", path: ["releaseOpensAt"], message: "Exam times must be strictly ordered" });
  }
  if (exam.examStartsAt - exam.releaseOpensAt > 6 * 60 * 60) {
    ctx.addIssue({ code: "custom", path: ["releaseOpensAt"], message: "Release window must be no more than six hours" });
  }
});
export const BatchUploadPayloadSchema = z.object({ examId: z.string(), sectionId: z.number().int(), ciphertextHash: hex32, questionCount: z.number().int().min(1).max(500) });
export const LeakTracePayloadSchema = z.object({ examId: z.string().regex(/^\d+$/), evidenceHash: hex32, result: MatchReportSchema });

export const Question = QuestionSchema;
export const BatchPlain = BatchPlainSchema;
export const ExamMeta = ExamMetaSchema;
export const Variant = VariantSchema;
