export interface EnrichmentData {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  companySize: string | null;
  industry: string | null;
  linkedinUrl: string | null;
  location: string | null;
  experience: ExperienceEntry[];
  skills: string[];
  headline: string | null;
  summary: string | null;
  companyLinkedinUrl: string | null;
  companyDescription: string | null;
  companyFounded: string | null;
  companyRevenue: string | null;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}
