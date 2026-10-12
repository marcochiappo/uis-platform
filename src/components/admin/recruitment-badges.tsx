import { Badge } from "@/components/ui";
import type { CommunityAffiliation, EmailStatus, OutreachStatus, ProspectReview, ProspectSource, ProspectStatus } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";

const m = getMessages();
const R = m.recruitment;

export function SourceBadge({ source }: { source: ProspectSource }) {
  if (source === "apollo_mock") return <Badge tone="danger">MOCK data</Badge>;
  if (source === "demo-seed") return <Badge tone="warning">Fictional demo</Badge>;
  return <Badge>{R.source[source]}</Badge>;
}

export function ReviewBadgeR({ status }: { status: ProspectReview }) {
  return <Badge tone={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{R.review[status]}</Badge>;
}

export function AffiliationBadge({ value }: { value: CommunityAffiliation }) {
  return <Badge tone={value === "confirmed" ? "success" : value === "not_affiliated" ? "neutral" : "info"}>{R.affiliation[value]}</Badge>;
}

export function EmailBadge({ status }: { status: EmailStatus }) {
  return <Badge tone={status === "verified" ? "success" : status === "none" || status === "unavailable" ? "neutral" : "warning"}>{R.emailStatus[status]}</Badge>;
}

export function PipelineBadge({ status }: { status: ProspectStatus }) {
  const tone = { new: "neutral", invited: "info", interested: "brand", declined: "danger", joined: "success" } as const;
  return <Badge tone={tone[status]}>{m.prospectStatus[status]}</Badge>;
}

export function OutreachBadge({ status }: { status: OutreachStatus }) {
  const tone = {
    draft: "neutral",
    approved: "info",
    sending: "warning",
    sent: "success",
    failed: "danger",
    bounced: "danger",
    mock_logged: "warning",
    cancelled: "neutral",
  } as const;
  return <Badge tone={tone[status]}>{R.outreach[status]}</Badge>;
}
