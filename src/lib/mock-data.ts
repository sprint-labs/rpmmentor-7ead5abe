// Mentor Hub by RPM — roster dataset.
// The goalkeeper roster in SEED below is the live RPM client list.
// Interactions, reports, media and calendar events remain illustrative until
// wired to their live stores; consumer surfaces are labelled via
// src/lib/data-classification.tsx.


export type TierLevelLabel = "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4";
export type GoalkeeperTag = "Academy" | "Free Agent";
// Status is retained for older surfaces that still present a goalkeeper's
// primary category. New roster views should use `tier` plus `tags` instead.
export type Status = TierLevelLabel | GoalkeeperTag;
// Legacy alias — many components still import Tier.
export type Tier = Status;

export type Region = "UK Based" | "Overseas" | "Free Agent";

// RPM roster is grouped into four management-controlled duty-of-care tiers.
// League is displayed separately and must not invent the tier.
export type TierLevel = 1 | 2 | 3 | 4;

export interface TierDefinition {
  level: TierLevel;
  label: string;
  summary: string;
  leagues: readonly string[];
}

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    level: 1,
    label: "Duty of care — two live contacts a month",
    summary: "Management-set. Not inferred from league.",
    leagues: ["Premier League"],
  },
  {
    level: 2,
    label: "High-level pro",
    summary: "Established professionals in top second tiers and major overseas leagues.",
    leagues: ["EFL Championship", "Serie A", "MLS"],
  },
  {
    level: 3,
    label: "Pro / developing",
    summary: "League One and comparable overseas first divisions.",
    leagues: ["EFL League One", "SPFL Premiership", "Danish Superliga", "Allsvenskan", "UAE Pro League", "Australian A League"],
  },
  {
    level: 4,
    label: "Emerging / lower tier",
    summary: "League Two, National Premier and other developing leagues.",
    leagues: ["EFL League Two", "Australian Nat Prem", "League of Ireland"],
  },
];

export type InteractionType =
  | "Live Match Observation"
  | "Training Ground Visit"
  | "Coffee Catch Up"
  | "Phone Call";


export type ReportType =
  | "Goalkeeper Development"
  | "Match Report"
  | "Training Report"
  | "Opposition GK"
  | "Recruitment";

export type StaffRole =
  | "Director"
  | "Managing Director & Mentor"
  | "Goalkeeper Mentor"
  | "Goalkeeper Intelligence Scout"
  | "Video Analyst"
  | "Recruitment Analyst"
  | "Operations Manager";

export interface Mentor {
  id: string;
  name: string;
  initials: string;
  region: string;
  role: StaffRole;
  email: string;
  phone?: string;
  assignedGks: string[];
  targetInteractions: number;
  completedThisMonth: number;
  yearsExperience: number;
}

export interface Goalkeeper {
  id: string;
  name: string;
  initials: string;
  status: Status;
  tier: TierLevelLabel;
  tags: GoalkeeperTag[];
  tierLevel: TierLevel;
  region: Region;
  mentorId: string;
  club: string;
  league: string;
  age: number;
  dob: string;
  nationality: string;
  contractUntil: string;
  /** Height when recorded from an authoritative source. */
  height: string | null;
  /** Squad shirt number when known; null keeps the profile slot reserved/empty. */
  shirtNumber: number | null;
  /** Preferred foot when recorded from an authoritative source. */
  foot: "Right" | "Left" | null;
  lastInteraction: string;
  nextInteraction: string;
  rating: number;
  potential: number;
  recommendation: "Sign" | "Monitor" | "Pass" | "Loan" | "Develop" | "Retain";
  /**
   * Highlight reel URLs. Empty still reserves a Highlight Reel slot on the
   * profile so every goalkeeper has a place for one.
   */
  videoLinks: string[];
  developmentPlan?: string[];
  bio?: string;
  profileImage?: string;
  instagram?: string;
  parentClub?: string;
  onLoan?: boolean;
}

export interface Interaction {
  id: string;
  gkId: string;
  mentorId: string;
  type: InteractionType;
  date: string;
  notes: string;
  outcome: string;
  followUp: string;
}

export interface Report {
  id: string;
  type: ReportType;
  gkId: string;
  authorId: string;
  date: string;
  rating: number;
  summary: string;
  scores: { handling: number; distribution: number; aerial: number; oneVone: number; communication: number };
}

export interface MediaItem {
  id: string; gkId: string; kind: "video" | "pdf" | "image" | "audio";
  title: string; uploadedBy: string; date: string; size: string;
}

export interface CalendarEvent {
  id: string; date: string; title: string;
  type: "Match" | "Observation" | "Mentor Visit" | "Meeting" | "Follow Up";
  gkId?: string; mentorId?: string;
}

// ---------- deterministic RNG ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1907);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => Math.floor(rand() * (b - a + 1)) + a;
const initialsOf = (n: string) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const daysFromNow = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString(); };

// ---------- RPM Personnel ----------
// Current RPM mentor team + directors. Mentors work collaboratively across
// the entire client roster — there is no per-goalkeeper assignment.
export const mentors: Mentor[] = [
  // Leadership
  { id: "m-rich-lee", name: "Rich Lee", initials: "RL", region: "UK & Ireland", role: "Director", email: "rlee@gkhq.app", phone: "+44 7971 776776", assignedGks: [], targetInteractions: 6, completedThisMonth: 5, yearsExperience: 24 },

  // Mentor team (David Rouse also manages the mentor team)
  { id: "m-david-rouse", name: "David Rouse", initials: "DR", region: "UK & Ireland", role: "Managing Director & Mentor", email: "drouse@gkhq.app", assignedGks: [], targetInteractions: 12, completedThisMonth: 10, yearsExperience: 22 },
  { id: "m-dave-watson", name: "Dave Watson", initials: "DW", region: "North West", role: "Goalkeeper Mentor", email: "dwatson@gkhq.app", assignedGks: [], targetInteractions: 14, completedThisMonth: 11, yearsExperience: 30 },
  { id: "m-andy-marshall", name: "Andy Marshall", initials: "AM", region: "East", role: "Goalkeeper Mentor", email: "amarshall@gkhq.app", assignedGks: [], targetInteractions: 14, completedThisMonth: 12, yearsExperience: 25 },
  { id: "m-jack-stern", name: "Jack Stern", initials: "JS", region: "London & South", role: "Goalkeeper Mentor", email: "jstern@gkhq.app", assignedGks: [], targetInteractions: 12, completedThisMonth: 9, yearsExperience: 12 },
  { id: "m-alec-chamberlain", name: "Alec Chamberlain", initials: "AC", region: "Midlands", role: "Goalkeeper Mentor", email: "achamberlain@gkhq.app", assignedGks: [], targetInteractions: 12, completedThisMonth: 10, yearsExperience: 28 },
  { id: "m-martyn-margetson", name: "Martyn Margetson", initials: "MM", region: "Wales & South West", role: "Goalkeeper Mentor", email: "mmargetson@gkhq.app", assignedGks: [], targetInteractions: 12, completedThisMonth: 8, yearsExperience: 24 },
  { id: "m-martijn-middelbeek", name: "Martijn Middelbeek", initials: "MM", region: "Europe", role: "Goalkeeper Mentor", email: "mmiddelbeek@gkhq.app", assignedGks: [], targetInteractions: 10, completedThisMonth: 8, yearsExperience: 18 },
  { id: "m-matt-beadle", name: "Matt Beadle", initials: "MB", region: "South Coast", role: "Goalkeeper Mentor", email: "mbeadle@gkhq.app", assignedGks: [], targetInteractions: 12, completedThisMonth: 9, yearsExperience: 15 },
];

// The Mentors screen and dashboard metric deliberately use the same roster.
// Directors are managed in People & Users, not counted as mentors in rotation.
export const activeMentors = mentors.filter((mentor) => mentor.role.includes("Mentor"));

// Rotation pool used only to seed each goalkeeper's most-recent-contact mentor.
// Mentors are NOT assigned to specific goalkeepers — the whole team works the roster.
const ASSIGN_POOL = ["m-dave-watson", "m-andy-marshall", "m-jack-stern", "m-alec-chamberlain", "m-martyn-margetson", "m-martijn-middelbeek", "m-matt-beadle", "m-david-rouse"];

// ---------- Goalkeepers ----------
// Live RPM roster (114 goalkeepers). Sourced from the current client list;
// ratings/potential/recommendation remain derived placeholders until wired to
// the Match Reports store.

type Seed = {
  name: string;
  dob: string;
  age: number;
  nationality: string;
  club: string;
  league: string;
  parentClub: string;
  onLoan: boolean;
  tier: TierLevel;
  academy?: boolean;
  contract: string;
  profileImage: string;
  instagram: string;
  comments: string;
  /** Authoritative height when known from the master roster sheet. */
  height?: string | null;
  /** Authoritative shirt number when known from the master roster sheet. */
  shirtNumber?: number | null;
  /** Authoritative preferred foot when known from the master roster sheet. */
  foot?: "Right" | "Left" | null;
};
const SEED: Seed[] = [
  { name: "Brandon Austin", dob: "08/01/1999", age: 27, nationality: "England", club: "Tottenham Hotspur", league: "Premier League", parentClub: "Tottenham Hotspur", onLoan: false, tier: 1, academy: false, contract: "June 2029", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/8y8d2dd469x9q0lc7qfyxypyh.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "James Beadle", dob: "16/07/2004", age: 22, nationality: "England", club: "Birmingham City", league: "EFL Championship", parentClub: "Brighton & Hove Albion", onLoan: true, tier: 1, academy: false, contract: "June 2028", profileImage: "https://resources.premierleague.com/premierleague/photos/players/250x250/p232826.png", instagram: "https://www.instagram.com/james.beadle01/", comments: "", height: "201 cm", shirtNumber: 1, foot: "Right" },
  { name: "Toby Bell", dob: "22/02/2009", age: 17, nationality: "England", club: "Chelsea", league: "Premier League", parentClub: "Chelsea", onLoan: false, tier: 1, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Dan Bentley", dob: "13/07/1993", age: 33, nationality: "England", club: "Wolves", league: "Premier League", parentClub: "Wolves", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/5pbnl8ssfcrxf9lfg1pl3vxzp.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Marcus Bettinelli", dob: "24/05/1992", age: 34, nationality: "England", club: "Manchester City", league: "Premier League", parentClub: "Manchester City", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/9l3cvbbgw484v7la0bjv43mj9.png?quality=60&auto=webp&format=pjpg", instagram: "https://www.instagram.com/marcusbettinelli/", comments: "" },
  { name: "Alex Cairns", dob: "04/01/1993", age: 33, nationality: "England", club: "Leeds United", league: "EFL Championship", parentClub: "Leeds United", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/LFjzy1y-xQGDSlZr5ifgh.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Owen Grainger", dob: "12/07/2007", age: 19, nationality: "Northern Ireland", club: "Nottingham Forest", league: "Premier League", parentClub: "Nottingham Forest", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Xander Grieves", dob: "13/04/2009", age: 17, nationality: "Republic of Ireland", club: "Southampton", league: "EFL Championship", parentClub: "Southampton", onLoan: false, tier: 1, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Steven Hall", dob: "16/01/2005", age: 21, nationality: "Australia", club: "Brighton & Hove Albion", league: "Premier League", parentClub: "Brighton & Hove Albion", onLoan: false, tier: 1, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Blake Irow", dob: "01/09/2008", age: 17, nationality: "England", club: "Tottenham Hotspur", league: "Premier League", parentClub: "Tottenham Hotspur", onLoan: false, tier: 1, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Sebastian Jensen", dob: "20/02/2006", age: 20, nationality: "Denmark", club: "Brighton & Hove Albion", league: "Premier League", parentClub: "Brighton & Hove Albion", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "https://www.instagram.com/sebastian._.jensen/", comments: "Under 21s" },
  { name: "Jack Talbot", dob: "24/09/2008", age: 17, nationality: "England", club: "Arsenal", league: "Premier League", parentClub: "Arsenal", onLoan: false, tier: 1, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Ryan Allsop", dob: "17/06/1992", age: 34, nationality: "England", club: "Birmingham City", league: "EFL Championship", parentClub: "Birmingham City", onLoan: false, tier: 2, academy: false, contract: "June 2028", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/28l80m6m9uivt8v8oou817e8l.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Asmir Begovic", dob: "20/06/1987", age: 39, nationality: "Bosnia-Herzegovina", club: "Leicester City", league: "Premier League", parentClub: "Leicester City", onLoan: false, tier: 1, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/5tlxrhab4kdeud8d2r9z9hk2d.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Luke Bell", dob: "26/10/2003", age: 22, nationality: "England", club: "Coventry City", league: "EFL Championship", parentClub: "Coventry City", onLoan: false, tier: 1, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Josh Bentley", dob: "13/01/2009", age: 17, nationality: "England", club: "Ipswich Town", league: "EFL Championship", parentClub: "Ipswich Town", onLoan: false, tier: 1, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Louis Brady", dob: "28/10/2006", age: 19, nationality: "Republic of Ireland", club: "West Bromwich Albion", league: "EFL Championship", parentClub: "West Bromwich Albion", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Joe Bursik", dob: "12/07/2000", age: 26, nationality: "England", club: "Portsmouth", league: "EFL Championship", parentClub: "Portsmouth", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/3q6jhwert6ah0ll2wq69k93ah.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Callum Burton", dob: "15/08/1996", age: 29, nationality: "England", club: "Wrexham", league: "EFL League One", parentClub: "Wrexham", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/82h98ebusz83rox95oi9kafh1.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "David Button", dob: "27/02/1989", age: 37, nationality: "England", club: "Ipswich Town", league: "EFL Championship", parentClub: "Ipswich Town", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/cf8iupi91wh0n9v6t9fsu5hat.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Murphy Cooper", dob: "27/12/2001", age: 24, nationality: "England", club: "Plymouth Argyle", league: "EFL League One", parentClub: "Plymouth Argyle", onLoan: false, tier: 1, academy: false, contract: "June 2029", profileImage: "", instagram: "", comments: "" },
  { name: "David Cornell", dob: "28/03/1991", age: 35, nationality: "Wales", club: "Preston North End", league: "EFL Championship", parentClub: "Preston North End", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/7fgntq8vwuzwdnw5ra4kcrsgl.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Cooper Covington", dob: "16/04/2010", age: 16, nationality: "England", club: "Bristol City", league: "EFL Championship", parentClub: "Bristol City", onLoan: false, tier: 1, academy: true, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Max Crocombe", dob: "12/08/1993", age: 32, nationality: "New Zealand", club: "Millwall", league: "EFL Championship", parentClub: "Millwall", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/5kfbuHg0REh5MKWoweppn.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Jamie Cumming", dob: "04/09/1999", age: 26, nationality: "England", club: "Oxford United", league: "EFL Championship", parentClub: "Oxford United", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/32sqctjujedqsab4xwy1pwlbd.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Adam Davies", dob: "17/07/1992", age: 34, nationality: "Wales", club: "Sheffield United", league: "EFL Championship", parentClub: "Sheffield United", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/9ztzf56ahfcej4mzcjr4t9ck5.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Seny Dieng", dob: "23/11/1994", age: 31, nationality: "Senegal", club: "Middlesbrough", league: "EFL Championship", parentClub: "Middlesbrough", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/2w4zma0s1nqwc07ni3ivd9t5h.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Jake Donohue", dob: "09/09/2006", age: 19, nationality: "England", club: "Leicester City", league: "Premier League", parentClub: "Leicester City", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Reuben Egan", dob: "27/07/2005", age: 20, nationality: "Republic of Ireland", club: "Wrexham", league: "EFL League One", parentClub: "Wrexham", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Simon Eastwood", dob: "26/06/1989", age: 37, nationality: "England", club: "Oxford United", league: "EFL Championship", parentClub: "Oxford United", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/3oyhjrd1ohnwf1x3d65997xzp.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Frank Fielding", dob: "04/04/1988", age: 38, nationality: "England", club: "Stoke City", league: "EFL Championship", parentClub: "Stoke City", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/1wnnon8d6hyv8v7f6jnd7fth.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Andrew Fisher", dob: "12/02/1998", age: 28, nationality: "England", club: "Swansea City", league: "EFL Championship", parentClub: "Swansea City", onLoan: false, tier: 2, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Felix Goddard", dob: "09/03/2004", age: 22, nationality: "England", club: "Blackburn Rovers", league: "EFL Championship", parentClub: "Blackburn Rovers", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "True Grant", dob: "02/11/2005", age: 20, nationality: "England", club: "FC Halifax Town", league: "National League", parentClub: "Stoke City", onLoan: true, tier: 1, academy: false, contract: "June 2027", profileImage: "https://img.a.transfermarkt.technology/portrait/big/919438-1702498195.jpg?lm=1", instagram: "", comments: "" },
  { name: "Ben Hamer", dob: "20/11/1987", age: 38, nationality: "England", club: "Queens Park Rangers", league: "EFL Championship", parentClub: "Queens Park Rangers", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/2hq4sgf9txf1t1ru67elyenkl.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Jamie Jones", dob: "18/02/1989", age: 37, nationality: "England", club: "Southampton", league: "EFL Championship", parentClub: "Southampton", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/4cnd9pudx0zruqrsdaryzciqd.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Ben Killip", dob: "24/11/1995", age: 30, nationality: "England", club: "Portsmouth", league: "EFL Championship", parentClub: "Portsmouth", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/0cAqCXmiqz_lyw2dNzQqd.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Thimothee Lo-Tutala", dob: "13/02/2003", age: 23, nationality: "France", club: "Hull City", league: "EFL Championship", parentClub: "Hull City", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Joe Lumley", dob: "15/02/1995", age: 31, nationality: "England", club: "Sheffield Wednesday", league: "EFL Championship", parentClub: "Sheffield Wednesday", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/9g45z234d8mk5w4av5fjrx32t.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Lennon MacLorg", dob: "08/10/2005", age: 20, nationality: "England", club: "Gillingham", league: "EFL League Two", parentClub: "Gillingham", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Nicolas Michalski", dob: "14/03/2007", age: 19, nationality: "England", club: "Blackburn Rovers", league: "EFL Championship", parentClub: "Blackburn Rovers", onLoan: false, tier: 1, academy: false, contract: "June 2029", profileImage: "", instagram: "", comments: "" },
  { name: "Louie Moulden", dob: "06/01/2002", age: 24, nationality: "England", club: "Accrington Stanley", league: "EFL League Two", parentClub: "Norwich City", onLoan: true, tier: 2, academy: false, contract: "May 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Rich O’Donnell", dob: "12/09/1988", age: 37, nationality: "England", club: "Derby County", league: "EFL Championship", parentClub: "Derby County", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Dillon Phillips", dob: "11/06/1995", age: 31, nationality: "England", club: "Hull City", league: "EFL Championship", parentClub: "Hull City", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/d0itp0eyxewvnm2shm0manw7p.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "James Pradic", dob: "02/07/2005", age: 21, nationality: "Wales", club: "Preston North End", league: "EFL Championship", parentClub: "Preston North End", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Myles Roberts", dob: "09/12/2001", age: 24, nationality: "England", club: "Watford", league: "EFL Championship", parentClub: "Watford", onLoan: false, tier: 1, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Cieran Slicker", dob: "15/09/2002", age: 23, nationality: "Scotland", club: "Barnsley", league: "EFL League One", parentClub: "Ipswich Town", onLoan: true, tier: 1, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Tom Streets", dob: "16/02/2009", age: 17, nationality: "England", club: "Sheffield Wednesday", league: "EFL Championship", parentClub: "Sheffield Wednesday", onLoan: false, tier: 3, academy: true, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Lewis Thomas", dob: "20/09/1997", age: 28, nationality: "Wales", club: "Bristol City", league: "EFL Championship", parentClub: "Bristol City", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Lawrence Vigouroux", dob: "19/11/1993", age: 32, nationality: "Chile", club: "Swansea City", league: "EFL Championship", parentClub: "Swansea City", onLoan: false, tier: 1, academy: false, contract: "June 2028", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/519wvkcdietyvez20d6qiy4et.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Joe Walsh", dob: "01/04/2002", age: 24, nationality: "England", club: "Wigan Athletic", league: "EFL League One", parentClub: "Queens Park Rangers", onLoan: true, tier: 1, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Calum Ward", dob: "17/10/2000", age: 25, nationality: "England", club: "Queens Park Rangers", league: "EFL Championship", parentClub: "Queens Park Rangers", onLoan: false, tier: 1, academy: false, contract: "—", profileImage: "https://img.a.transfermarkt.technology/portrait/big/655135-1768830647.png?lm=1", instagram: "", comments: "" },
  { name: "Christian Walton", dob: "09/11/1995", age: 30, nationality: "England", club: "Ipswich Town", league: "EFL Championship", parentClub: "Ipswich Town", onLoan: false, tier: 1, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Joe Wildsmith", dob: "28/12/1995", age: 30, nationality: "England", club: "West Bromwich Albion", league: "EFL Championship", parentClub: "West Bromwich Albion", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Woody Williamson", dob: "07/07/2006", age: 20, nationality: "Scotland", club: "Ipswich Town", league: "EFL Championship", parentClub: "Ipswich Town", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Jacob Zetterstrom", dob: "11/07/1998", age: 28, nationality: "Sweden", club: "Derby County", league: "EFL Championship", parentClub: "Derby County", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Luca Ashby-Hammond", dob: "25/03/2001", age: 25, nationality: "England", club: "Plymouth Argyle", league: "EFL League One", parentClub: "Plymouth Argyle", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Jak Alnwick", dob: "17/06/1993", age: 33, nationality: "England", club: "Huddersfield Town", league: "EFL League One", parentClub: "Huddersfield Town", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/cdxn0u3fihn9kt10a9d1b26t.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Alex Bass", dob: "01/04/1998", age: 28, nationality: "England", club: "Peterborough United", league: "EFL League One", parentClub: "Peterborough United", onLoan: false, tier: 1, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Henry Blackledge", dob: "22/09/2005", age: 20, nationality: "Australia", club: "Luton Town", league: "EFL League One", parentClub: "Luton Town", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Jack Bonham", dob: "14/09/1993", age: 32, nationality: "Republic of Ireland", club: "Bolton Wanderers", league: "EFL League One", parentClub: "Bolton Wanderers", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Charlie Booth", dob: "09/11/2007", age: 18, nationality: "England", club: "Luton Town", league: "EFL League One", parentClub: "Luton Town", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Nathan Broome", dob: "03/01/2002", age: 24, nationality: "England", club: "Bolton Wanderers", league: "EFL League One", parentClub: "Bolton Wanderers", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Conor Hazard", dob: "05/03/1998", age: 28, nationality: "Northern Ireland", club: "Wycombe Wanderers", league: "EFL League One", parentClub: "Wycombe Wanderers", onLoan: false, tier: 1, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/5d40u7yyrw2tengmgvpmfnydx.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Max Metcalfe", dob: "28/01/2003", age: 23, nationality: "Scotland", club: "Stockport County", league: "EFL League One", parentClub: "Stockport County", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Stuart Moore", dob: "08/09/1994", age: 31, nationality: "England", club: "Wycombe Wanderers", league: "EFL League One", parentClub: "Wycombe Wanderers", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Tom Norcott", dob: "22/11/2004", age: 21, nationality: "England", club: "Derry City", league: "League of Ireland", parentClub: "Reading", onLoan: true, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Joel Pereira", dob: "28/06/1996", age: 30, nationality: "Portugal", club: "Reading", league: "EFL League One", parentClub: "Reading", onLoan: false, tier: 1, academy: false, contract: "June 2028", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/NxEVbPUFYA6qMmgFpbj8D.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Frankie Phillips", dob: "20/09/2005", age: 20, nationality: "England", club: "Exeter City", league: "EFL League One", parentClub: "Exeter City", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Noah Phillips", dob: "07/12/2004", age: 21, nationality: "England", club: "Leyton Orient", league: "EFL League One", parentClub: "Leyton Orient", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Liam Roberts", dob: "21/11/1994", age: 31, nationality: "England", club: "Mansfield Town", league: "EFL League One", parentClub: "Mansfield Town", onLoan: false, tier: 1, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Matt Rowley", dob: "14/10/2003", age: 22, nationality: "England", club: "Reading", league: "EFL League One", parentClub: "Reading", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Jack Stevens", dob: "02/08/1997", age: 28, nationality: "England", club: "Reading", league: "EFL League One", parentClub: "Reading", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Nik Tzanev", dob: "23/12/1996", age: 29, nationality: "New Zealand", club: "Huddersfield Town", league: "EFL League One", parentClub: "Huddersfield Town", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Tom Watson", dob: "27/08/2004", age: 21, nationality: "England", club: "Wigan Athletic", league: "EFL League One", parentClub: "Wigan Athletic", onLoan: false, tier: 2, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Max Woodford", dob: "05/05/2008", age: 18, nationality: "England", club: "Stevenage", league: "EFL League One", parentClub: "Stevenage", onLoan: false, tier: 2, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Ellis Craven", dob: "08/10/2004", age: 21, nationality: "England", club: "Salford City", league: "EFL League Two", parentClub: "Salford City", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Jake Eastwood", dob: "03/10/1996", age: 29, nationality: "England", club: "Cambridge United", league: "EFL League One", parentClub: "Cambridge United", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Mark Howard", dob: "21/09/1986", age: 39, nationality: "England", club: "Salford City", league: "EFL League Two", parentClub: "Salford City", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Sam Long", dob: "12/11/2002", age: 23, nationality: "Scotland", club: "Salford City", league: "EFL League Two", parentClub: "Salford City", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Craig MacGillivray", dob: "12/01/1993", age: 33, nationality: "Scotland", club: "MK Dons", league: "EFL League Two", parentClub: "MK Dons", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Thomas Smith", dob: "30/01/2002", age: 24, nationality: "England", club: "Colchester United", league: "EFL League Two", parentClub: "Colchester United", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Luke Southwood", dob: "06/12/1997", age: 28, nationality: "Northern Ireland", club: "Bristol Rovers", league: "EFL League One", parentClub: "Bristol Rovers", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Sebastian Stacey", dob: "19/05/2006", age: 20, nationality: "England", club: "MK Dons", league: "EFL League Two", parentClub: "MK Dons", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Connal Trueman", dob: "26/03/1996", age: 30, nationality: "England", club: "MK Dons", league: "EFL League Two", parentClub: "MK Dons", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Jake Turner", dob: "25/02/1999", age: 27, nationality: "England", club: "Gillingham", league: "EFL League Two", parentClub: "Gillingham", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Joe Wright", dob: "10/04/2001", age: 25, nationality: "England", club: "Billericay Town", league: "National League South", parentClub: "Billericay Town", onLoan: false, tier: 4, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Brad Young", dob: "05/05/2002", age: 24, nationality: "England", club: "Bristol Rovers", league: "EFL League One", parentClub: "Bristol Rovers", onLoan: false, tier: 2, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Noel Tornqvist", dob: "01/02/2002", age: 24, nationality: "Sweden", club: "Como 1907", league: "Serie A", parentClub: "Como 1907", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Jonathan Bond", dob: "19/05/1993", age: 33, nationality: "England", club: "Houston Dynamo", league: "MLS", parentClub: "Houston Dynamo", onLoan: false, tier: 1, academy: false, contract: "December 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/51bE7H2rV3WJ9ZsyrAq05.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Ash Maynard-Brewer", dob: "25/06/1999", age: 27, nationality: "Australia", club: "Dundee United", league: "SPFL Premiership", parentClub: "Dundee United", onLoan: false, tier: 2, academy: false, contract: "June 2026", profileImage: "https://cdn.sportfeeds.io/sdl/images/person/head/large/4s0yf91l8xqodeuv473hmp5ka.png?quality=60&auto=webp&format=pjpg", instagram: "", comments: "" },
  { name: "Maks Stryjek", dob: "18/07/1996", age: 30, nationality: "Poland", club: "Kilmarnock", league: "SPFL Premiership", parentClub: "Kilmarnock", onLoan: false, tier: 2, academy: false, contract: "May 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Leo Wahlstedt", dob: "04/07/1999", age: 27, nationality: "Sweden", club: "AGF", league: "Danish Superliga", parentClub: "AGF", onLoan: false, tier: 3, academy: false, contract: "June 2029", profileImage: "", instagram: "", comments: "" },
  { name: "Pontus Dahlberg", dob: "21/01/1999", age: 27, nationality: "Sweden", club: "IFK Göteborg", league: "Allsvenskan", parentClub: "IFK Göteborg", onLoan: false, tier: 3, academy: false, contract: "December 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Adli Mohamed", dob: "15/09/2004", age: 21, nationality: "United Arab Emirates", club: "Al Nasr SC", league: "UAE Pro League", parentClub: "Al Nasr SC", onLoan: false, tier: 3, academy: false, contract: "June 2030", profileImage: "", instagram: "", comments: "" },
  { name: "Dean Bouzanis", dob: "02/10/1990", age: 35, nationality: "Australia", club: "Brisbane Roar", league: "Australian A League", parentClub: "Brisbane Roar", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Gus Hoefsloot", dob: "14/03/2006", age: 20, nationality: "Australia", club: "Sydney FC", league: "Australian A League", parentClub: "Sydney FC", onLoan: false, tier: 3, academy: false, contract: "June 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Jack Warshawsky", dob: "08/08/2004", age: 21, nationality: "Australia", club: "Melbourne Victory", league: "Australian A League", parentClub: "Melbourne Victory", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Edward McGinty", dob: "05/08/1999", age: 26, nationality: "Republic of Ireland", club: "Shamrock Rovers", league: "League of Ireland", parentClub: "Shamrock Rovers", onLoan: false, tier: 2, academy: false, contract: "December 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Sam Sargeant", dob: "23/09/1997", age: 28, nationality: "England", club: "Sligo Rovers", league: "League of Ireland", parentClub: "Sligo Rovers", onLoan: false, tier: 2, academy: false, contract: "November 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Fynn Talley", dob: "14/09/2002", age: 23, nationality: "England", club: "Drogheda United", league: "League of Ireland", parentClub: "Drogheda United", onLoan: false, tier: 3, academy: false, contract: "December 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Conor Walsh", dob: "17/03/2005", age: 21, nationality: "Republic of Ireland", club: "Shelbourne", league: "League of Ireland", parentClub: "Shelbourne", onLoan: false, tier: 3, academy: false, contract: "December 2028", profileImage: "", instagram: "", comments: "" },
  { name: "Billy Crellin", dob: "30/06/2000", age: 26, nationality: "England", club: "Glentoran", league: "Irish Premiership", parentClub: "Glentoran", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Giosue Bellagambi", dob: "08/11/2001", age: 24, nationality: "Uganda", club: "Ebbsfleet United", league: "National League", parentClub: "Ebbsfleet United", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Nick Hayes", dob: "10/04/1999", age: 27, nationality: "England", club: "Aldershot Town", league: "National League", parentClub: "Aldershot Town", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Louis Jones", dob: "12/10/1998", age: 27, nationality: "England", club: "Scunthorpe United", league: "National League", parentClub: "Scunthorpe United", onLoan: false, tier: 3, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Rohan Luthra", dob: "06/05/2002", age: 24, nationality: "England", club: "Eastbourne Borough", league: "National League", parentClub: "Eastbourne Borough", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Harrison Male", dob: "13/09/2000", age: 25, nationality: "England", club: "York City", league: "National League", parentClub: "York City", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Luke McNicholas", dob: "01/01/2000", age: 26, nationality: "Republic of Ireland", club: "Forest Green Rovers", league: "National League", parentClub: "Forest Green Rovers", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "Thomas Myles", dob: "17/11/2005", age: 20, nationality: "England", club: "Rochdale", league: "National League", parentClub: "Rochdale", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Ryan Sandford", dob: "21/02/1999", age: 27, nationality: "England", club: "Dartford", league: "Isthmian League", parentClub: "Dartford", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Jasper Sheik", dob: "27/02/2005", age: 21, nationality: "England", club: "South Shields", league: "National League", parentClub: "South Shields", onLoan: false, tier: 3, academy: false, contract: "June 2027", profileImage: "", instagram: "", comments: "" },
  { name: "George Shelvey", dob: "22/04/2001", age: 25, nationality: "England", club: "Gateshead", league: "National League", parentClub: "Gateshead", onLoan: false, tier: 4, academy: false, contract: "June 2026", profileImage: "", instagram: "", comments: "" },
  { name: "Reece Byrne", dob: "20/11/2004", age: 21, nationality: "Republic of Ireland", club: "Free Agent", league: "Free Agent", parentClub: "Free Agent", onLoan: false, tier: 4, academy: false, contract: "—", profileImage: "", instagram: "", comments: "" },
];


const OVERSEAS_LEAGUES = new Set(["Serie A", "MLS", "Danish Superliga", "Allsvenskan", "UAE Pro League", "Australian A League", "Australian Nat Prem"]);

function deriveStatus(s: Seed): Status {
  if (s.league === "Free Agent") return "Free Agent";
  return `Tier ${s.tier}` as Status;
}
function deriveTags(s: Seed): GoalkeeperTag[] {
  const tags: GoalkeeperTag[] = [];
  if (s.academy) tags.push("Academy");
  if (s.league === "Free Agent") tags.push("Free Agent");
  return tags;
}
function deriveRegion(s: Seed): Region {
  if (s.league === "Free Agent") return "Free Agent";
  return OVERSEAS_LEAGUES.has(s.league) ? "Overseas" : "UK Based";
}
function deriveTierLevel(s: Seed): TierLevel {
  return s.tier;
}
function contractISO(c: string): string {
  if (c === "—") return "—";
  // "June 2028" / "December 2026" / "January 2026"
  const [mon, yr] = c.split(" ");
  const monthIdx: Record<string, string> = { January: "01", February: "02", March: "03", April: "04", May: "05", June: "06", July: "07", August: "08", September: "09", October: "10", November: "11", December: "12" };
  return `${yr}-${monthIdx[mon] ?? "06"}-30`;
}
function dobToISO(d: string): string {
  // dd/mm/yyyy
  const [dd, mm, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}
function inferNationality(s: Seed): string {
  if (s.club === "Como 1907") return "Sweden";
  if (s.club.includes("Göteborg")) return "Sweden";
  if (s.club === "Aarhus") return "Norway";
  if (s.club === "Al Nasr SC") return "UAE";
  if (s.club === "Brisbane Roar" || s.club === "Sydney FC" || s.club === "Oakleigh Cannons") return "Australia";
  if (s.club === "Houston Dynamo") return "England";
  if (s.league === "League of Ireland") return "Ireland";
  if (s.club === "Glentoran") return "Northern Ireland";
  if (s.league === "SPFL Premiership") return "Scotland";
  return "England";
}

// Custom rating bumps for hero profiles
const RATING_OVERRIDE: Record<string, { rating: number; potential: number; recommendation: Goalkeeper["recommendation"] }> = {
  "James Beadle": { rating: 84, potential: 93, recommendation: "Retain" },
  "Corey Addai": { rating: 79, potential: 88, recommendation: "Develop" },
};

export const goalkeepers: Goalkeeper[] = SEED.map((s, i) => {
  const status = deriveStatus(s);
  const tier = `Tier ${deriveTierLevel(s)}` as TierLevelLabel;
  const tags = deriveTags(s);
  const region = deriveRegion(s);
  const mentorId = tags.includes("Free Agent") ? "m-david-rouse" : ASSIGN_POOL[i % ASSIGN_POOL.length];
  const o = RATING_OVERRIDE[s.name];
  const baseRating = status === "Tier 1" ? between(78, 90) : status === "Tier 2" ? between(70, 84) : status === "Tier 3" ? between(64, 78) : status === "Academy" ? between(58, 72) : between(60, 75);
  const gk: Goalkeeper = {
    id: `gk-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: s.name,
    initials: initialsOf(s.name),
    status, tier, tags,
    tierLevel: deriveTierLevel(s),
    region,
    mentorId,
    club: s.club, league: s.league,
    age: s.age, dob: dobToISO(s.dob),
    nationality: s.nationality,
    contractUntil: contractISO(s.contract),
    // Keep blank unless the seed carries an authoritative master-sheet value.
    // Do not invent height / shirt / foot — leave null when unknown.
    height: s.height ?? null,
    shirtNumber: s.shirtNumber ?? null,
    foot: s.foot ?? null,
    lastInteraction: daysFromNow(-between(1, status === "Tier 1" ? 14 : 40)),
    nextInteraction: daysFromNow(between(-2, 28)),
    rating: o?.rating ?? baseRating,
    potential: o?.potential ?? Math.min(99, baseRating + between(4, 14)),
    recommendation: o?.recommendation ?? pick(["Sign", "Monitor", "Develop", "Retain", "Loan"] as const),
    // Reserved empty slot — populate per-player when a real reel exists.
    videoLinks: [],
    profileImage: s.profileImage || undefined,
    instagram: s.instagram || undefined,
    parentClub: s.parentClub || undefined,
    onLoan: s.onLoan,
  };
  return gk;
});

// Populate mentor.assignedGks
goalkeepers.forEach((gk) => {
  const m = mentors.find((x) => x.id === gk.mentorId);
  if (m) m.assignedGks.push(gk.id);
});

// ---------- Hero profile enrichment ----------
const beadle = goalkeepers.find((g) => g.name === "James Beadle")!;
beadle.bio = "Brighton & Hove Albion academy graduate, England U21 international. Loan spells have accelerated first-team readiness; RPM tracking pathway toward sustained Premier League minutes.";
beadle.developmentPlan = [
  "Increase distribution accuracy under high press (target 86%+).",
  "Quarterly tactical session on back-line organisation with Mark Halsey.",
  "Continue strength block (lower-limb power) through international break.",
  "Review opposition striker tendencies pre-match in dedicated video clinic.",
];

const corey = goalkeepers.find((g) => g.name === "Corey Addai");
if (corey) {
  corey.bio = "Experienced League Two number one. RPM development focus on shot-stopping consistency and progressing back into a Championship environment.";
  corey.developmentPlan = [
    "Sustain set-piece dominance — review weekly with Chris Day.",
    "Add ball-playing range to attract higher-tier recruitment interest.",
    "Maintain availability — load monitoring with club S&C.",
    "Build profile pack with recruitment analyst for January window.",
  ];
}


// ---------- Interactions ----------
const NOTES = [
  "Strong vertical reach, commanded the box well on crosses.",
  "Distribution under pressure remains an area to refine.",
  "Excellent positional awareness in 1v1 situations.",
  "Composure visible from minute one — vocal organiser.",
  "Footwork drills paying off; smoother lateral shifts.",
  "Late dive on the second goal — discussed timing on follow-through.",
  "Mentality conversation: handling pressure after the early concession.",
  "Reviewed clips together; agreed on three focus points for next block.",
];
const OUTCOMES = ["On track", "Above expectation", "Below expectation", "Needs follow-up", "Action plan agreed"];
const FOLLOWUPS = ["Schedule video review", "Send technical drill pack", "Set up call with coach", "Plan club visit", "No action required"];
const ITYPES: InteractionType[] = ["Live Match Observation", "Training Ground Visit", "Coffee Catch Up", "Phone Call"];

// Interactions are sourced from the live interactions store. No demo rows
// are seeded here — screens render empty states until real data arrives.
export const interactions: Interaction[] = [];

// ---------- Reports ----------
const REPORT_TYPES: ReportType[] = ["Goalkeeper Development", "Match Report", "Training Report", "Opposition GK", "Recruitment"];
void REPORT_TYPES;
// Reports come from the Match Reports store. No demo rows seeded here.
export const reports: Report[] = [];

// ---------- Media ----------
// Media items are sourced from the gk-media bucket / media_assets table.
export const media: MediaItem[] = [];

// ---------- Calendar ----------
// Calendar events sync from external sources. No demo rows seeded here.
export const calendarEvents: CalendarEvent[] = [];


// ---------- Alerts ----------
export interface Alert {
  id: string;
  severity: "high" | "medium" | "low";
  kind: "Overdue observation" | "Overdue contact" | "Missing report" | "Upcoming match" | "Expiring action";
  message: string;
  gkId?: string;
  date: string;
}
// Alerts are surfaced from live operational data. No mock alerts are seeded
// here — the Alerts page shows an empty state when nothing is outstanding.
export const alerts: Alert[] = [];

// ---------- Activity feed ----------
// Activity is driven by real events (report submissions, media uploads,
// role changes). No mock entries are seeded here.
export const activity: {
  id: string;
  actor: string;
  actorInitials: string;
  action: string;
  target: string;
  gkId: string;
  date: string;
}[] = [];



// ---------- helpers ----------
export const getMentor = (id: string) => mentors.find((m) => m.id === id);
export const getGk = (id: string) => goalkeepers.find((g) => g.id === id);

export function formatDate(iso: string) {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function formatRelative(iso: string) {
  if (!iso || iso === "—") return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (diff < 0) {
    const ahead = Math.abs(Math.floor(diff));
    return ahead === 0 ? "Today" : `in ${ahead}d`;
  }
  const d = Math.floor(diff);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ---------- Duty-of-care status ----------
// Determined by the goalkeeper's confirmed tier and qualifying live interactions:
//   Tier 1 → 2 live contacts / month     (~15 day cadence)
//   Tier 2 → 1 live contact  / month     (~30 day cadence)
//   Tier 3 → 3-6 per season              (~60 day cadence)
//   Tier 4 → no formal duty of care
// Qualifying live interactions: Live Match Observation, Training Ground Visit, Coffee Catch Up.
// Phone Calls do not count toward duty of care.
export type DutyLevel =
  | "up_to_date"
  | "due_soon"
  | "overdue"
  | "not_required"
  | "not_enough_data";

export const DUTY_LABELS: Record<DutyLevel, string> = {
  up_to_date: "Up to date",
  due_soon: "Due soon",
  overdue: "Overdue",
  not_required: "Not required",
  not_enough_data: "Not enough data",
};

export interface DutyStatus { level: DutyLevel; label: string; days: number; }

const DUTY_QUALIFYING_TYPES: InteractionType[] = [
  "Live Match Observation",
  "Training Ground Visit",
  "Coffee Catch Up",
];

const DUTY_TIER_INTERVAL_DAYS: Partial<Record<Status, number>> = {
  "Tier 1": 15,
  "Tier 2": 30,
  "Tier 3": 60,
};

function dutyResult(level: DutyLevel, days: number): DutyStatus {
  return { level, label: DUTY_LABELS[level], days };
}

/** Minimal shape duty-of-care needs from a logged interaction. */
export type DutySourceInteraction = { gkId: string; type: string; date: string };

function dutyTimestamp(date: string): number {
  // Date-only values ("YYYY-MM-DD") are parsed at local noon so that rendering
  // and day-difference maths can never shift the day across timezones.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  return new Date(iso).getTime();
}

export function dutyStatusForGk(
  gk: Goalkeeper,
  source: ReadonlyArray<DutySourceInteraction> = interactions,
): DutyStatus {
  if (gk.status === "Tier 4") return dutyResult("not_required", 0);
  const interval = DUTY_TIER_INTERVAL_DAYS[gk.status];
  if (!interval) return dutyResult("not_enough_data", 0);
  const qualifying = source
    .filter((i) => i.gkId === gk.id && DUTY_QUALIFYING_TYPES.includes(i.type as never))
    .map((i) => dutyTimestamp(i.date))
    .filter((t) => Number.isFinite(t));
  if (!qualifying.length) return dutyResult("not_enough_data", 0);
  const latest = Math.max(...qualifying);
  const days = Math.max(0, Math.floor((Date.now() - latest) / 86400000));
  if (days > interval) return dutyResult("overdue", days);
  if (days > Math.floor(interval * 0.75)) return dutyResult("due_soon", days);
  return dutyResult("up_to_date", days);
}

export function dutyStatusForMentor(
  mentorId: string,
  source: ReadonlyArray<DutySourceInteraction> = interactions,
): DutyStatus {
  const gks = goalkeepers.filter((g) => g.mentorId === mentorId);
  if (!gks.length) return dutyResult("not_enough_data", 0);
  const levels = gks.map((g) => dutyStatusForGk(g, source).level);
  if (levels.includes("overdue")) return dutyResult("overdue", 0);
  if (levels.includes("due_soon")) return dutyResult("due_soon", 0);
  if (levels.some((l) => l === "up_to_date")) return dutyResult("up_to_date", 0);
  if (levels.every((l) => l === "not_required")) return dutyResult("not_required", 0);
  return dutyResult("not_enough_data", 0);
}

export function computeDutyOverview(
  source: ReadonlyArray<DutySourceInteraction> = interactions,
) {
  const counts: Record<DutyLevel, number> = {
    up_to_date: 0, due_soon: 0, overdue: 0, not_required: 0, not_enough_data: 0,
  };
  goalkeepers.forEach((g) => { counts[dutyStatusForGk(g, source).level]++; });
  return { ...counts, total: goalkeepers.length };
}

export const dutyOverview = computeDutyOverview();

const ROSTER_TIERS: TierLevelLabel[] = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const ROSTER_STATUS_TAGS: GoalkeeperTag[] = ["Academy", "Free Agent"];

// Tiers and status tags are deliberately counted separately. Every goalkeeper
// belongs to one duty-of-care tier, while Academy and Free Agent describe the
// player's current situation and can coexist with any numbered tier.
export const rosterCategoryCounts = {
  tiers: ROSTER_TIERS.map((label) => ({
    label,
    count: goalkeepers.filter((goalkeeper) => goalkeeper.tier === label).length,
  })),
  statuses: ROSTER_STATUS_TAGS.map((label) => ({
    label,
    count: goalkeepers.filter((goalkeeper) => goalkeeper.tags.includes(label)).length,
  })),
};

export const stats = {
  totalGks: goalkeepers.length,
  // Interaction Tracking is the destination for this metric. Do not derive a
  // count from placeholder goalkeeper next-contact dates: those are not
  // logged interactions and made the dashboard promise records that were not
  // present on the destination screen.
  upcomingInteractions: interactions.filter((interaction) => {
    const time = new Date(interaction.date).getTime();
    const now = Date.now();
    return time >= now && time <= now + 14 * 86400000;
  }).length,
  overdueInteractions: alerts.filter((a) => a.kind === "Overdue observation" || a.kind === "Overdue contact").length,
  reportsThisWeek: reports.filter((r) => (Date.now() - new Date(r.date).getTime()) / 86400000 < 7).length,
  activeMentors: activeMentors.length,
  regionDistribution: (["UK Based", "Overseas", "Free Agent"] as Region[]).map((r) => ({ region: r, count: goalkeepers.filter((g) => g.region === r).length })),
};
