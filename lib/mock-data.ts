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

export const notificationsCount = 3

export type ProjectStatusKey = "underConstruction" | "planning" | "onHold" | "completed" | "handover"

export type ProjectRecord = {
  id: string
  name: string
  location: string
  image: string
  statusKey: ProjectStatusKey
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
    location: "Dubai, UAE",
    image: "/projects/al-noor-tower.png",
    statusKey: "underConstruction",
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
    location: "Abu Dhabi, UAE",
    image: "/site/facade-installation.png",
    statusKey: "underConstruction",
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
    location: "Sharjah, UAE",
    image: "/site/structural-works.png",
    statusKey: "underConstruction",
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
    location: "Dubai, UAE",
    image: "/site/mep-works.png",
    statusKey: "planning",
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
    location: "Ras Al Khaimah, UAE",
    image: "/projects/al-noor-tower.png",
    statusKey: "onHold",
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
    location: "Dubai, UAE",
    image: "/site/structural-works.png",
    statusKey: "completed",
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
