"use client";

import { saveProviderProfileAction } from "@/app/actions";
import {
  AvailabilityGrid,
  CheckboxGroup,
  FormMessage,
  FormSection,
  opts,
  SelectField,
  SubmitButton,
  TextArea,
  TextField,
  Toggle,
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
import type { ProviderProfile } from "@/lib/domain/types";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

export function ProviderProfileForm({
  profile,
  defaultName,
  linkedinUrl,
}: {
  profile: ProviderProfile | null;
  defaultName: string;
  linkedinUrl: string | null;
}) {
  const { state, formAction, pending, onSubmit } = useActionForm(saveProviderProfileAction);
  const fe = state.fieldErrors ?? {};
  const p = profile;
  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormMessage state={state} />

      <FormSection title="Your public profile" description="Approved profiles are shown to matching students. Your email and LinkedIn are never shown to them.">
        <TextField name="fullName" label="Full name" autoComplete="name" required defaultValue={p?.fullName ?? defaultName} errors={fe.fullName} />
        <TextField name="headline" label="Headline" placeholder="e.g. Software engineer · tutors programming" maxLength={140} defaultValue={p?.headline} errors={fe.headline} />
        <TextArea name="bio" label="Bio" required minLength={40} maxLength={1500} hint="Who you are and how you like to help. At least 40 characters." defaultValue={p?.bio} errors={fe.bio} />
        <TextField name="expertise" label="Areas of expertise" placeholder="e.g. corporate finance, machine learning" hint="Separate with commas." defaultValue={p?.expertise.join(", ")} errors={fe.expertise} />
      </FormSection>

      <FormSection title="What you offer" description="Mentoring and tutoring are matched separately. Offer one or both.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle name="offersMentoring" label="I offer mentoring" hint="Career and university guidance." defaultChecked={p?.offersMentoring} />
          <Toggle name="offersTutoring" label="I offer academic tutoring" hint="Help with specific subjects." defaultChecked={p?.offersTutoring} />
        </div>
        {fe.offersMentoring && <p className="text-sm font-medium text-red-700">{fe.offersMentoring.join(" ")}</p>}
        <CheckboxGroup name="tutoringSubjects" label="Subjects you tutor" hint="Required for tutoring." options={opts(SUBJECTS, m.subjects)} defaultValue={p?.tutoringSubjects} columns={3} errors={fe.tutoringSubjects} />
        <CheckboxGroup name="teachingLevels" label="Levels you can teach" hint="Required for tutoring. Students only match at a level you teach." options={opts(TEACHING_LEVELS, m.levels)} defaultValue={p?.teachingLevels} columns={3} errors={fe.teachingLevels} />
        <CheckboxGroup name="mentoringTopics" label="Mentoring topics" hint="For mentoring, choose topics, career areas, or both." options={opts(MENTORING_GOALS, m.goals)} defaultValue={p?.mentoringTopics} errors={fe.mentoringTopics} />
      </FormSection>

      <FormSection title="Career experience">
        <CheckboxGroup name="careerAreas" label="Career areas you have worked in" options={opts(CAREER_AREAS, m.careerAreas)} defaultValue={p?.careerAreas} columns={3} errors={fe.careerAreas} />
        <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
          <TextField name="yearsExperience" label="Years of experience" type="number" min={0} max={70} inputMode="numeric" required defaultValue={p?.yearsExperience ?? 0} errors={fe.yearsExperience} />
          <TextField
            name="linkedinUrl"
            label="LinkedIn URL"
            type="url"
            placeholder="https://linkedin.com/in/…"
            hint="Only UIS staff can see this. It helps us review your profile."
            defaultValue={linkedinUrl ?? ""}
            errors={fe.linkedinUrl}
          />
        </div>
        <TextArea name="careerExperience" label="Experience summary" rows={3} maxLength={1500} defaultValue={p?.careerExperience} errors={fe.careerExperience} />
      </FormSection>

      <FormSection title="Languages, schedule and capacity">
        <CheckboxGroup name="languages" label="Languages you can mentor or tutor in" required options={opts(LANGUAGES, m.languages)} defaultValue={p?.languages} columns={3} errors={fe.languages} />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField name="timeZone" label="Time zone" required options={TIME_ZONES.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} defaultValue={p?.timeZone} errors={fe.timeZone} />
          <TextField name="maxActiveMentees" label="Maximum active mentees" type="number" min={1} max={50} inputMode="numeric" required hint="Accepted and introduced requests count towards this." defaultValue={p?.maxActiveMentees ?? 2} errors={fe.maxActiveMentees} />
        </div>
        <AvailabilityGrid defaultValue={p?.availability} errors={fe.availability} />
      </FormSection>

      <FormSection title="Directory permission">
        <Toggle
          name="directoryConsent"
          label="Show my profile to matching students"
          hint="Required to receive requests. Students see your name, headline, bio, expertise, languages, availability and what you offer. Never your contact details."
          defaultChecked={p?.directoryConsent ?? false}
        />
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{p ? "Save changes" : "Submit for UIS review"}</SubmitButton>
        {!p && <p className="text-sm text-muted">UIS reviews new profiles before they appear to students.</p>}
      </div>
    </form>
  );
}
