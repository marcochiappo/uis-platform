import { RecruitmentTabs } from "@/components/admin/recruitment-tabs";
import { PageHeader } from "@/components/ui";

export default function RecruitmentLayout({ children }: LayoutProps<"/admin/prospects">) {
  return (
    <>
      <PageHeader
        eyebrow="UIS admin"
        title="Mentor recruitment"
        description="Find and invite potential mentors. Candidates aren't users: they appear to students only after signing up, completing a profile, agreeing to be listed and passing UIS review."
      />
      <RecruitmentTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
