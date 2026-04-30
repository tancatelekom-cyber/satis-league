import { UserRole } from "@/lib/types";

export const roleLabels: Record<UserRole, string> = {
  employee: "Calisan",
  manager: "Magaza Muduru",
  management: "Yonetim",
  admin: "Admin"
};

export const approvalLabels = {
  approved: "Onaylandi",
  pending: "Admin onayi bekliyor",
  rejected: "Reddedildi"
} as const;
