import { z } from "zod";

export const passwordSchema = z.string().min(8, "密码至少 8 位").max(128);
export const registerSchema = z.object({
  username: z.string().min(3, "用户名至少 3 位").max(32).regex(/^[a-zA-Z0-9_-]+$/, "仅支持字母、数字、下划线和短横线"),
  email: z.email("请输入有效邮箱").max(254),
  displayName: z.string().min(1, "请输入显示名称").max(64),
  password: passwordSchema,
  inviteCode: z.string().max(128, "邀请码过长").optional(),
});
export const loginSchema = z.object({
  identifier: z.string().min(1, "请输入用户名或邮箱"),
  password: passwordSchema,
});

export const requirementSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "请输入要求标题").max(100),
  description: z.string().min(1, "请输入验收标准").max(2000),
  required: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export const taskSchema = z.object({
  projectId: z.string().uuid("请选择项目"),
  title: z.string().min(1, "请输入事项").max(120),
  summary: z.string().min(1, "写一点备注").max(300),
  description: z.string().min(1, "写一点备注").max(20000),
  category: z.string().max(50).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  claimMode: z.enum(["AUTO", "APPROVAL"]),
  maxAssignees: z.number().int().min(1).max(20),
  rewardType: z.enum(["POINTS", "CASH_OFFLINE", "ITEM", "SERVICE", "OTHER"]),
  rewardAmount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "金额格式不正确").nullable().optional(),
  rewardDescription: z.string().max(500).nullable().optional(),
  rewardOptions: z.array(z.string().trim().min(1).max(500)).max(8).optional(),
  locationType: z.enum(["REMOTE", "ONSITE", "HYBRID", "UNSPECIFIED"]),
  locationDescription: z.string().max(500).nullable().optional(),
  timeMode: z.enum(["BEFORE", "WITHIN", "AT"]),
  durationValue: z.number().int().positive("请输入大于 0 的时长").max(525600).nullable().optional(),
  durationUnit: z.enum(["MINUTES", "HOURS", "DAYS"]).nullable().optional(),
  deadline: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "请选择有效时间").nullable().optional(),
  requirements: z.array(requirementSchema).min(1, "至少添加一条任务要求").max(30),
}).superRefine((value, context) => {
  if (value.timeMode === "WITHIN") {
    if (!value.durationValue) context.addIssue({ code: "custom", path: ["durationValue"], message: "请输入完成时长" });
    if (!value.durationUnit) context.addIssue({ code: "custom", path: ["durationUnit"], message: "请选择时间单位" });
    if (value.durationValue && value.durationUnit && durationMinutes(value.durationValue, value.durationUnit) > 525_600) {
      context.addIssue({ code: "custom", path: ["durationValue"], message: "任务时长不能超过一年" });
    }
  } else if (!value.deadline) {
    context.addIssue({ code: "custom", path: ["deadline"], message: value.timeMode === "AT" ? "请选择具体执行时间" : "请选择截止时间" });
  }
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskInput = z.infer<typeof taskSchema>;

function durationMinutes(value: number, unit: "MINUTES" | "HOURS" | "DAYS") {
  if (unit === "HOURS") return value * 60;
  if (unit === "DAYS") return value * 24 * 60;
  return value;
}
