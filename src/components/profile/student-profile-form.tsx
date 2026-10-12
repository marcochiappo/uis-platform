"use client";

import { saveStudentProfileAction } from "@/app/actions";
import {
  AvailabilityGrid,
  CheckboxGroup,
  FormMessage,
  FormSection,
  opts,
  RadioGroup,
  SelectField,
  SubmitButton,
  TextField,
  useActionForm,
} from "@/components/forms";
import {
  CAREER_AREAS,
  LANGUAGES,
  MENTORING_GOALS,
  SUBJECTS,
  TEACHING_LEVELS,
  TIME_ZONES,
} from "@/lib/domain/options";
import type { StudentProfile } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

export function StudentProfileForm({ profile, defaultName }: { profile: StudentProfile | null; defaultName: string }) {
  const { state, formAction, pending, onSubmit } = useActionForm(saveStudentProfileAction);
  const fe = state.fieldErrors ?? {};
  const p = profile;
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormMessage state={state} />

      <FormSection title="About you">
        <TextField name="fullName" label="Full name" autoComplete="name" required defaultValue={p?.fullName ?? defaultName} errors={fe.fullName} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="university" label="University" required defaultValue={p?.university} errors={fe.university} />
          <TextField name="degree" label="Degree programme" placeholder="e.g. BSc Economics" required defaultValue={p?.degree} errors={fe.degree} />
          <SelectField name="degreeLevel" label="Level of study" required options={opts(TEACHING_LEVELS, m.levels)} defaultValue={p?.degreeLevel} errors={fe.degreeLevel} hint="Tutors must teach at this level." />
          <TextField name="studyYear" label="Year of study" type="number" min={1} max={10} inputMode="numeric" defaultValue={p?.studyYear ?? ""} errors={fe.studyYear} />
        </div>
      </FormSection>

      <FormSection title="Language and time zone">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField name="preferredLanguage" label="Preferred language" required options={opts(LANGUAGES, m.languages)} defaultValue={p?.preferredLanguage} errors={fe.preferredLanguage} />
          <SelectField name="timeZone" label="Time zone" required options={TIME_ZONES.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} defaultValue={p?.timeZone} errors={fe.timeZone} />
        </div>
        <CheckboxGroup name="languages" label="Other languages you're comfortable with" options={opts(LANGUAGES, m.languages)} defaultValue={p?.languages} columns={3} errors={fe.languages} />
      </FormSection>

      <FormSection title="What support are you looking for?" description="Mentoring is about direction and experience. Tutoring is help with a specific subject.">
        <RadioGroup
          name="seeking"
          label="I'm looking for"
          defaultValue={p?.seeking}
          errors={fe.seeking}
          options={[
            { value: "mentoring", label: m.seeking.mentoring, description: "Career and university guidance" },
            { value: "tutoring", label: m.seeking.tutoring, description: "Help with a subject" },
            { value: "both", label: m.seeking.both, description: "Mentoring and tutoring" },
          ]}
        />
        <CheckboxGroup name="goals" label="Mentoring goals" hint="Needed for mentoring (or choose career areas below)." options={opts(MENTORING_GOALS, m.goals)} defaultValue={p?.goals} errors={fe.goals} />
        <CheckboxGroup name="careerAreas" label="Career areas you're interested in" options={opts(CAREER_AREAS, m.careerAreas)} defaultValue={p?.careerAreas} columns={3} errors={fe.careerAreas} />
        <CheckboxGroup name="subjects" label="Subjects you'd like tutoring in" hint="Needed for tutoring." options={opts(SUBJECTS, m.subjects)} defaultValue={p?.subjects} columns={3} errors={fe.subjects} />
        <TextField name="interests" label="Interests" placeholder="e.g. robotics, opera, cycling" hint="Separate with commas. Shown to mentors you contact." defaultValue={p?.interests.join(", ")} errors={fe.interests} />
      </FormSection>

      <FormSection title="Availability">
        <AvailabilityGrid defaultValue={p?.availability} errors={fe.availability} />
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{p ? "Save changes" : "Create profile and see matches"}</SubmitButton>
        <p className="text-sm text-muted">Mentors you contact see your name, studies, goals and interests. They never see your email.</p>
      </div>
    </form>
  );
}
