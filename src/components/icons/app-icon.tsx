import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  BellRing,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Circle,
  CircleCheckBig,
  CircleDot,
  CircleX,
  ClipboardCheck,
  ContactRound,
  Copy,
  Download,
  FileText,
  Files,
  History,
  Handshake,
  LayoutDashboard,
  LockKeyhole,
  ListChecks,
  ListPlus,
  ListTodo,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCw,
  Search,
  Scale,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  UsersRound,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

export type AppIconName =
  | "actions"
  | "agenda"
  | "arrowLeft"
  | "arrowRight"
  | "annualWheel"
  | "attachments"
  | "ai"
  | "calendar"
  | "chevronDown"
  | "close"
  | "committees"
  | "decisions"
  | "duplicate"
  | "documents"
  | "download"
  | "jobCards"
  | "members"
  | "menu"
  | "meetingAdd"
  | "more"
  | "notes"
  | "myTasks"
  | "overview"
  | "organization"
  | "pending"
  | "preparation"
  | "privateNotes"
  | "progress"
  | "search"
  | "edit"
  | "filter"
  | "history"
  | "settings"
  | "stakeholders"
  | "tasks"
  | "taskAdd"
  | "taskCompleted"
  | "taskCancelled"
  | "trash"
  | "upload";

const appIcons: Record<AppIconName, LucideIcon> = {
  actions: BellRing,
  agenda: ListTodo,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  ai: Sparkles,
  annualWheel: RotateCw,
  attachments: Paperclip,
  calendar: CalendarDays,
  chevronDown: ChevronDown,
  close: X,
  committees: UsersRound,
  decisions: Scale,
  duplicate: Copy,
  documents: Files,
  download: Download,
  jobCards: BriefcaseBusiness,
  members: ContactRound,
  menu: Menu,
  meetingAdd: CalendarPlus,
  more: MoreHorizontal,
  notes: FileText,
  myTasks: UserCheck,
  overview: LayoutDashboard,
  organization: Building2,
  pending: Circle,
  preparation: ClipboardCheck,
  privateNotes: LockKeyhole,
  progress: CircleDot,
  search: Search,
  edit: Pencil,
  filter: SlidersHorizontal,
  history: History,
  settings: Settings,
  stakeholders: Handshake,
  tasks: ListChecks,
  taskAdd: ListPlus,
  taskCompleted: CircleCheckBig,
  taskCancelled: CircleX,
  trash: Trash2,
  upload: Upload,
};

export const organizationNavIconNames: Record<string, AppIconName> = {
  "": "overview",
  "/actions": "actions",
  "/annual-wheel": "annualWheel",
  "/committees": "committees",
  "/decisions": "decisions",
  "/documents": "documents",
  "/job-cards": "jobCards",
  "/meetings": "calendar",
  "/members": "members",
  "/stakeholders": "stakeholders",
  "/tasks": "tasks",
  "/tasks/my": "myTasks",
  "/trash": "trash",
};

export function AppIcon({
  className,
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  className?: string;
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = appIcons[name] ?? CircleCheckBig;

  return (
    <Icon
      aria-hidden="true"
      className={className}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
