import type { DocumentTypeValue } from "@/lib/documents/document-types"

export type Discipline = "Structural" | "MEP" | "Architectural" | "Civil" | "Electrical" | "Mechanical"
export type Priority = "high" | "medium" | "low"
export type InspectionStatus = "pending" | "approved" | "rejected" | "in-progress"

export const currentUser = {
  name: "Omar Hassan",
  role: "projectManager" as const,
  initials: "OH",
  email: "omar.hassan@buildsight.com",
}

export const activeProject = {
  id: "PRJ-001",
  name: "Al Noor Residential Tower",
  location: "Dubai, UAE",
  image: "/projects/al-noor-tower.png",
  status: "underConstruction" as const,
  contractor: "Atlas Contracting",
  consultant: "BuildSight Consulting",
  targetHandover: "18 Dec 2026",
  progress: { planned: 72, actual: 68, delay: 4 },
}

export const projectsList = [
  activeProject,
  {
    id: "PRJ-002",
    name: "Marina Bay Offices",
    location: "Abu Dhabi, UAE",
    image: "/site/facade-installation.png",
    status: "underConstruction" as const,
    contractor: "Gulf Builders",
    consultant: "BuildSight Consulting",
    targetHandover: "30 Jun 2026",
    progress: { planned: 45, actual: 41, delay: 4 },
  },
  {
    id: "PRJ-003",
    name: "Green Valley Villas",
    location: "Sharjah, UAE",
    image: "/site/structural-works.png",
    status: "underConstruction" as const,
    contractor: "Emirates Construct",
    consultant: "BuildSight Consulting",
    targetHandover: "12 Mar 2027",
    progress: { planned: 22, actual: 24, delay: 0 },
  },
]

export const kpis = {
  openInspections: 12,
  pendingApprovals: 8,
  openNcrs: 5,
  safetyObservations: 3,
}

export const progressSeries = [
  { label: "Mar 17", planned: 22, actual: 18 },
  { label: "Mar 24", planned: 30, actual: 25 },
  { label: "Mar 31", planned: 38, actual: 33 },
  { label: "Apr 7", planned: 45, actual: 40 },
  { label: "Apr 14", planned: 52, actual: 46 },
  { label: "Apr 21", planned: 58, actual: 52 },
  { label: "Apr 28", planned: 63, actual: 57 },
  { label: "May 5", planned: 68, actual: 62 },
  { label: "May 12", planned: 72, actual: 68 },
]

export type PendingInspection = {
  id: string
  title: string
  discipline: Discipline
  dueDate: string
  overdue?: boolean
  priority: Priority
  status: InspectionStatus
}

export const pendingInspections: PendingInspection[] = [
  {
    id: "INSP-2025-046",
    title: "Rebar Inspection - Level 12",
    discipline: "Structural",
    dueDate: "16 May 2025",
    overdue: true,
    priority: "high",
    status: "pending",
  },
  {
    id: "INSP-2025-047",
    title: "MEP Rough-in - Level 10",
    discipline: "MEP",
    dueDate: "17 May 2025",
    overdue: true,
    priority: "high",
    status: "pending",
  },
  {
    id: "INSP-2025-048",
    title: "Blockwork - Level 8",
    discipline: "Architectural",
    dueDate: "19 May 2025",
    priority: "medium",
    status: "pending",
  },
  {
    id: "INSP-2025-049",
    title: "Waterproofing - Podium",
    discipline: "Civil",
    dueDate: "20 May 2025",
    priority: "medium",
    status: "pending",
  },
]

export const ncrStatus = {
  total: 27,
  open: 5,
  inReview: 3,
  closed: 19,
}

export type Activity = {
  id: string
  person: string
  initials: string
  action: string
  reference: string
  detail: string
  time: string
  tone: "info" | "danger" | "success" | "neutral"
}

export const recentActivity: Activity[] = [
  {
    id: "a1",
    person: "Ahmed Khalid",
    initials: "AK",
    action: "completed inspection",
    reference: "INSP-2025-045",
    detail: "Level 11 Slab Concreting",
    time: "1 hour ago",
    tone: "success",
  },
  {
    id: "a2",
    person: "Fatima Ali",
    initials: "FA",
    action: "raised NCR",
    reference: "NCR-2025-027",
    detail: "Honeycombing at Column C12",
    time: "3 hours ago",
    tone: "danger",
  },
  {
    id: "a3",
    person: "Mohammed Yusuf",
    initials: "MY",
    action: "submitted site report",
    reference: "SR-2025-087",
    detail: "Daily progress report",
    time: "5 hours ago",
    tone: "info",
  },
  {
    id: "a4",
    person: "Sara Al Mulla",
    initials: "SM",
    action: "approved material submittal",
    reference: "MS-2025-062",
    detail: "Structural steel grade 60",
    time: "1 day ago",
    tone: "success",
  },
]

export type SitePhoto = {
  id: string
  title: string
  image: string
  timestamp: string
}

export const sitePhotos: SitePhoto[] = [
  {
    id: "p1",
    title: "Level 12 - Structural Works",
    image: "/site/structural-works.png",
    timestamp: "15 May 2025, 09:15 AM",
  },
  {
    id: "p2",
    title: "Facade Installation",
    image: "/site/facade-installation.png",
    timestamp: "15 May 2025, 08:45 AM",
  },
  {
    id: "p3",
    title: "MEP Works - Level 10",
    image: "/site/mep-works.png",
    timestamp: "15 May 2025, 08:20 AM",
  },
]

export const notificationsCount = 6

export type ProjectStatusKey = "underConstruction" | "planning" | "onHold" | "completed" | "handover"

export type ProjectRecord = {
  id: string
  name: string
  code: string
  location: string
  image: string
  statusKey: ProjectStatusKey
  projectType: string
  supervisionType: string
  plotNo: string
  supervisionStartDate: string
  priority: string
  includedStructureVisits: string
  includedFinishingVisits: string
  organizationRole: string
  description: string
  contractor: string
  consultant: string
  client: string
  startDate: string
  targetHandover: string
  contractValue: string
  progress: { planned: number; actual: number; delay: number }
  openNcrs: number
  openInspections: number
}

export const projects: ProjectRecord[] = [
  {
    id: "PRJ-001",
    name: "Al Noor Residential Tower",
    code: "—",
    location: "Dubai, UAE",
    image: "/projects/al-noor-tower.png",
    statusKey: "underConstruction",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Atlas Contracting",
    consultant: "BuildSight Consulting",
    client: "Al Noor Developments",
    startDate: "10 Jan 2024",
    targetHandover: "18 Dec 2026",
    contractValue: "AED 420M",
    progress: { planned: 72, actual: 68, delay: 4 },
    openNcrs: 5,
    openInspections: 12,
  },
  {
    id: "PRJ-002",
    name: "Marina Bay Offices",
    code: "—",
    location: "Abu Dhabi, UAE",
    image: "/site/facade-installation.png",
    statusKey: "underConstruction",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Gulf Builders",
    consultant: "BuildSight Consulting",
    client: "Marina Holdings",
    startDate: "05 Mar 2024",
    targetHandover: "30 Jun 2026",
    contractValue: "AED 280M",
    progress: { planned: 45, actual: 41, delay: 4 },
    openNcrs: 3,
    openInspections: 7,
  },
  {
    id: "PRJ-003",
    name: "Green Valley Villas",
    code: "—",
    location: "Sharjah, UAE",
    image: "/site/structural-works.png",
    statusKey: "underConstruction",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Emirates Construct",
    consultant: "BuildSight Consulting",
    client: "Green Valley LLC",
    startDate: "20 Aug 2024",
    targetHandover: "12 Mar 2027",
    contractValue: "AED 155M",
    progress: { planned: 22, actual: 24, delay: 0 },
    openNcrs: 1,
    openInspections: 4,
  },
  {
    id: "PRJ-004",
    name: "Corniche Retail Plaza",
    code: "—",
    location: "Dubai, UAE",
    image: "/site/mep-works.png",
    statusKey: "planning",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Skyline Contracting",
    consultant: "BuildSight Consulting",
    client: "Corniche Retail Group",
    startDate: "01 Sep 2025",
    targetHandover: "15 Nov 2027",
    contractValue: "AED 95M",
    progress: { planned: 8, actual: 6, delay: 2 },
    openNcrs: 0,
    openInspections: 2,
  },
  {
    id: "PRJ-005",
    name: "Palm Heights Hotel",
    code: "—",
    location: "Ras Al Khaimah, UAE",
    image: "/projects/al-noor-tower.png",
    statusKey: "onHold",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Coastal Developers",
    consultant: "BuildSight Consulting",
    client: "Palm Hospitality",
    startDate: "12 Feb 2024",
    targetHandover: "28 Feb 2026",
    contractValue: "AED 340M",
    progress: { planned: 58, actual: 49, delay: 9 },
    openNcrs: 8,
    openInspections: 6,
  },
  {
    id: "PRJ-006",
    name: "Downtown Metro Station",
    code: "—",
    location: "Dubai, UAE",
    image: "/site/structural-works.png",
    statusKey: "completed",
    projectType: "—",
    supervisionType: "Not specified",
    plotNo: "Not set",
    supervisionStartDate: "Not set",
    priority: "Medium",
    includedStructureVisits: "Not set",
    includedFinishingVisits: "Not set",
    organizationRole: "Consultant",
    description: "No project description has been added.",
    contractor: "Atlas Contracting",
    consultant: "BuildSight Consulting",
    client: "Roads & Transport Authority",
    startDate: "18 Jun 2021",
    targetHandover: "30 Apr 2024",
    contractValue: "AED 510M",
    progress: { planned: 100, actual: 100, delay: 0 },
    openNcrs: 0,
    openInspections: 0,
  },
]

export type ChecklistItem = {
  id: string
  label: string
  result: "pass" | "fail" | "na" | null
}

export type InspectionRecord = {
  id: string
  title: string
  discipline: Discipline
  project: string
  location: string
  requestedBy: string
  assignedTo: string
  assignedInitials: string
  scheduled: string
  dueDate: string
  overdue?: boolean
  priority: Priority
  status: InspectionStatus
  linkedNcr?: string
  checklist: ChecklistItem[]
}

export const inspections: InspectionRecord[] = [
  {
    id: "INSP-2025-046",
    title: "Rebar Inspection - Level 12",
    discipline: "Structural",
    project: "Al Noor Residential Tower",
    location: "Level 12 - Slab",
    requestedBy: "Atlas Contracting",
    assignedTo: "Ahmed Khalid",
    assignedInitials: "AK",
    scheduled: "16 May 2025, 10:00 AM",
    dueDate: "16 May 2025",
    overdue: true,
    priority: "high",
    status: "pending",
    checklist: [
      { id: "c1", label: "Bar diameter matches approved drawings", result: null },
      { id: "c2", label: "Spacing and lap length verified", result: null },
      { id: "c3", label: "Concrete cover blocks in place", result: null },
      { id: "c4", label: "Formwork alignment and cleanliness", result: null },
    ],
  },
  {
    id: "INSP-2025-047",
    title: "MEP Rough-in - Level 10",
    discipline: "MEP",
    project: "Al Noor Residential Tower",
    location: "Level 10 - Ceiling",
    requestedBy: "Atlas Contracting",
    assignedTo: "Mohammed Yusuf",
    assignedInitials: "MY",
    scheduled: "17 May 2025, 09:00 AM",
    dueDate: "17 May 2025",
    overdue: true,
    priority: "high",
    status: "in-progress",
    checklist: [
      { id: "c1", label: "Duct routing per coordinated drawings", result: "pass" },
      { id: "c2", label: "Conduit supports and spacing", result: "pass" },
      { id: "c3", label: "Pipe pressure test certificate", result: null },
      { id: "c4", label: "Fire stopping at penetrations", result: null },
    ],
  },
  {
    id: "INSP-2025-048",
    title: "Blockwork - Level 8",
    discipline: "Architectural",
    project: "Al Noor Residential Tower",
    location: "Level 8 - Partitions",
    requestedBy: "Atlas Contracting",
    assignedTo: "Fatima Ali",
    assignedInitials: "FA",
    scheduled: "19 May 2025, 11:30 AM",
    dueDate: "19 May 2025",
    priority: "medium",
    status: "pending",
    checklist: [
      { id: "c1", label: "Block type and mortar mix approved", result: null },
      { id: "c2", label: "Verticality and line level", result: null },
      { id: "c3", label: "Wall ties and expansion joints", result: null },
    ],
  },
  {
    id: "INSP-2025-049",
    title: "Waterproofing - Podium",
    discipline: "Civil",
    project: "Al Noor Residential Tower",
    location: "Podium Deck",
    requestedBy: "Atlas Contracting",
    assignedTo: "Sara Al Mulla",
    assignedInitials: "SM",
    scheduled: "20 May 2025, 08:00 AM",
    dueDate: "20 May 2025",
    priority: "medium",
    status: "pending",
    checklist: [
      { id: "c1", label: "Surface preparation and priming", result: null },
      { id: "c2", label: "Membrane overlap and continuity", result: null },
      { id: "c3", label: "Flood test duration recorded", result: null },
    ],
  },
  {
    id: "INSP-2025-045",
    title: "Slab Concreting - Level 11",
    discipline: "Structural",
    project: "Al Noor Residential Tower",
    location: "Level 11 - Slab",
    requestedBy: "Atlas Contracting",
    assignedTo: "Ahmed Khalid",
    assignedInitials: "AK",
    scheduled: "14 May 2025, 07:00 AM",
    dueDate: "14 May 2025",
    priority: "high",
    status: "approved",
    checklist: [
      { id: "c1", label: "Slump test within tolerance", result: "pass" },
      { id: "c2", label: "Cube samples taken", result: "pass" },
      { id: "c3", label: "Pour sequence followed", result: "pass" },
      { id: "c4", label: "Curing plan in place", result: "pass" },
    ],
  },
  {
    id: "INSP-2025-044",
    title: "Column Formwork - Level 11",
    discipline: "Structural",
    project: "Al Noor Residential Tower",
    location: "Level 11 - Column C12",
    requestedBy: "Atlas Contracting",
    assignedTo: "Fatima Ali",
    assignedInitials: "FA",
    scheduled: "12 May 2025, 02:00 PM",
    dueDate: "12 May 2025",
    priority: "medium",
    status: "rejected",
    linkedNcr: "NCR-2025-027",
    checklist: [
      { id: "c1", label: "Formwork dimensions verified", result: "pass" },
      { id: "c2", label: "No honeycombing on previous pour", result: "fail" },
      { id: "c3", label: "Props and bracing adequate", result: "pass" },
    ],
  },
  {
    id: "INSP-2025-043",
    title: "Electrical Containment - Level 9",
    discipline: "Electrical",
    project: "Al Noor Residential Tower",
    location: "Level 9 - Riser",
    requestedBy: "Atlas Contracting",
    assignedTo: "Mohammed Yusuf",
    assignedInitials: "MY",
    scheduled: "11 May 2025, 10:00 AM",
    dueDate: "11 May 2025",
    priority: "low",
    status: "approved",
    checklist: [
      { id: "c1", label: "Cable tray earthing continuity", result: "pass" },
      { id: "c2", label: "Support spacing per spec", result: "pass" },
    ],
  },
]

export type NcrSeverity = "critical" | "major" | "minor"
export type NcrStatus = "open" | "in-review" | "closed"

export type NcrTimelineEntry = {
  label: string
  date: string
  by: string
}

export type NcrRecord = {
  id: string
  title: string
  discipline: Discipline
  project: string
  location: string
  severity: NcrSeverity
  status: NcrStatus
  raisedBy: string
  raisedOn: string
  assignedTo: string
  assignedInitials: string
  dueDate: string
  description: string
  rootCause: string
  correctiveAction: string
  linkedInspection?: string
  timeline: NcrTimelineEntry[]
}

export const ncrs: NcrRecord[] = [
  {
    id: "NCR-2025-027",
    title: "Honeycombing at Column C12",
    discipline: "Structural",
    project: "Al Noor Residential Tower",
    location: "Level 11 - Column C12",
    severity: "major",
    status: "open",
    raisedBy: "Fatima Ali",
    raisedOn: "12 May 2025",
    assignedTo: "Atlas Contracting",
    assignedInitials: "AC",
    dueDate: "22 May 2025",
    description:
      "Significant honeycombing observed on the west face of Column C12 after formwork removal, exposing aggregate and reducing effective cover.",
    rootCause: "Inadequate vibration during concrete placement and congested reinforcement.",
    correctiveAction:
      "Chip out affected concrete to sound substrate, apply approved repair mortar, and re-inspect before proceeding.",
    linkedInspection: "INSP-2025-044",
    timeline: [
      { label: "NCR raised", date: "12 May 2025", by: "Fatima Ali" },
      { label: "Assigned to contractor", date: "12 May 2025", by: "Omar Hassan" },
    ],
  },
  {
    id: "NCR-2025-026",
    title: "Incorrect rebar spacing - Slab L10",
    discipline: "Structural",
    project: "Al Noor Residential Tower",
    location: "Level 10 - Slab",
    severity: "critical",
    status: "in-review",
    raisedBy: "Ahmed Khalid",
    raisedOn: "08 May 2025",
    assignedTo: "Atlas Contracting",
    assignedInitials: "AC",
    dueDate: "18 May 2025",
    description:
      "Bottom reinforcement spacing exceeds approved drawing tolerance by 40mm across multiple bays.",
    rootCause: "Setting-out error by steel-fixing subcontractor.",
    correctiveAction: "Add supplementary bars to achieve design spacing; structural engineer to verify.",
    timeline: [
      { label: "NCR raised", date: "08 May 2025", by: "Ahmed Khalid" },
      { label: "Corrective action submitted", date: "13 May 2025", by: "Atlas Contracting" },
      { label: "Under consultant review", date: "14 May 2025", by: "Omar Hassan" },
    ],
  },
  {
    id: "NCR-2025-025",
    title: "Water ingress at basement wall",
    discipline: "Civil",
    project: "Al Noor Residential Tower",
    location: "Basement 2 - Wall B",
    severity: "major",
    status: "open",
    raisedBy: "Sara Al Mulla",
    raisedOn: "06 May 2025",
    assignedTo: "Atlas Contracting",
    assignedInitials: "AC",
    dueDate: "20 May 2025",
    description: "Active water ingress observed at construction joint of basement retaining wall.",
    rootCause: "Failed waterstop at construction joint.",
    correctiveAction: "Inject polyurethane resin and apply crystalline waterproofing coating.",
    timeline: [{ label: "NCR raised", date: "06 May 2025", by: "Sara Al Mulla" }],
  },
  {
    id: "NCR-2025-024",
    title: "Fire-stopping missing at riser",
    discipline: "MEP",
    project: "Al Noor Residential Tower",
    location: "Level 9 - Riser",
    severity: "minor",
    status: "closed",
    raisedBy: "Mohammed Yusuf",
    raisedOn: "28 Apr 2025",
    assignedTo: "Atlas Contracting",
    assignedInitials: "AC",
    dueDate: "05 May 2025",
    description: "Fire-stopping not installed at cable penetrations through rated riser wall.",
    rootCause: "Sequencing gap between MEP and fit-out trades.",
    correctiveAction: "Install approved fire-stopping system and provide compliance certificate.",
    timeline: [
      { label: "NCR raised", date: "28 Apr 2025", by: "Mohammed Yusuf" },
      { label: "Corrective action submitted", date: "02 May 2025", by: "Atlas Contracting" },
      { label: "Verified & closed", date: "05 May 2025", by: "Omar Hassan" },
    ],
  },
  {
    id: "NCR-2025-023",
    title: "Blockwork alignment deviation",
    discipline: "Architectural",
    project: "Al Noor Residential Tower",
    location: "Level 8 - Partition",
    severity: "minor",
    status: "closed",
    raisedBy: "Fatima Ali",
    raisedOn: "22 Apr 2025",
    assignedTo: "Atlas Contracting",
    assignedInitials: "AC",
    dueDate: "29 Apr 2025",
    description: "Partition wall out of plumb by 12mm over 3m height.",
    rootCause: "Poor workmanship during block laying.",
    correctiveAction: "Demolish and rebuild affected section to tolerance.",
    timeline: [
      { label: "NCR raised", date: "22 Apr 2025", by: "Fatima Ali" },
      { label: "Verified & closed", date: "29 Apr 2025", by: "Omar Hassan" },
    ],
  },
]

export const ncrSummary = { total: 27, open: 5, inReview: 3, closed: 19 }

export type ReportType = "daily" | "weekly" | "safety"

export type ReportRecord = {
  id: string
  type: ReportType
  title: string
  date: string
  author: string
  authorInitials: string
  weather: string
  manpower: number
  progress: number
  activities: string[]
}

export const reports: ReportRecord[] = [
  {
    id: "SR-2025-087",
    type: "daily",
    title: "Daily Site Report - 15 May",
    date: "15 May 2025",
    author: "Mohammed Yusuf",
    authorInitials: "MY",
    weather: "Sunny, 38°C",
    manpower: 142,
    progress: 68,
    activities: [
      "Level 12 slab reinforcement fixing",
      "Facade panel installation L7-L8",
      "MEP first fix on Level 10",
    ],
  },
  {
    id: "SR-2025-086",
    type: "daily",
    title: "Daily Site Report - 14 May",
    date: "14 May 2025",
    author: "Ahmed Khalid",
    authorInitials: "AK",
    weather: "Clear, 36°C",
    manpower: 138,
    progress: 67,
    activities: ["Level 11 slab concreting", "Blockwork Level 8", "Waterproofing podium deck"],
  },
  {
    id: "WR-2025-019",
    type: "weekly",
    title: "Weekly Progress Report - Week 19",
    date: "12 May 2025",
    author: "Omar Hassan",
    authorInitials: "OH",
    weather: "—",
    manpower: 140,
    progress: 68,
    activities: ["Structural works 2 levels advanced", "Facade 15% complete", "3 NCRs closed"],
  },
  {
    id: "SFR-2025-011",
    type: "safety",
    title: "Weekly Safety Report - Week 19",
    date: "12 May 2025",
    author: "Sara Al Mulla",
    authorInitials: "SM",
    weather: "—",
    manpower: 140,
    progress: 0,
    activities: ["3 safety observations logged", "Toolbox talk on working at height", "Zero LTI this week"],
  },
  {
    id: "SR-2025-085",
    type: "daily",
    title: "Daily Site Report - 13 May",
    date: "13 May 2025",
    author: "Mohammed Yusuf",
    authorInitials: "MY",
    weather: "Hazy, 35°C",
    manpower: 135,
    progress: 66,
    activities: ["Column formwork Level 11", "Electrical containment Level 9"],
  },
]

export const reportsSummary = { totalReports: 12, avgManpower: 139, openIssues: 5 }

export type DocumentType = DocumentTypeValue
export type DocumentStatus = "approved" | "pending" | "rejected" | "revise"

export type DocumentRecord = {
  id: string
  name: string
  type: DocumentType
  revision: string
  status: DocumentStatus
  uploadedBy: string
  date: string
  size: string
}

export const documents: DocumentRecord[] = [
  {
    id: "DR-A-1201",
    name: "Level 12 Structural Layout",
    type: "drawing",
    revision: "C",
    status: "approved",
    uploadedBy: "Ahmed Khalid",
    date: "14 May 2025",
    size: "4.2 MB",
  },
  {
    id: "MS-2025-062",
    name: "Concrete Mix Design - C40",
    type: "material_submittal",
    revision: "B",
    status: "approved",
    uploadedBy: "Atlas Contracting",
    date: "13 May 2025",
    size: "1.1 MB",
  },
  {
    id: "RFI-2025-041",
    name: "Curtain Wall Fixing Detail Clarification",
    type: "request_for_information",
    revision: "A",
    status: "pending",
    uploadedBy: "Atlas Contracting",
    date: "13 May 2025",
    size: "820 KB",
  },
  {
    id: "MS-2025-061",
    name: "Waterproofing Membrane Datasheet",
    type: "material_submittal",
    revision: "A",
    status: "revise",
    uploadedBy: "Atlas Contracting",
    date: "11 May 2025",
    size: "2.4 MB",
  },
  {
    id: "DR-M-0910",
    name: "Level 9 MEP Coordination",
    type: "drawing",
    revision: "D",
    status: "approved",
    uploadedBy: "Mohammed Yusuf",
    date: "10 May 2025",
    size: "6.8 MB",
  },
  {
    id: "RFI-2025-040",
    name: "Basement Waterstop Specification Query",
    type: "request_for_information",
    revision: "A",
    status: "rejected",
    uploadedBy: "Atlas Contracting",
    date: "08 May 2025",
    size: "540 KB",
  },
  {
    id: "SR-2025-087",
    name: "Daily Site Report - 15 May",
    type: "daily_report",
    revision: "—",
    status: "approved",
    uploadedBy: "Mohammed Yusuf",
    date: "15 May 2025",
    size: "3.1 MB",
  },
  {
    id: "CN-2024-001",
    name: "Main Contract Agreement",
    type: "other",
    revision: "—",
    status: "approved",
    uploadedBy: "Omar Hassan",
    date: "10 Jan 2024",
    size: "12.5 MB",
  },
]

export type RoleKey =
  | "admin"
  | "projectManager"
  | "residentEngineer"
  | "inspector"
  | "documentController"
  | "contractor"
  | "owner"

export type PresenceStatus = "online" | "offline" | "away"

export type TeamMember = {
  id: string
  name: string
  initials: string
  email: string
  role: RoleKey
  company: string
  presence: PresenceStatus
  lastActive: string
}

export const teamMembers: TeamMember[] = [
  {
    id: "U-001",
    name: "Omar Hassan",
    initials: "OH",
    email: "omar.hassan@buildsight.ae",
    role: "projectManager",
    company: "BuildSight Consulting",
    presence: "online",
    lastActive: "Now",
  },
  {
    id: "U-002",
    name: "Ahmed Khalid",
    initials: "AK",
    email: "ahmed.khalid@buildsight.ae",
    role: "residentEngineer",
    company: "BuildSight Consulting",
    presence: "online",
    lastActive: "5 min ago",
  },
  {
    id: "U-003",
    name: "Fatima Ali",
    initials: "FA",
    email: "fatima.ali@buildsight.ae",
    role: "inspector",
    company: "BuildSight Consulting",
    presence: "away",
    lastActive: "1 hour ago",
  },
  {
    id: "U-004",
    name: "Mohammed Yusuf",
    initials: "MY",
    email: "mohammed.yusuf@buildsight.ae",
    role: "inspector",
    company: "BuildSight Consulting",
    presence: "online",
    lastActive: "12 min ago",
  },
  {
    id: "U-005",
    name: "Sara Al Mulla",
    initials: "SM",
    email: "sara.almulla@buildsight.ae",
    role: "documentController",
    company: "BuildSight Consulting",
    presence: "offline",
    lastActive: "Yesterday",
  },
  {
    id: "U-006",
    name: "Khalid Rahman",
    initials: "KR",
    email: "khalid.rahman@atlas.ae",
    role: "contractor",
    company: "Atlas Contracting",
    presence: "online",
    lastActive: "20 min ago",
  },
  {
    id: "U-007",
    name: "Layla Ibrahim",
    initials: "LI",
    email: "layla.ibrahim@alnoor.ae",
    role: "owner",
    company: "Al Noor Developments",
    presence: "offline",
    lastActive: "2 days ago",
  },
  {
    id: "U-008",
    name: "Yousef Mansour",
    initials: "YM",
    email: "yousef.mansour@buildsight.ae",
    role: "admin",
    company: "BuildSight Consulting",
    presence: "away",
    lastActive: "3 hours ago",
  },
]

export type PermissionLevel = "view" | "edit" | "approve" | "manage" | "none"

export type RolePermissionRow = {
  role: RoleKey
  inspections: PermissionLevel
  ncrs: PermissionLevel
  reports: PermissionLevel
  documents: PermissionLevel
}

export const rolePermissions: RolePermissionRow[] = [
  { role: "admin", inspections: "manage", ncrs: "manage", reports: "manage", documents: "manage" },
  { role: "projectManager", inspections: "approve", ncrs: "approve", reports: "approve", documents: "approve" },
  { role: "residentEngineer", inspections: "approve", ncrs: "approve", reports: "edit", documents: "view" },
  { role: "inspector", inspections: "edit", ncrs: "edit", reports: "edit", documents: "view" },
  { role: "documentController", inspections: "view", ncrs: "view", reports: "view", documents: "manage" },
  { role: "contractor", inspections: "edit", ncrs: "edit", reports: "view", documents: "edit" },
  { role: "owner", inspections: "view", ncrs: "view", reports: "view", documents: "view" },
]

export type MilestoneKey =
  | "milestoneStructure"
  | "milestoneFacade"
  | "milestoneMep"
  | "milestoneFitout"
  | "milestoneHandover"

export type Milestone = {
  key: MilestoneKey
  progress: number
}

export const milestones: Milestone[] = [
  { key: "milestoneStructure", progress: 88 },
  { key: "milestoneFacade", progress: 42 },
  { key: "milestoneMep", progress: 55 },
  { key: "milestoneFitout", progress: 18 },
  { key: "milestoneHandover", progress: 0 },
]

export type RiskLevel = "onTrack" | "atRisk" | "delayed"
export const projectRisk: RiskLevel = "atRisk"
