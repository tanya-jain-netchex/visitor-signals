// RB2B LIVE WEBHOOK payload format (actual field names from webhook)
// These use spaces and differ from the CSV export format
export interface RB2BWebhookPayload {
  "First Name"?: string;
  "Last Name"?: string;
  "Title"?: string;
  "Company Name"?: string;
  "Business Email"?: string;
  "LinkedIn URL"?: string;
  "Website"?: string;
  "Industry"?: string;
  "Employee Count"?: string;
  "Estimate Revenue"?: string;
  "City"?: string;
  "State"?: string;
  "Zipcode"?: string;
  "Captured URL"?: string;      // Single page URL from this visit
  "Referrer"?: string;
  "Seen At"?: string;           // ISO timestamp of this visit
  "Tags"?: string | string[];
  // Company/Website-level profile has no First Name
  // Profile type is inferred: no First Name = Company profile
}

// RB2B CSV export payload format (PascalCase column headers)
export interface RB2BCSVPayload {
  LinkedInUrl?: string;
  FirstName?: string;
  LastName?: string;
  Title?: string;
  CompanyName?: string;
  AllTimePageViews?: number | string;
  WorkEmail?: string;
  Website?: string;
  Industry?: string;
  EstimatedEmployeeCount?: string;
  EstimateRevenue?: string;
  City?: string;
  State?: string;
  Zipcode?: string;
  LastSeenAt?: string;
  FirstSeenAt?: string;
  NewProfile?: string | boolean;
  MostRecentReferrer?: string;
  RecentPageCount?: number | string;
  RecentPageUrls?: string | string[];
  Tags?: string | string[];
  FilterMatches?: string | string[];
  ProfileType?: string;
}

// Legacy alias — CSV route uses this
export type RB2BPayload = RB2BCSVPayload;

// Normalized internal visitor data (same regardless of source)
export interface NormalizedVisitor {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  website: string | null;
  industry: string | null;
  employeeCount: string | null;
  estimatedRevenue: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  profileType: "Person" | "Company";
  tags: string[];
  filterMatches: string[];
  allTimePageViews: number;
  isNewProfile: boolean;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  pageUrls: string[];
  referrer: string | null;
}
