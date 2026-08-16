import type { AdminAuditEvent, AdminUser, AuditConfig } from "../core/types.js";

type AuditEventInput = Omit<AdminAuditEvent, "actor" | "timestamp">;

/** Write a mutation event when the host configured an audit destination. */
export async function writeAuditEvent(audit: AuditConfig | undefined, adminUser: AdminUser, event: AuditEventInput): Promise<void> {
   if (!audit) return;

   await audit.write({
      ...event,
      actor: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      timestamp: new Date(),
   });
}
