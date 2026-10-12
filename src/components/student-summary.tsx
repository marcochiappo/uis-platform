import { DemoBadge, TagList } from "@/components/ui";
import { getMessages } from "@/lib/i18n";
import type { StudentSummary } from "@/lib/services";

const m = getMessages();

/** The profile details a mentor sees about a requesting student. No contact info by design. */
export function StudentSummaryCard({ student }: { student: StudentSummary | null }) {
  if (!student) return <p className="text-sm text-muted">This student&apos;s profile is no longer available.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-ink">{student.fullName}</p>
        <DemoBadge show={student.isDemo} />
      </div>
      <p className="text-sm text-muted">
        {student.degree} · {m.levels[student.degreeLevel]}
        {student.studyYear ? `, year ${student.studyYear}` : ""} · {student.university}
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Languages</dt>
          <dd className="mt-1">
            <TagList items={[...new Set([student.preferredLanguage, ...student.languages])].map((l) => m.languages[l])} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Time zone</dt>
          <dd className="mt-1">{student.timeZone.replace(/_/g, " ")}</dd>
        </div>
        {student.goals.length > 0 && (
          <div>
            <dt className="font-semibold">Goals</dt>
            <dd className="mt-1">
              <TagList items={student.goals.map((g) => m.goals[g])} />
            </dd>
          </div>
        )}
        {student.subjects.length > 0 && (
          <div>
            <dt className="font-semibold">Subjects</dt>
            <dd className="mt-1">
              <TagList items={student.subjects.map((s) => m.subjects[s])} />
            </dd>
          </div>
        )}
        {student.careerAreas.length > 0 && (
          <div>
            <dt className="font-semibold">Career interests</dt>
            <dd className="mt-1">
              <TagList items={student.careerAreas.map((c) => m.careerAreas[c])} />
            </dd>
          </div>
        )}
        {student.interests.length > 0 && (
          <div>
            <dt className="font-semibold">Interests</dt>
            <dd className="mt-1">
              <TagList items={student.interests} />
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
