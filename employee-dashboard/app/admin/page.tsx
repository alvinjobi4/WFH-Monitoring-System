"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, Line, ReferenceLine, ReferenceArea,
} from "recharts";
import {
  Users, Activity, TrendingUp, Clock, ChevronDown,
  BarChart2, PieChart as PieIcon, Target, Zap, AlertTriangle, Layers,
  Flame, Award, Sparkles, ShieldAlert, Terminal, Timer,
  RefreshCw, Sliders, CalendarDays, ChevronRight, Eye, Brain, Globe
} from "lucide-react";
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES, getNormalizedRoleName, DomainRuleInfo } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";
import { fetchGroqClassificationsBatch, getGroqCacheKey, GroqClassificationResult } from "../../lib/groqClassifier";
import ReactMarkdown from "react-markdown";

// =================================================
// CONSTANTS & HELPERS
// =================================================
const CATEGORY_COLORS: Record<string, string> = PRODUCTIVITY_COLORS;

const HOURS_LIST = [
  "12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
  "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"
];

const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const formatTime = (isoString?: string): string => {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    const datePart = date.toLocaleDateString([], { month: "short", day: "numeric" });
    const timePart = date.toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch { return "-"; }
};

const formatTimeCompact = (isoString?: string): string => {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + 
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
};

const getRoleNameForDepartment = (dept: string, roles: any[]) => {
  if (!dept) return "knowledge_worker";
  const cleanDept = dept.toLowerCase().replace(/_/g, " ").trim();

  // Find direct match
  const matched = roles.find(r => {
    const cleanRole = r.name.toLowerCase().replace(/_/g, " ").trim();
    return cleanRole === cleanDept || cleanRole.includes(cleanDept) || cleanDept.includes(cleanRole);
  });

  if (matched) {
    return matched.name;
  }

  // Standard mappings/fallbacks
  if (cleanDept.includes("software") || cleanDept.includes("developer") || cleanDept.includes("engineering") || cleanDept.includes("dev")) {
    return roles.find(r => r.name.toLowerCase().includes("software") || r.name.toLowerCase().includes("developer") || r.name.toLowerCase().includes("engineer"))?.name || "software_engineer";
  }
  if (cleanDept.includes("design") || cleanDept.includes("designer") || cleanDept.includes("frontend")) {
    return roles.find(r => r.name.toLowerCase().includes("design") || r.name.toLowerCase().includes("designer"))?.name || "designer";
  }
  if (cleanDept.includes("recruit") || cleanDept.includes("hr") || cleanDept.includes("talent")) {
    return roles.find(r => r.name.toLowerCase().includes("recruit"))?.name || "recruiter";
  }

  // Default fallback
  return roles[0]?.name || "knowledge_worker";
};

const getCategoryColor = (cat: string): string =>
  CATEGORY_COLORS[cat] || CATEGORY_COLORS.Neutral;

const getHourLabel = (dateOrStr: Date | string): string => {
  const date = new Date(dateOrStr);
  const hour = date.getHours();
  const period = hour >= 12 ? "PM" : "AM";
  const formatHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${formatHour} ${period}`;
};

const getNextHourLabel = (dateOrStr: Date | string): string => {
  const date = new Date(dateOrStr);
  const hour = (date.getHours() + 1) % 24;
  const period = hour >= 12 ? "PM" : "AM";
  const formatHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${formatHour} ${period}`;
};

const formatTimeOnly = (isoString?: string): string => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return ""; }
};

const parseTimeTo24h = (timeStr: string): string => {
  if (!timeStr) return "";
  const cleanStr = timeStr.trim().replace(/\s+/g, ' ');
  const match12h = cleanStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (match12h) {
    let hours = parseInt(match12h[1]);
    const minutes = match12h[2];
    const ampm = match12h[3].toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  const match24h = cleanStr.match(/^(\d+):(\d+)$/);
  if (match24h) {
    return `${String(match24h[1]).padStart(2, '0')}:${match24h[2]}`;
  }
  return "";
};

const parseScheduledSlots = (slotsStr: string): { start: string; end: string } => {
  const defaultVal = { start: "13:00", end: "14:00" };
  if (!slotsStr) return defaultVal;
  const parts = slotsStr.split("-");
  if (parts.length !== 2) return defaultVal;
  const start24 = parseTimeTo24h(parts[0].trim());
  const end24 = parseTimeTo24h(parts[1].trim());
  return {
    start: start24 || "13:00",
    end: end24 || "14:00"
  };
};

const format24hTo12h = (time24: string): string => {
  if (!time24) return "";
  const parts = time24.split(":");
  if (parts.length !== 2) return "";
  let hours = parseInt(parts[0]);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
};

const calculateDurationMinutes = (start24: string, end24: string): number => {
  if (!start24 || !end24) return 0;
  const [startH, startM] = start24.split(":").map(Number);
  const [endH, endM] = end24.split(":").map(Number);
  let startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }
  return endTotal - startTotal;
};



// =================================================
// COMPONENTS
// =================================================
function CompactStatWidget({ label, value, sub, colorClass, onClick }: {
  label: string; value: string; sub?: string; colorClass?: string; onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className={`bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center min-w-0 shadow-sm hover:bg-[#121826]/80 transition-colors ${onClick ? "cursor-pointer select-none" : ""}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xl font-bold font-mono tracking-tight mt-0.5 ${colorClass || "text-slate-100"}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-500 font-medium mt-0.5 leading-snug">{sub}</span>}
    </div>
  );
}


const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#121826] border border-white/5 rounded-lg p-3.5 shadow-lg text-xs backdrop-blur-md">
      {label && <p className="text-slate-400 mb-1.5 font-bold uppercase tracking-wider">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-400 font-medium">{entry.name}:</span>
          <span className="font-semibold text-slate-100">
            {entry.formatter
              ? entry.formatter(entry.value, entry.name, entry, i)
              : typeof entry.value === "number" && ["productive", "neutral", "unproductive", "idle"].includes(String(entry.name).toLowerCase())
                ? formatDuration(entry.value)
                : typeof entry.value === "number" && entry.name?.toLowerCase().includes("score")
                  ? (entry.value > 0 ? `+${entry.value}` : entry.value)
                  : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};
const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 shadow-lg text-xs font-mono">
      <p className="text-slate-200 font-bold border-b border-slate-800 pb-1 mb-1.5 uppercase text-[10px]">{data.time}</p>
      <div className="space-y-1">
        {data["Break Timing"] && (
          <div className="flex flex-col gap-0.5 text-amber-400 font-bold border-b border-slate-800/60 pb-1 mb-1">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">On Break:</span>
            <span className="text-[10px]">{data["Break Timing"]}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Focus Score:</span>
          <span className="text-blue-400 font-semibold">{data["Focus Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Activity Level:</span>
          <span className="text-emerald-400 font-semibold">{data["Activity Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Productivity:</span>
          <span className="text-indigo-400 font-semibold">{data["Productivity Score"]}%</span>
        </div>
        <div className="border-t border-slate-800 pt-1 mt-1 text-[9px] text-slate-500">
          <span className="block font-semibold uppercase text-[8px] text-slate-400 mb-0.5">Active Apps:</span>
          <span className="block text-slate-300 break-words max-w-[200px] leading-normal">{data["Active Apps"]}</span>
        </div>
      </div>
    </div>
  );
};


const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <div className="text-slate-300 text-xs leading-relaxed space-y-3 max-h-[480px] overflow-y-auto pr-2 custom-markdown border border-white/5 rounded-lg p-4 bg-[#111827]/40">
      <ReactMarkdown
        components={{
          h1: ({node, ...props}) => <h1 className="text-sm font-bold text-slate-100 mt-4 mb-2 border-b border-white/5 pb-1 uppercase tracking-wide" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xs font-bold text-slate-200 mt-3.5 mb-1.5 flex items-center gap-1.5 border-l-2 border-blue-500 pl-2" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-[11px] font-bold text-slate-300 mt-3 mb-1" {...props} />,
          p: ({node, ...props}) => <p className="mb-2.5 text-slate-300 leading-normal" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-4.5 mb-3 space-y-1 text-slate-400" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-4.5 mb-3 space-y-1 text-slate-400" {...props} />,
          li: ({node, ...props}) => <li className="text-slate-300" {...props} />,
          code: ({node, ...props}) => <code className="bg-[#111827] border border-white/5 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-mono" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-slate-100" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-blue-500 bg-blue-500/5 px-3 py-1.5 rounded-r-lg italic my-2 text-slate-400" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const getBrowserName = (proc: string) => {
  const p = (proc || "").toLowerCase();
  if (p.includes("chrome")) return "Google Chrome";
  if (p.includes("msedge") || p.includes("edge")) return "Microsoft Edge";
  if (p.includes("firefox")) return "Mozilla Firefox";
  if (p.includes("opera")) return "Opera";
  if (p.includes("safari")) return "Safari";
  return "Web Browser";
};

// =================================================
// MAIN ADMIN DASHBOARD
// =================================================
export default function AdminDashboard() {
  const router = useRouter();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState("");

  // Department filter & selectors
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("All");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"daily" | "yesterday" | "weekly" | "monthly" | "all" | "custom">("daily");
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [showOnlyBreaks, setShowOnlyBreaks] = useState<boolean>(false);

  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "custom", label: "Custom Date" },
    { value: "all", label: "All Time" }
  ], []);

  // Database roles mappings
  const [employeeRolesMap, setEmployeeRolesMap] = useState<Record<string, string>>({});
  const [dbRoles, setDbRoles] = useState<any[]>([]);

  // Break Management States
  const [breakLogs, setBreakLogs] = useState<any[]>([]);
  const [breakPolicy, setBreakPolicy] = useState<any>({
    daily_break_allowance: 60,
    policy_type: "flexible",
    enable_over_break_tracking: true,
    productivity_penalty: 0
  });
  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [allowanceInput, setAllowanceInput] = useState<number>(60);
  const [policyTypeInput, setPolicyTypeInput] = useState<string>("flexible");
  const [enableOverBreakInput, setEnableOverBreakInput] = useState<boolean>(true);
  const [penaltyInput, setPenaltyInput] = useState<number>(0);
  const [scheduledSlotsInput, setScheduledSlotsInput] = useState<string>("1:00 PM - 2:00 PM");
  const [fixedStartInput, setFixedStartInput] = useState<string>("13:00");
  const [fixedEndInput, setFixedEndInput] = useState<string>("14:00");
  const [secondsTick, setSecondsTick] = useState(0);

  // Detail Row expanded state
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Registered employees list from DB
  const [registeredEmployees, setRegisteredEmployees] = useState<string[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [groqClassifications, setGroqClassifications] = useState<Record<string, GroqClassificationResult>>({});
  const [domainRules, setDomainRules] = useState<Record<string, DomainRuleInfo>>({});

  // Visible activity log limit for pagination
  const [visibleLogsCount, setVisibleLogsCount] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Daily Summary States
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Working Hours States
  const [workingHoursStart, setWorkingHoursStart] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("workingHoursStart") || "10 AM";
    }
    return "10 AM";
  });
  const [workingHoursEnd, setWorkingHoursEnd] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("workingHoursEnd") || "6 PM";
    }
    return "6 PM";
  });
  const [isEditingWorkingHours, setIsEditingWorkingHours] = useState<boolean>(false);

  const getSummaryCacheKey = (employeeName: string): string => {
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `ai_summary::${employeeName}::${dateStr}`;
  };

  useEffect(() => {
    if (selectedEmployee && selectedEmployee !== "All") {
      const cacheKey = getSummaryCacheKey(selectedEmployee);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setAiSummary(cached);
      } else {
        setAiSummary(null);
      }
      setSummaryError(null);
    } else {
      setAiSummary(null);
      setSummaryError(null);
    }
  }, [selectedEmployee]);

  const handleGenerateAISummary = async () => {
    if (!selectedEmployee || selectedEmployee === "All") return;
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
      if (!apiKey || apiKey === "your_groq_api_key" || apiKey.includes("your_actual")) {
        throw new Error("Groq API key is not configured or is a placeholder.");
      }

      // Group and aggregate activities to fit within Groq's 12,000 TPM limit
      const aggregationMap: Record<string, { app: string; context: string; category: string; totalDurationSeconds: number; occurrences: number }> = {};
      
      filteredActivities.forEach(l => {
        const app = l.ai?.cleanName || l.app_name;
        const context = l.website || l.app_name;
        const category = l.ai?.category || l.category;
        const key = `${app}::${context}::${category}`;
        
        if (!aggregationMap[key]) {
          aggregationMap[key] = {
            app,
            context,
            category,
            totalDurationSeconds: 0,
            occurrences: 0
          };
        }
        aggregationMap[key].totalDurationSeconds += l.duration_seconds;
        aggregationMap[key].occurrences += 1;
      });

      const logsSummary = Object.values(aggregationMap)
        .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds)
        .map(item => ({
          app: item.app,
          context: item.context,
          category: item.category,
          totalDuration: formatDuration(item.totalDurationSeconds),
          sessionsCount: item.occurrences
        }));

      const roleName = employeeRolesMap[selectedEmployee] || "Knowledge Worker";

      const prompt = `You are a corporate AI workforce analyst.
Analyze the following WFH activity logs for employee "${selectedEmployee}" (Role: ${roleName}) for today.

WFH Activity Logs:
${JSON.stringify(logsSummary, null, 2)}

Please generate a single, very short paragraph (maximum 3 sentences) summarizing the employee's daily productivity, key work achievements, and main distractions.
**Strict Formatting Constraints**:
- Return ONLY a single short paragraph.
- Do NOT use headings, titles, lists, or bullet points.
- Do NOT include any efficiency scores, tips, advice, or recommendations.`;

      const response = await fetch(
        `https://api.groq.com/openai/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const summaryText = data.choices?.[0]?.message?.content;
      
      if (!summaryText) {
        throw new Error("Failed to receive content from Groq API.");
      }

      // Cache it
      const cacheKey = getSummaryCacheKey(selectedEmployee);
      localStorage.setItem(cacheKey, summaryText);
      setAiSummary(summaryText);
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || "An unexpected error occurred during summary generation.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const fetchBreakPolicyAndLogs = async () => {
    try {
      const { data: policyData } = await supabase
        .from("break_policy")
        .select("*")
        .eq("id", "global")
        .single();
      if (policyData) {
        setBreakPolicy(policyData);
        setAllowanceInput(policyData.daily_break_allowance);
        setPolicyTypeInput(policyData.policy_type);
        setEnableOverBreakInput(policyData.enable_over_break_tracking);
        setPenaltyInput(policyData.productivity_penalty);
        const slots = policyData.scheduled_slots || "1:00 PM - 2:00 PM";
        setScheduledSlotsInput(slots);
        const parsed = parseScheduledSlots(slots);
        setFixedStartInput(parsed.start);
        setFixedEndInput(parsed.end);
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: logsData } = await supabase
        .from("break_logs")
        .select("*")
        .gte("start_time", startOfToday.toISOString());
      if (logsData) {
        setBreakLogs(logsData);
      }
    } catch (err) {
      console.error("Error fetching break data:", err);
    }
  };

  const handleSavePolicy = async () => {
    try {
      const formattedSlots = policyTypeInput === "fixed" ? `${format24hTo12h(fixedStartInput)} - ${format24hTo12h(fixedEndInput)}` : null;
      const allowance = policyTypeInput === "fixed" ? calculateDurationMinutes(fixedStartInput, fixedEndInput) : allowanceInput;
      const { data, error } = await supabase
        .from("break_policy")
        .upsert({
          id: "global",
          daily_break_allowance: allowance,
          policy_type: policyTypeInput,
          enable_over_break_tracking: enableOverBreakInput,
          productivity_penalty: penaltyInput,
          scheduled_slots: formattedSlots
        })
        .select()
        .single();
      
      if (error) throw error;
      
      if (data) {
        setBreakPolicy(data);
        setScheduledSlotsInput(data.scheduled_slots || "1:00 PM - 2:00 PM");
        setIsEditingPolicy(false);
      }
    } catch (err: any) {
      console.error("Failed to update break policy:", err);
      alert(`Failed to update break policy: ${err?.message || err}. If you are enabling a Fixed Scheduled break, please make sure you ran the SQL script to add the "scheduled_slots" column in your Supabase SQL Editor:
      
      ALTER TABLE public.break_policy ADD COLUMN IF NOT EXISTS scheduled_slots VARCHAR DEFAULT '1:00 PM - 2:00 PM';`);
    }
  };

  // Fetch initial mappings and raw logs
  const loadData = async (currentFilter: string = "daily", targetDateStr?: string, targetEmployee: string = "All") => {
    // Fetch break data
    await fetchBreakPolicyAndLogs();

    // 0. Fetch Domain Rules and Roles (handle if table doesn't exist yet)
    let dbRolesList: any[] = [];
    try {
      const { data: rolesData } = await supabase
        .from("roles")
        .select("*");
      if (rolesData) {
        dbRolesList = rolesData;
        setDbRoles(rolesData);
      }
    } catch (err) {
      console.error("Failed to load roles from database:", err);
    }

    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from("domain_rules")
        .select("*");
      if (!rulesError && rulesData) {
        const rulesMap: Record<string, DomainRuleInfo> = {};
        rulesData.forEach((r: any) => {
          if (r.domain) {
            const defaultScore = r.type === "whitelist" ? 10 : r.type === "blacklist" ? -10 : 0;
            rulesMap[r.domain.toLowerCase().trim()] = {
              type: r.type,
              score: typeof r.score === "number" ? r.score : defaultScore
            };
          }
        });
        setDomainRules(rulesMap);
      }
    } catch (err) {
      console.error("Failed to load domain rules:", err);
    }

    // 1. Fetch Employees (from the employees table)
    const { data: employeesData } = await supabase
      .from("employees")
      .select("*");

    if (employeesData) {
      setEmployeesList(employeesData);
      const empNames = employeesData
        .filter((e: any) => e.id !== "admin" && e.role !== "admin")
        .map((e: any) => e.name)
        .filter(Boolean);
      setRegisteredEmployees(empNames);

      // Map employee names to their departments (roles)
      const map: Record<string, string> = {};
      employeesData.forEach((e: any) => {
        if (e.name) {
          map[e.name] = getRoleNameForDepartment(e.department || "", dbRolesList);
        }
      });
      setEmployeeRolesMap(map);
    }

    // 2. Fetch Activity Logs
    let query = supabase
      .from("activity_logs")
      .select("*");

    if (targetEmployee && targetEmployee !== "All") {
      query = query.eq("employee_name", targetEmployee);
    }

    if (currentFilter === "custom" && targetDateStr) {
      const [year, month, day] = targetDateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      
      query = query
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
    } else if (currentFilter === "yesterday") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      
      query = query
        .gte("start_time", startOfYesterday.toISOString())
        .lt("start_time", startOfToday.toISOString());
    } else if (currentFilter === "weekly") {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      query = query
        .gte("start_time", startOfWeek.toISOString())
        .lte("start_time", endOfWeek.toISOString());
    } else if (currentFilter === "monthly") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfMonth.toISOString())
        .lte("start_time", endOfMonth.toISOString());
    } else if (currentFilter === "daily") {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data: logsData, error } = await query
      .order("start_time", { ascending: false })
      .limit(10000);

    if (!error && logsData) {
      setActivities(logsData);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData(timeFilter, customDate, selectedEmployee);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sync selected employee with search input
  useEffect(() => {
    if (selectedEmployee === "All") {
      setSearchTerm("");
    } else {
      setSearchTerm(selectedEmployee);
    }
  }, [selectedEmployee]);

  // Authentication Guard
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "admin") {
      router.push("/");
    } else {
      setAdminName(name || "Admin");
      setIsLoading(false);
    }
  }, [router]);

  // Initial Fetches and Zero-Polling Real-Time stream
  useEffect(() => {
    if (isLoading) return;

    loadData(timeFilter, customDate, selectedEmployee);

    // Bind dynamic Real-Time postgres insertion trigger (zero-polling)
    const channel = supabase
      .channel("activity-channel-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
        loadData(timeFilter, customDate, selectedEmployee);
      })
      .subscribe();

    const breakChannel = supabase
      .channel("break-logs-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, (payload) => {
        fetchBreakPolicyAndLogs();
      })
      .subscribe();

    const policyChannel = supabase
      .channel("break-policy-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_policy" }, (payload) => {
        fetchBreakPolicyAndLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(breakChannel);
      supabase.removeChannel(policyChannel);
    };
  }, [isLoading, timeFilter, customDate, selectedEmployee]);

  // Load and fetch Groq classifications for all unique activities in the admin view
  useEffect(() => {
    if (!activities.length) return;

    const newClassifications: Record<string, GroqClassificationResult> = { ...groqClassifications };
    let stateChanged = false;
    const pendingFetches: Array<{ appName: string; website: string; roleName: string; key: string }> = [];

    activities.forEach(log => {
      if (log.app_name === "IDLE" || log.app_name === "Unknown" || log.app_name?.startsWith("STATUS_CHANGE")) return;

      const roleName = employeeRolesMap[log.employee_name] || "Knowledge Worker";
      const cacheKey = getGroqCacheKey(log.app_name, log.website, roleName);
      if (newClassifications[cacheKey]) return;

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          newClassifications[cacheKey] = JSON.parse(cached);
          stateChanged = true;
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      } else {
        pendingFetches.push({ appName: log.app_name, website: log.website, roleName, key: cacheKey });
      }
    });

    if (stateChanged) {
      setGroqClassifications(newClassifications);
    }

    if (pendingFetches.length > 0) {
      const fetchAll = async () => {
        const chunkSize = 15;
        const chunks = [];
        for (let i = 0; i < pendingFetches.length; i += chunkSize) {
          chunks.push(pendingFetches.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
          const results = await fetchGroqClassificationsBatch(
            chunk.map(item => ({
              appName: item.appName,
              website: item.website,
              roleName: item.roleName,
              key: item.key
            }))
          );

          setGroqClassifications(prev => {
            const next = { ...prev };
            for (const key in results) {
              localStorage.setItem(key, JSON.stringify(results[key]));
              next[key] = results[key];
            }
            return next;
          });
        }
      };
      fetchAll();
    }
  }, [activities, employeeRolesMap]);

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // =================================================
  // COGNITIVE INTEL COMPUTATIONS
  // =================================================
  const uniqueEmployees = useMemo(() => {
    return ["All", ...registeredEmployees];
  }, [registeredEmployees]);

  const matchingEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return uniqueEmployees.filter(empName => {
      if (empName === "All") return false;
      if (empName.toLowerCase().includes(term)) return true;
      const empProfile = employeesList.find(e => e.name?.toLowerCase() === empName.toLowerCase());
      if (empProfile && empProfile.id?.toLowerCase().includes(term)) return true;
      return false;
    });
  }, [uniqueEmployees, searchTerm, employeesList]);

  const availableRolesList = useMemo(() => {
    if (dbRoles.length === 0) {
      return ["All", ...Object.values(FALLBACK_ROLES).map(r => r.name)];
    }
    return ["All", ...dbRoles.map(r => r.name)];
  }, [dbRoles]);

  const departmentOptions = useMemo(() => {
    return availableRolesList.map(role => ({
      value: role,
      label: role === "All" ? "All Departments" : role.replace(/_/g, " ").toUpperCase()
    }));
  }, [availableRolesList]);

  const employeeOptions = useMemo(() => {
    return uniqueEmployees
      .filter(emp => {
        if (emp === "All") return true;
        const role = employeeRolesMap[emp] || "knowledge_worker";
        return selectedRoleFilter === "All" || role === selectedRoleFilter;
      })
      .map(emp => ({
        value: emp,
        label: emp === "All" ? "All Employees" : emp
      }));
  }, [uniqueEmployees, employeeRolesMap, selectedRoleFilter]);

  // Sort and classify WFH activities exactly once
  const classifiedActivities = useMemo(() => {
    return activities.map((log) => {
      const roleName = employeeRolesMap[log.employee_name] || "knowledge_worker";
      const cacheKey = getGroqCacheKey(log.app_name, log.website, roleName);
      const groqCls = groqClassifications[cacheKey] || null;
      const empBreakLogs = breakLogs.filter(b => b.employee_name === log.employee_name);
      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        [],
        groqCls,
        domainRules,
        log.start_time,
        empBreakLogs
      );
      return {
        ...log,
        ai
      };
    });
  }, [activities, employeeRolesMap, groqClassifications, domainRules, breakLogs]);

  // Individual statistics
  const employeeSessionStats = useMemo(() => {
    const list: {
      username: string;
      roleName: string;
      productivityRate: number;
      totalDuration: number;
      productiveDuration: number;
      breakDurationToday: number;
      remainingBreakSeconds: number;
      overBreakSeconds: number;
      currentSessionBreakSeconds: number;
      currentStatus: string;
      logs: any[];
    }[] = [];

    const usernames = uniqueEmployees.filter(e => e !== "All");

    usernames.forEach(user => {
      const empLogs = classifiedActivities.filter(a => a.employee_name === user);
      const roleName = employeeRolesMap[user] || "knowledge_worker";

      let productiveDuration = 0;
      let activeDuration = 0;
      let totalDuration = 0;
      let breakDurationToday = 0;

      // 1. Calculate today's break logs duration
      const empBreaks = breakLogs.filter(b => b.employee_name === user);
      let activeBreakLog: any = null;
      empBreaks.forEach((b: any) => {
        if (b.end_time) {
          breakDurationToday += b.duration_seconds || 0;
        } else {
          activeBreakLog = b;
          const elapsed = Math.max(0, Math.floor((Date.now() - new Date(b.start_time).getTime()) / 1000));
          breakDurationToday += elapsed;
        }
      });

      empLogs.filter(l => !l.app_name?.startsWith("STATUS_CHANGE")).forEach(l => {
        const duration = l.duration_seconds || 0;
        const cat = l.ai.category;
        if (cat !== "Idle" && cat !== "Break") {
          activeDuration += duration;
        }
        if (cat === "Productive") {
          productiveDuration += duration;
        }
        totalDuration += duration;
      });

      const allowanceSeconds = (breakPolicy?.daily_break_allowance || 60) * 60;
      const overBreakSeconds = Math.max(0, breakDurationToday - allowanceSeconds);

      let productivityRate = totalDuration > 0 ? Math.round((productiveDuration / totalDuration) * 100) : 0;

      // Apply productivity penalty for over-break
      if (breakPolicy?.enable_over_break_tracking && overBreakSeconds > 0 && breakPolicy?.productivity_penalty > 0) {
        productivityRate = Math.max(0, productivityRate - breakPolicy.productivity_penalty);
      }

      const statusLog = empLogs.find(l => l.app_name?.startsWith("STATUS_CHANGE"));
      let currentStatus = statusLog ? statusLog.app_name.split(" | ")[1] || "offline" : "offline";

      const isCurrentlyOnBreak = !!activeBreakLog;
      if (isCurrentlyOnBreak) {
        if (breakDurationToday > allowanceSeconds) {
          currentStatus = "exceeded_break";
        } else {
          currentStatus = "on_break";
        }
      }

      const lastActiveLog = empLogs.find(l => !l.app_name?.startsWith("STATUS_CHANGE"));
      
      if (!isCurrentlyOnBreak) {
        if (currentStatus === "online" || currentStatus === "idle" || currentStatus === "dnd" || currentStatus === "on_break") {
          const latestLog = empLogs[0];
          if (latestLog) {
            const lastLogTime = new Date(latestLog.end_time || latestLog.start_time).getTime();
            const timeDiffMinutes = (Date.now() - lastLogTime) / 60000;
            if (timeDiffMinutes > 5) {
              currentStatus = "disabled";
            }
          } else if (statusLog) {
            const statusTime = new Date(statusLog.start_time).getTime();
            const timeDiffMinutes = (Date.now() - statusTime) / 60000;
            if (timeDiffMinutes > 5) {
              currentStatus = "disabled";
            }
          }
        } else if (currentStatus === "offline" || !currentStatus) {
          if (lastActiveLog) {
            const lastActiveTime = new Date(lastActiveLog.end_time || lastActiveLog.start_time).getTime();
            const timeDiffMinutes = (Date.now() - lastActiveTime) / 60000;
            if (timeDiffMinutes <= 5) {
              currentStatus = "online";
            }
          }
        }
      }

      list.push({
        username: user,
        roleName,
        productivityRate,
        totalDuration: activeDuration,
        productiveDuration,
        breakDurationToday,
        remainingBreakSeconds: Math.max(0, allowanceSeconds - breakDurationToday),
        overBreakSeconds,
        currentSessionBreakSeconds: activeBreakLog ? Math.max(0, Math.floor((Date.now() - new Date(activeBreakLog.start_time).getTime()) / 1000)) : 0,
        currentStatus,
        logs: empLogs
      });
    });

    return list.sort((a, b) => b.productivityRate - a.productivityRate);
  }, [classifiedActivities, employeeRolesMap, uniqueEmployees, breakLogs, breakPolicy, secondsTick]);

  // Tick live timers on admin dashboard when employees are on break
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const hasActiveBreaks = employeeSessionStats.some(e => e.currentStatus === "on_break" || e.currentStatus === "exceeded_break");
    if (hasActiveBreaks) {
      interval = setInterval(() => {
        setSecondsTick(s => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [employeeSessionStats]);

  // Apply filters
  const filteredEmployeesStats = useMemo(() => {
    return employeeSessionStats.filter(emp => {
      const matchesRole = selectedRoleFilter === "All" || emp.roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || emp.username === selectedEmployee;
      const matchesBreaks = !showOnlyBreaks || emp.currentStatus === "on_break" || emp.currentStatus === "exceeded_break" || emp.overBreakSeconds > 0;
      return matchesRole && matchesEmployee && matchesBreaks;
    });
  }, [employeeSessionStats, selectedRoleFilter, selectedEmployee, showOnlyBreaks]);

  // Aggregated Team Stats
  const teamAggregates = useMemo(() => {
    const total = filteredEmployeesStats.length;
    if (total === 0) {
      return { avgProductivity: 0, totalHoursTracked: 0, activeCount: 0, mostActiveUser: "-" };
    }
    const sumProductivity = filteredEmployeesStats.reduce((s, e) => s + e.productivityRate, 0);
    const totalTime = filteredEmployeesStats.reduce((s, e) => s + e.totalDuration, 0);
    const activeOnline = filteredEmployeesStats.filter(e => e.currentStatus === "online" || e.currentStatus === "dnd").length;

    // Most active employee
    const sortedByTime = [...filteredEmployeesStats].sort((a, b) => b.totalDuration - a.totalDuration);
    const mostActiveUser = sortedByTime[0] ? sortedByTime[0].username : "-";

    return {
      avgProductivity: Math.round(sumProductivity / total),
      totalHoursTracked: parseFloat((totalTime / 3600).toFixed(1)),
      activeCount: activeOnline,
      mostActiveUser
    };
  }, [filteredEmployeesStats]);

  // Raw filtered activity list for graphs and timeline
  const filteredActivities = useMemo(() => {
    return classifiedActivities.filter(a => {
      const roleName = employeeRolesMap[a.employee_name] || "Knowledge Worker";
      const matchesRole = selectedRoleFilter === "All" || roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || a.employee_name === selectedEmployee;
      return matchesRole && matchesEmployee;
    });
  }, [classifiedActivities, selectedRoleFilter, selectedEmployee, employeeRolesMap]);

  // Timeline Logs for selected stepper employee
  const timelineLogs = useMemo(() => {
    if (!selectedEmployee || selectedEmployee === "All") return [];
    return classifiedActivities
      .filter(a => a.employee_name === selectedEmployee)
      .slice(0, 15) // Capture last 15 active steps
      .reverse(); // Chronological bottom-to-top stepper
  }, [classifiedActivities, selectedEmployee]);

  // Team Category Pie Chart Distribution (excluding Idle)
  const categoryChartData = useMemo(() => {
    const breakdown: Record<string, number> = {};
    filteredActivities.forEach(a => {
      if (a.ai.category !== "Idle") {
        breakdown[a.ai.category] = (breakdown[a.ai.category] || 0) + (a.duration_seconds || 0);
      }
    });
    return Object.entries(breakdown)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, raw: value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredActivities]);

  // Total Idle Time for selected employee(s) / department
  const totalIdleTime = useMemo(() => {
    return filteredActivities
      .filter(a => a.ai.category === "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Total Daily Time for selected employee(s) / department
  const totalDailyTime = useMemo(() => {
    return filteredActivities.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Total Non-Idle Time for selected employee(s) / department
  const totalNonIdleTime = useMemo(() => {
    return filteredActivities
      .filter(a => a.ai.category !== "Idle" && a.ai.category !== "Break")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  const totalBreakTime = useMemo(() => {
    return filteredActivities
      .filter(a => a.ai.category === "Break")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Hourly Productivity Trend overall
  const hourlyFocusTrend = useMemo(() => {
    const hoursMap: Record<number, { 
      totalDuration: number;
      activeDuration: number; 
      productiveDuration: number;
      scoreSum: number;
      scoreCount: number;
      apps: Set<string>;
    }> = {};
    
    for (let i = 0; i <= 23; i++) {
      hoursMap[i] = {
        totalDuration: 0,
        activeDuration: 0,
        productiveDuration: 0,
        scoreSum: 0,
        scoreCount: 0,
        apps: new Set<string>()
      };
    }

    filteredActivities.forEach(a => {
      if (!a.start_time) return;
      const date = new Date(a.start_time);
      const hour = date.getHours();
      if (hour >= 0 && hour <= 23) {
        const duration = a.duration_seconds || 0;
        const cat = a.ai.category;
        const app = a.ai.cleanName;
        
        if (!a.app_name?.startsWith("STATUS_CHANGE")) {
          hoursMap[hour].totalDuration += duration;
          if (cat !== "Idle" && cat !== "Break") {
            hoursMap[hour].activeDuration += duration;
            if (cat === "Productive") {
              hoursMap[hour].productiveDuration += duration;
            }
            hoursMap[hour].scoreSum += a.ai.score;
            hoursMap[hour].scoreCount++;
            if (app && app !== "Unknown" && app !== "Web Browser") {
              hoursMap[hour].apps.add(app);
            }
          }
        }
      }
    });

    return Object.entries(hoursMap).map(([hourStr, val]) => {
      const hour = parseInt(hourStr);
      const parsedHour = hour;
      const period = parsedHour >= 12 ? "PM" : "AM";
      const formatHour = parsedHour % 12 === 0 ? 12 : parsedHour % 12;
      const timeLabel = `${formatHour} ${period}`;
      
      const focusScore = val.scoreCount > 0 
        ? Math.max(0, Math.min(100, Math.round(((val.scoreSum / val.scoreCount) + 10) * 5))) 
        : 0;
        
      const activityScore = Math.min(100, Math.round((val.activeDuration / 3600) * 100));
      
      const productivityScore = val.totalDuration > 0 
        ? Math.round((val.productiveDuration / val.totalDuration) * 100) 
        : 0;
        
      const activeAppsList = Array.from(val.apps).slice(0, 3);
      const activeAppsStr = activeAppsList.length > 0 ? activeAppsList.join(", ") : "None";

      const endHour = (parsedHour + 1) % 24;
      const endPeriod = endHour >= 12 ? "PM" : "AM";
      const formatEnd = endHour % 12 === 0 ? 12 : endHour % 12;
      const slotLabel = `${timeLabel} - ${formatEnd} ${endPeriod}`;

      // Check if this hour overlaps with any break logs today for the selected employee
      const activeBreaksInHour = breakLogs
        .filter(b => selectedEmployee === "All" || b.employee_name === selectedEmployee)
        .filter(b => {
          if (filteredActivities.length > 0) {
            const logDate = new Date(filteredActivities[0].start_time).toDateString();
            const breakDate = new Date(b.start_time).toDateString();
            if (logDate !== breakDate) return false;
          }
          const breakStart = new Date(b.start_time);
          const breakEnd = b.end_time ? new Date(b.end_time) : new Date();
          const startHour = breakStart.getHours();
          const endHour = breakEnd.getHours();
          return hour >= startHour && hour <= endHour;
        });

      const breakTimesStr = activeBreaksInHour
        .map(b => selectedEmployee === "All" 
          ? `${b.employee_name} (${formatTimeOnly(b.start_time)} - ${b.end_time ? formatTimeOnly(b.end_time) : "Active"})`
          : `${formatTimeOnly(b.start_time)} - ${b.end_time ? formatTimeOnly(b.end_time) : "Active"}`
        )
        .join(", ");

      return {
        time: timeLabel,
        slot: slotLabel,
        hour: hour,
        "Focus Score": focusScore,
        "Activity Score": activityScore,
        "Productivity Score": productivityScore,
        "Active Apps": activeAppsStr,
        productiveDuration: val.productiveDuration,
        "Break Timing": breakTimesStr || null
      };
    });
  }, [filteredActivities, breakLogs, selectedEmployee]);

  const longestIdlePeriod = useMemo(() => {
    const idleLogs = filteredActivities.filter(a => a.ai.category === "Idle");
    if (idleLogs.length === 0) return 0;
    return Math.max(...idleLogs.map(l => l.duration_seconds || 0));
  }, [filteredActivities]);

  const longestIdleHourLabel = useMemo(() => {
    const idleLogs = filteredActivities.filter(a => a.ai.category === "Idle" && a.duration_seconds > 0);
    if (idleLogs.length === 0) return null;
    let longestLog = idleLogs[0];
    idleLogs.forEach(l => {
      if ((l.duration_seconds || 0) > (longestLog.duration_seconds || 0)) {
        longestLog = l;
      }
    });
    if (longestLog.duration_seconds < 120) return null; // Only show if > 2 mins
    if (!longestLog.start_time) return null;
    const date = new Date(longestLog.start_time);
    const hour = date.getHours();
    const period = hour >= 12 ? "PM" : "AM";
    const formatHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${formatHour} ${period}`;
  }, [filteredActivities]);

  const timelineSummaryStats = useMemo(() => {
    const activeHours = hourlyFocusTrend.filter(h => h["Activity Score"] > 0 || h["Focus Score"] > 0);
    const avgFocus = activeHours.length > 0 
      ? Math.round(activeHours.reduce((sum, h) => sum + h["Focus Score"], 0) / activeHours.length)
      : 0;

    // Find peak focus hour based on highest productive duration in a one hour slot
    let peakHourObj = { slot: "—", productiveDuration: -1 };
    hourlyFocusTrend.forEach(h => {
      if ((h as any).productiveDuration > peakHourObj.productiveDuration && (h as any).productiveDuration > 0) {
        peakHourObj = { slot: (h as any).slot, productiveDuration: (h as any).productiveDuration };
      }
    });

    const peakFocusTime = peakHourObj.productiveDuration > 0 ? peakHourObj.slot : "—";
    
    return {
      avgFocus,
      peakFocusTime
    };
  }, [hourlyFocusTrend]);

  const distributionStats = useMemo(() => {
    let productive = 0;
    let neutral = 0;
    let unproductive = 0;
    let idle = 0;
    let breakTime = 0;

    filteredActivities.forEach(a => {
      if (a.app_name?.startsWith("STATUS_CHANGE")) return;
      const duration = a.duration_seconds || 0;
      const cat = a.ai.category;
      if (cat === "Productive") productive += duration;
      else if (cat === "Neutral") neutral += duration;
      else if (cat === "Unproductive") unproductive += duration;
      else if (cat === "Idle") idle += duration;
      else if (cat === "Break") breakTime += duration;
    });

    const total = productive + neutral + unproductive + idle + breakTime;
    
    return {
      productive: { duration: productive, pct: total > 0 ? Math.round((productive / total) * 100) : 0 },
      neutral: { duration: neutral, pct: total > 0 ? Math.round((neutral / total) * 100) : 0 },
      unproductive: { duration: unproductive, pct: total > 0 ? Math.round((unproductive / total) * 100) : 0 },
      idle: { duration: idle, pct: total > 0 ? Math.round((idle / total) * 100) : 0 },
      breakTime: { duration: breakTime, pct: total > 0 ? Math.round((breakTime / total) * 100) : 0 },
      total
    };
  }, [filteredActivities]);

  const averageProductivityRating = useMemo(() => {
    let scoreSum = 0;
    let totalDuration = 0;
    filteredActivities.forEach(a => {
      if (a.app_name?.startsWith("STATUS_CHANGE") || a.ai.category === "Idle" || a.ai.category === "Break") return;
      const score = typeof a.ai.score === "number" ? a.ai.score : 0;
      const duration = a.duration_seconds || 0;
      scoreSum += score * duration;
      totalDuration += duration;
    });
    if (totalDuration === 0) return 0;
    const avg = scoreSum / totalDuration;
    return parseFloat(avg.toFixed(1));
  }, [filteredActivities]);

  const avgBreakDuration = useMemo(() => {
    const completed = breakLogs.filter(b => b.end_time && b.duration_seconds > 0);
    if (completed.length === 0) return 0;
    const totalSec = completed.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
    return Math.round(totalSec / completed.length);
  }, [breakLogs]);

  const employeesOnBreakCount = useMemo(() => {
    return breakLogs.filter(b => !b.end_time).length;
  }, [breakLogs]);

  const overBreakUsersCount = useMemo(() => {
    return employeeSessionStats.filter(e => e.overBreakSeconds > 0).length;
  }, [employeeSessionStats]);

  const totalBreakTimeAll = useMemo(() => {
    return breakLogs.reduce((sum, b) => {
      if (b.end_time) {
        return sum + (b.duration_seconds || 0);
      } else {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(b.start_time).getTime()) / 1000));
        return sum + elapsed;
      }
    }, 0);
  }, [breakLogs, secondsTick]);

  const timeFilterLabel = useMemo(() => {
    switch (timeFilter) {
      case "daily": return "today";
      case "yesterday": return "yesterday";
      case "weekly": return "this week";
      case "monthly": return "this month";
      case "custom": return "on selected date";
      case "all": return "all time";
      default: return "today";
    }
  }, [timeFilter]);

  if (isLoading) return (
    <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
      </div>
    </div>
  );  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              WFH Monitor
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center h-[32px]"
              title="Refresh logs & dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : "text-slate-400"}`} />
            </button>

            {/* BREAK POLICY DISPLAY */}
            <div 
              onClick={() => setIsEditingPolicy(!isEditingPolicy)}
              className="bg-[#121826] hover:bg-slate-800 border border-slate-800 px-3 py-1 rounded flex items-center gap-2 cursor-pointer h-[32px] select-none font-mono text-[9px]"
              title="Click to configure Break Policy"
            >
              <div className="flex flex-col text-left">
                <span className="text-slate-500 font-bold uppercase tracking-wider leading-none">Break Policy</span>
                <span className="text-amber-400 font-bold leading-none mt-0.5">{breakPolicy?.daily_break_allowance || 60} Min Daily ({breakPolicy?.policy_type === 'fixed' ? `Fixed: ${breakPolicy?.scheduled_slots || '1:00 PM - 2:00 PM'}` : 'Flexible'})</span>
              </div>
              <Sliders className="w-3 h-3 text-amber-500 shrink-0" />
            </div>
            <Link
              href="/admin/employees"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer h-[32px]"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" /> Manage Employees
            </Link>
            <Link
              href="/admin/domains"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer h-[32px]"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-500" /> Manage Domains
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer h-[32px]"
            >
              Logout
            </button>
          </div>
        </header>

        {/* EDIT BREAK POLICY PANEL (MODAL OVERLAY) */}
        {isEditingPolicy && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-[#121826] border border-slate-800 rounded p-5 shadow-2xl max-w-xl w-full animate-in zoom-in-95 duration-150 space-y-4 relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Sliders className="w-4 h-4 text-amber-500" /> Break Policy Configuration
                </span>
                <button 
                  onClick={() => setIsEditingPolicy(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer transition-colors"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Daily Break Allowance - Only visible for Flexible Breaks */}
                {policyTypeInput !== "fixed" && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Daily Break Allowance</label>
                    <select
                      value={allowanceInput}
                      onChange={(e) => setAllowanceInput(Number(e.target.value))}
                      className="bg-[#111827] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-sans h-[34px]"
                    >
                      <option value={15}>15 Minutes</option>
                      <option value={30}>30 Minutes</option>
                      <option value={45}>45 Minutes</option>
                      <option value={60}>60 Minutes</option>
                      <option value={90}>90 Minutes</option>
                      <option value={120}>120 Minutes</option>
                      <option value={0}>Custom</option>
                    </select>
                    {allowanceInput === 0 && (
                      <input
                        type="number"
                        placeholder="Enter minutes..."
                        onChange={(e) => setAllowanceInput(Number(e.target.value))}
                        className="mt-1 bg-[#111827] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                      />
                    )}
                  </div>
                )}

                {/* Break Policy Type */}
                <div className={`flex flex-col gap-1.5 ${policyTypeInput === "fixed" ? "sm:col-span-2" : ""}`}>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Break Policy Type</label>
                  <div className="grid grid-cols-2 gap-1 bg-[#111827] p-1 border border-slate-800 rounded h-[34px] w-full">
                    <button
                      type="button"
                      onClick={() => setPolicyTypeInput("flexible")}
                      className={`rounded text-xs font-semibold transition-all cursor-pointer flex items-center justify-center h-full w-full ${
                        policyTypeInput === "flexible"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "text-slate-400 hover:text-slate-200 hover:bg-[#1f2937]/30"
                      }`}
                    >
                      Flexible Breaks
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolicyTypeInput("fixed")}
                      className={`rounded text-xs font-semibold transition-all cursor-pointer flex items-center justify-center h-full w-full ${
                        policyTypeInput === "fixed"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "text-slate-400 hover:text-slate-200 hover:bg-[#1f2937]/30"
                      }`}
                    >
                      Fixed Scheduled
                    </button>
                  </div>
                </div>

                {/* Fixed Break Time Settings */}
                {policyTypeInput === "fixed" && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2 bg-[#111827]/40 border border-slate-800/60 p-2.5 rounded animate-in slide-in-from-top duration-150">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Fixed Break Time Settings</label>
                      <span className="text-[9px] font-mono text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">
                        Calculated Allowance: {calculateDurationMinutes(fixedStartInput, fixedEndInput)} Mins
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-mono">Start Time</span>
                        <input
                          type="time"
                          value={fixedStartInput}
                          onChange={(e) => setFixedStartInput(e.target.value)}
                          className="w-full bg-[#111827] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono [color-scheme:dark]"
                        />
                      </div>
                      <span className="text-slate-500 text-xs mt-3.5 font-bold font-mono">TO</span>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider font-mono">End Time</span>
                        <input
                          type="time"
                          value={fixedEndInput}
                          onChange={(e) => setFixedEndInput(e.target.value)}
                          className="w-full bg-[#111827] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-500 italic mt-0.5">Select the start and end time of the fixed break period</span>
                  </div>
                )}

                {/* Enable Over-Break Tracking */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Over-Break Tracking</label>
                  <div className="flex gap-2 h-[32px] items-center">
                    <button
                      type="button"
                      onClick={() => setEnableOverBreakInput(!enableOverBreakInput)}
                      className={`px-3 py-1 border rounded text-xs font-semibold transition-all cursor-pointer ${
                        enableOverBreakInput 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {enableOverBreakInput ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* Productivity Penalty */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Productivity Penalty (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={penaltyInput}
                    onChange={(e) => setPenaltyInput(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="bg-[#111827] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setIsEditingPolicy(false)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 cursor-pointer transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePolicy}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer transition-all"
                >
                  Save Policy Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADVANCED FILTERING CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#121826] border border-slate-800 p-2 rounded shadow-sm relative z-30">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dash Filtering</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <button
              onClick={() => setShowOnlyBreaks(!showOnlyBreaks)}
              className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 h-[32px] border ${
                showOnlyBreaks 
                  ? "bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30" 
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Timer className="w-3.5 h-3.5 text-amber-500" />
              <span>Breaks Only</span>
            </button>

            <Dropdown
              options={departmentOptions}
              value={selectedRoleFilter}
              onChange={(val) => {
                setSelectedRoleFilter(val);
                setSelectedEmployee("All");
              }}
              label="Designation:"
            />

            <div className="flex items-center gap-2">
              <Dropdown
                options={timeFilterOptions}
                value={timeFilter}
                onChange={(val) => setTimeFilter(val as any)}
                icon={CalendarDays}
              />
              {timeFilter === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-2.5 py-1 bg-[#121826] border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans cursor-pointer h-[32px] [color-scheme:dark]"
                />
              )}
            </div>

            {/* SEARCH EMPLOYEE TYPEAHEAD */}
            <div className="relative w-52 z-40">
              <div className="flex items-center bg-[#111827] border border-slate-800 rounded px-2.5 py-1 focus-within:ring-1 focus-within:ring-blue-500/50">
                <Users className="w-3.5 h-3.5 text-blue-500 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                  className="w-full bg-transparent border-none text-slate-200 placeholder:text-slate-500 focus:outline-none text-xs h-[22px]"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedEmployee("All");
                    }}
                    className="text-slate-500 hover:text-slate-300 text-xs ml-1 focus:outline-none cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              {isDropdownOpen && matchingEmployees.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-[#121826] border border-slate-800 rounded shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-800">
                  {matchingEmployees.map((empName) => {
                    const roleName = employeeRolesMap[empName] || "Knowledge Worker";
                    const roleLabel = roleName;
                    const empProfile = employeesList.find(e => e.name?.toLowerCase() === empName.toLowerCase());
                    const empIdText = empProfile ? ` • ${empProfile.id}` : "";
                    return (
                      <button
                        key={empName}
                        onClick={() => {
                          setSearchTerm(empName);
                          setSelectedEmployee(empName);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-500/10 hover:text-blue-400 transition-colors flex flex-col cursor-pointer"
                      >
                        <span className="text-xs font-medium text-slate-200 hover:text-inherit">{empName}</span>
                        <span className="text-[9px] text-slate-505 mt-0.5 uppercase tracking-wider font-mono">{roleLabel}{empIdText}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI STATUS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CompactStatWidget
            label="Employees Online"
            value={String(teamAggregates.activeCount)}
            sub="Staff currently active"
            colorClass={teamAggregates.activeCount > 0 ? "text-emerald-400" : "text-slate-400"}
          />
          <CompactStatWidget
            label="Active Sessions"
            value={String(filteredEmployeesStats.length)}
            sub={selectedEmployee === "All" ? "Total employees" : "Filtered match"}
            colorClass="text-blue-400"
          />
          <CompactStatWidget
            label="Total Tracked Time"
            value={`${teamAggregates.totalHoursTracked}h`}
            sub={`Aggregated active time ${timeFilterLabel}`}
            colorClass="text-indigo-400"
          />
          <CompactStatWidget
            label="Average Productivity Score"
            value={averageProductivityRating > 0 ? `+${averageProductivityRating}` : String(averageProductivityRating)}
            sub={`Average rating ${timeFilterLabel}`}
            colorClass={averageProductivityRating > 2 ? "text-emerald-400" : averageProductivityRating >= -2 ? "text-blue-400" : "text-rose-400"}
          />
        </div>

        {/* BREAK TELEMETRY KPI BAR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CompactStatWidget
            label="Employees On Break"
            value={String(employeesOnBreakCount)}
            sub="Current break count"
            colorClass="text-amber-400 animate-pulse"
            onClick={() => setShowOnlyBreaks(!showOnlyBreaks)}
          />
          <CompactStatWidget
            label="Over Break Users"
            value={String(overBreakUsersCount)}
            sub="Exceeded allowance limit"
            colorClass={overBreakUsersCount > 0 ? "text-rose-400 font-bold" : "text-slate-400"}
            onClick={() => setShowOnlyBreaks(!showOnlyBreaks)}
          />
          <CompactStatWidget
            label="Avg Break Duration"
            value={formatDuration(avgBreakDuration)}
            sub="Average session length"
            colorClass="text-amber-400"
          />
        </div>

        {/* 1. EMPLOYEE MONITORING SECTION (TOP VISIBILITY) */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Workforce Activity Directory</h2>
            </div>
            <span className="text-[9px] font-mono text-slate-400 bg-[#111827] px-2 py-0.5 border border-slate-800 rounded">
              Real-time Console
            </span>
          </div>

          {filteredEmployeesStats.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No employees tracked under active selection.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
                <thead className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Employee</th>
                    <th className="px-4 py-2 font-semibold">Active Application</th>
                    <th className="px-4 py-2 font-semibold">Window Title / Resource</th>
                    <th className="px-4 py-2 font-semibold">Last Active</th>
                    <th className="px-4 py-2 font-semibold font-mono text-right">Active Time</th>
                    <th className="px-4 py-2 font-semibold font-mono text-right">Break Used</th>
                    <th className="px-4 py-2 font-semibold font-mono text-right">Break Remaining</th>
                    <th className="px-4 py-2 font-semibold font-mono text-right">Over Break</th>
                    <th className="px-4 py-2 font-semibold text-right">Productivity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEmployeesStats.map((emp) => {
                    const statusColors = {
                      online: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500", text: "Working" },
                      dnd: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/20", dot: "bg-rose-500 animate-pulse", text: "DND" },
                      idle: { bg: "bg-slate-700/10 text-slate-400 border-slate-700/20", dot: "bg-slate-500", text: "Idle" },
                      offline: { bg: "bg-slate-800 text-slate-500 border-slate-700/50", dot: "bg-slate-600", text: "Offline" },
                      disabled: { bg: "bg-slate-800 text-slate-500 border-slate-700/50", dot: "bg-slate-600", text: "Offline" },
                      on_break: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-500 animate-pulse", text: "On Break" },
                      exceeded_break: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/20", dot: "bg-rose-500 animate-pulse", text: "Exceeded Break" }
                    };
                    const status = (emp.currentStatus || "offline").toLowerCase() as keyof typeof statusColors;
                    const cfg = statusColors[status] || statusColors.offline;

                    const activeLogs = emp.logs.filter(l => !l.app_name?.startsWith("STATUS_CHANGE"));
                    const latestLog = activeLogs[0];
                    
                    let currentApp = latestLog ? latestLog.ai.category === "Break" ? "On Break" : latestLog.ai.cleanName : "—";
                    let categoryLabel = latestLog ? latestLog.ai.category : "";
                    
                    let currentWindow = "—";
                    if (latestLog) {
                      const parts = (latestLog.app_name || "").split(" | ");
                      currentWindow = parts.slice(1).join(" | ") || latestLog.website || "—";
                    }

                    if (status === "offline" || status === "disabled") {
                      currentApp = "Offline";
                      currentWindow = "Offline";
                      categoryLabel = "Offline";
                    } else if (status === "idle") {
                      currentApp = "Idle";
                      currentWindow = "Idle";
                      categoryLabel = "Idle";
                    }
                    
                    const lastActiveTime = latestLog ? formatTimeCompact(latestLog.start_time) : "—";

                    return (
                      <tr 
                        key={emp.username} 
                        className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${selectedEmployee === emp.username ? "bg-blue-500/5" : ""}`}
                        onClick={() => {
                          setSelectedEmployee(emp.username);
                          setSearchTerm(emp.username);
                        }}
                      >
                        <td className="px-4 py-1.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${cfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.text}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{emp.username}</span>
                            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{emp.roleName.replace(/_/g, " ")}</span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5 font-medium text-slate-300 max-w-[140px] truncate">
                          <div className="flex flex-col">
                            <span className="truncate">{currentApp}</span>
                            {categoryLabel && (
                              <span className={`text-[9px] font-semibold tracking-wider uppercase ${
                                categoryLabel === "Productive" ? "text-emerald-400" :
                                categoryLabel === "Unproductive" ? "text-rose-400" :
                                categoryLabel === "Idle" ? "text-amber-400" : 
                                categoryLabel === "Offline" ? "text-slate-500" :
                                categoryLabel === "Break" ? "text-amber-400 font-bold" : "text-blue-400"
                              }`}>
                                {categoryLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5 text-slate-400 max-w-[320px] truncate" title={currentWindow}>{currentWindow}</td>
                        <td className="px-4 py-1.5 text-slate-500 font-mono">{lastActiveTime}</td>
                        <td className="px-4 py-1.5 text-right font-mono font-semibold text-slate-300">{formatDuration(emp.totalDuration)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-305">{formatDuration(emp.breakDurationToday)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-305">{formatDuration(emp.remainingBreakSeconds)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-305">
                          {emp.overBreakSeconds > 0 ? (
                            <span className="text-rose-400 font-bold">+{formatDuration(emp.overBreakSeconds)}</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        <td className="px-4 py-1.5 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold font-mono text-slate-200">
                              {formatDuration(emp.productiveDuration)}
                            </span>
                            <span className={`text-[10px] font-semibold font-mono ${emp.productivityRate >= 70 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {emp.productivityRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 4. DIAGNOSTICS & TEAM CHARTS (SECONDARY GRID AT BOTTOM) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Work Distribution Stacked Segment Bar */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Work Distribution</h2>
              </div>
            </div>
            
            <div className="p-3.5">
              <div className="grid grid-cols-3 gap-1.5 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-4">
                <div className="text-center">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Total Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalDailyTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Active Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalNonIdleTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Idle Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalIdleTime)}</span>
                </div>
              </div>

              {distributionStats.total === 0 ? (
                <div className="text-slate-500 text-center py-10 text-[11px] font-mono">
                  No data logs available.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Segmented Horizontal Bar */}
                  <div className="w-full h-5 flex rounded overflow-hidden bg-slate-800 border border-slate-700">
                    {distributionStats.productive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.productive.pct}%` }} 
                        className="bg-[#10B981] h-full" 
                        title={`Productive: ${formatDuration(distributionStats.productive.duration)} (${distributionStats.productive.pct}%)`} 
                      />
                    )}
                    {distributionStats.neutral.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.neutral.pct}%` }} 
                        className="bg-[#3B82F6] h-full" 
                        title={`Neutral: ${formatDuration(distributionStats.neutral.duration)} (${distributionStats.neutral.pct}%)`} 
                      />
                    )}
                    {distributionStats.unproductive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.unproductive.pct}%` }} 
                        className="bg-[#EF4444] h-full" 
                        title={`Unproductive: ${formatDuration(distributionStats.unproductive.duration)} (${distributionStats.unproductive.pct}%)`} 
                      />
                    )}
                    {distributionStats.breakTime?.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.breakTime.pct}%` }} 
                        className="bg-[#F59E0B] h-full" 
                        title={`Break: ${formatDuration(distributionStats.breakTime.duration)} (${distributionStats.breakTime.pct}%)`} 
                      />
                    )}
                    {distributionStats.idle.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.idle.pct}%` }} 
                        className="bg-[#6B7280] h-full" 
                        title={`Idle: ${formatDuration(distributionStats.idle.duration)} (${distributionStats.idle.pct}%)`} 
                      />
                    )}
                  </div>

                  {/* Summary Metrics */}
                  <div className="space-y-1.5 text-[11.5px] font-mono">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#10B981]" />
                        <span className="text-slate-400">Productive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.productive.duration)} ({distributionStats.productive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#3B82F6]" />
                        <span className="text-slate-400">Neutral Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.neutral.duration)} ({distributionStats.neutral.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#EF4444]" />
                        <span className="text-slate-400">Unproductive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.unproductive.duration)} ({distributionStats.unproductive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#F59E0B]" />
                        <span className="text-slate-400">Break Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.breakTime.duration)} ({distributionStats.breakTime.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#6B7280]" />
                        <span className="text-slate-400">Idle Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.idle.duration)} ({distributionStats.idle.pct}%)
                      </span>
                    </div>


                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Focus & Activity Timeline (AreaChart) */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1 lg:col-span-2">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Focus & Activity Timeline</h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {isEditingWorkingHours ? (
                  <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 border border-slate-800 rounded">
                    <select
                      value={workingHoursStart}
                      onChange={(e) => setWorkingHoursStart(e.target.value)}
                      className="bg-[#121826] border border-slate-800 rounded px-1 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer h-5 font-sans"
                    >
                      {HOURS_LIST.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="text-slate-500 text-[10px]">to</span>
                    <select
                      value={workingHoursEnd}
                      onChange={(e) => setWorkingHoursEnd(e.target.value)}
                      className="bg-[#121826] border border-slate-800 rounded px-1 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer h-5 font-sans"
                    >
                      {HOURS_LIST.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        localStorage.setItem("workingHoursStart", workingHoursStart);
                        localStorage.setItem("workingHoursEnd", workingHoursEnd);
                        setIsEditingWorkingHours(false);
                      }}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-semibold transition-all cursor-pointer h-5 flex items-center justify-center"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setWorkingHoursStart(localStorage.getItem("workingHoursStart") || "10 AM");
                        setWorkingHoursEnd(localStorage.getItem("workingHoursEnd") || "6 PM");
                        setIsEditingWorkingHours(false);
                      }}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold transition-all cursor-pointer h-5 flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                    <span>Working Hours: <span className="text-slate-200 font-semibold">{workingHoursStart} - {workingHoursEnd}</span></span>
                    <button
                      onClick={() => setIsEditingWorkingHours(true)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-all cursor-pointer flex items-center justify-center"
                      title="Edit working hours"
                    >
                      <Sliders className="w-3 h-3 text-blue-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3">
              {/* Summary Stats above the Graph */}
              <div className="grid grid-cols-3 gap-2 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-3 text-center text-[10px] font-mono">
                <div>
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Avg Focus Score</span>
                  <span className="text-xs font-bold text-blue-400 block mt-0.5">{timelineSummaryStats.avgFocus}%</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Peak Focus Hour</span>
                  <span className="text-xs font-bold text-emerald-400 block mt-0.5">{timelineSummaryStats.peakFocusTime}</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Total Active</span>
                  <span className="text-xs font-bold text-slate-300 block mt-0.5">{formatDuration(totalNonIdleTime)}</span>
                </div>
              </div>

              <div className="min-h-[196px] -ml-4 relative">
                <ResponsiveContainer width="100%" height={196}>
                  <AreaChart data={hourlyFocusTrend}>
                    <defs>
                      <linearGradient id="focusColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    
                    {/* Hover Tooltip */}
                    <ReTooltip content={<TimelineTooltip />} />
                    
                    {/* Dynamic Break intervals overlay */}
                    {selectedEmployee !== "All" && breakLogs
                      .filter(b => b.employee_name === selectedEmployee)
                      .map((b, idx) => {
                        const x1 = getHourLabel(b.start_time);
                        const x2 = b.end_time ? getHourLabel(b.end_time) : getHourLabel(new Date());
                        const finalX2 = x1 === x2 ? getNextHourLabel(b.end_time || new Date()) : x2;
                        const timingStr = `Break: ${formatTimeOnly(b.start_time)} - ${b.end_time ? formatTimeOnly(b.end_time) : "Active"}`;
                        return (
                          <ReferenceArea
                            key={`break-ref-${idx}`}
                            x1={x1}
                            x2={finalX2}
                            fill="rgba(245, 158, 11, 0.18)"
                            label={{ value: 'BREAK', position: 'insideTop', fill: '#F59E0B', fontSize: 8, fontWeight: 'bold', opacity: 0.6 }}
                          >
                            <title>{timingStr}</title>
                          </ReferenceArea>
                        );
                      })
                    }

                    {/* Shaded background for work hours */}
                    <ReferenceArea 
                      x1={workingHoursStart} 
                      x2={workingHoursEnd} 
                      fill="rgba(59, 130, 246, 0.08)" 
                      label={{ value: 'WORKING HOURS', position: 'insideTop', fill: '#3B82F6', fontSize: 8, fontWeight: 'bold', opacity: 0.4, letterSpacing: '0.05em' }} 
                    />
                    <ReferenceLine x={workingHoursStart} stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />
                    <ReferenceLine x={workingHoursEnd} stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />

                    {/* Area lines */}
                    <Area
                      type="monotone"
                      dataKey="Focus Score"
                      stroke="#3B82F6"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#focusColor)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>

        {/* 3. DAILY AI WORK SUMMARY (HIDDEN WHEN NO INDIVIDUAL EMPLOYEE IS SELECTED) */}
        {selectedEmployee !== "All" && (
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Daily AI Work Summary</h2>
              </div>
              <div className="flex items-center gap-2">
                {aiSummary && (
                  <button
                    onClick={handleGenerateAISummary}
                    disabled={isSummaryLoading}
                    className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
                    title="Re-generate summary"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSummaryLoading ? "animate-spin text-blue-400" : ""}`} />
                  </button>
                )}
                <span className="text-[9px] font-mono text-slate-400 bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded">
                  {employeeRolesMap[selectedEmployee] || "Knowledge Worker"}
                </span>
              </div>
            </div>

            <div className="p-4">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No activity logs recorded for this employee in the selected period.
                </div>
              ) : isSummaryLoading ? (
                <div className="flex flex-col items-center justify-center text-slate-500 py-10">
                  <div className="w-5 h-5 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                  <p className="text-[11px] font-mono tracking-wide">Compiling summary insights...</p>
                </div>
              ) : summaryError ? (
                <div className="text-center text-rose-400 py-6 text-xs">
                  <p className="font-semibold mb-1">Failed to generate summary</p>
                  <p className="text-[10px] text-slate-500 mb-2">{summaryError}</p>
                  <button
                    onClick={handleGenerateAISummary}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-medium transition-all cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </div>
              ) : aiSummary ? (
                <MarkdownRenderer content={aiSummary} />
              ) : (
                <div className="text-center py-6">
                  <p className="text-[11px] text-slate-400 mb-3 font-medium">AI summary report is available for today's {filteredActivities.length} sessions.</p>
                  <button
                    onClick={handleGenerateAISummary}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 mx-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-205" /> Compile Summary Insights
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. LIVE RAW ACTIVITY STREAM (PRIMARY FEATURE) */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-[#111827]/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live Raw Activity Stream</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
                title="Refresh activity logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
              </button>
              <span className="text-[10px] text-slate-500 font-mono">Showing {Math.min(visibleLogsCount, filteredActivities.length)} of {filteredActivities.length} entries</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                <tr>
                  <th className="w-10 px-4 py-2" />
                  <th className="px-4 py-2 font-semibold">Employee</th>
                  <th className="px-4 py-2 font-semibold">Designation</th>
                  <th className="px-4 py-2 font-semibold">Process / App</th>
                  <th className="px-4 py-2 font-semibold">Classification</th>
                  <th className="px-4 py-2 font-semibold">Start</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                  <th className="px-4 py-2 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredActivities.slice(0, visibleLogsCount).map((item, index) => {
                  const rawRole = employeeRolesMap[item.employee_name] || "knowledge_worker";
                  const roleName = rawRole.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const ai = item.ai;
                  const isStatusEntry = (item.app_name || "").startsWith("STATUS_CHANGE");
                  const isBrowserEntry = !isStatusEntry && ((item.app_name || "").toLowerCase().includes("chrome") ||
                    (item.app_name || "").toLowerCase().includes("browser") ||
                    (item.website || "").includes("."));
                  const isExpanded = expandedRowId === (item.id || index);

                  const parts = (item.app_name || "").split(" | ");
                  const processName = parts[0] || "Unknown";
                  const windowTitle = parts.slice(1).join(" | ") || "—";

                  return (
                    <Fragment key={item.id || index}>
                      <tr
                        className={`hover:bg-slate-800/20 transition-colors cursor-pointer ${isExpanded ? "bg-slate-800/10" : ""}`}
                        onClick={() => setExpandedRowId(isExpanded ? null : (item.id || index))}
                      >
                        <td className="px-4 py-1.5 text-center">
                          <ChevronDown className={`w-3.5 h-3.5 mx-auto text-slate-500 transition-all duration-300 ${isExpanded ? "rotate-180 text-blue-500" : ""}`} />
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center font-semibold text-[10px] border border-blue-500/20">
                              {item.employee_name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <span className="font-semibold text-slate-200">{item.employee_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <span className="text-[9px] font-mono text-slate-305 uppercase bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded">
                            {roleName}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 max-w-[180px] truncate">
                              {ai.cleanName}
                            </span>
                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded border tracking-wider uppercase ${isStatusEntry ? "bg-purple-500/10 text-purple-400 border-purple-500/10" :
                                isBrowserEntry ? "bg-blue-500/10 text-blue-400 border-blue-500/10" :
                                  "bg-amber-500/10 text-amber-400 border-amber-500/10"
                              }`}>
                              {isStatusEntry ? "System" : isBrowserEntry ? "Domain" : "App"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <span
                            className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold border uppercase tracking-wide"
                            style={{
                              backgroundColor: `${getCategoryColor(ai.category)}15`,
                              color: getCategoryColor(ai.category),
                              borderColor: `${getCategoryColor(ai.category)}10`,
                            }}
                          >
                            {ai.category}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-slate-400 font-mono text-[11px]">{formatTime(item.start_time)}</td>
                        <td className="px-4 py-1.5 text-slate-400 font-mono text-[11px]">{formatDuration(item.duration_seconds)}</td>
                        <td className="px-4 py-1.5 text-right">
                          <span className={`font-semibold font-mono text-xs ${ai.score > 0 ? "text-emerald-400" : ai.score < 0 ? "text-rose-400" : "text-slate-400"}`}>
                            {ai.score > 0 ? "+" : ""}{ai.score}
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#111827]/40">
                          <td colSpan={8} className="px-6 py-3 border-b border-slate-800">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-in fade-in duration-150">
                              {isBrowserEntry ? (
                                <>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Browser</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {getBrowserName(processName)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Website Name</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {ai.cleanName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Website Domain / URL</p>
                                    <p className="text-xs font-mono text-blue-400 bg-[#070b13] border border-slate-800 p-2 rounded break-all font-semibold">
                                      {item.website || "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Activity Log ID</p>
                                    <p className="text-xs text-slate-400 font-mono bg-[#070b13] border border-slate-800 p-2 rounded">
                                      #{item.id || index}
                                    </p>
                                  </div>
                                  <div className="md:col-span-4 mt-1">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Tab Title</p>
                                    <p className="text-xs font-medium text-slate-300 leading-normal bg-[#070b13] border border-slate-800 p-2 rounded break-all font-mono">
                                      {windowTitle}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Application</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {ai.cleanName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Process Executable</p>
                                    <p className="text-xs font-mono text-slate-300 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {processName}
                                    </p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Activity Log ID</p>
                                    <p className="text-xs text-slate-400 font-mono bg-[#070b13] border border-slate-800 p-2 rounded">
                                      #{item.id || index}
                                    </p>
                                  </div>
                                  <div className="md:col-span-4 mt-1">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Window Title</p>
                                    <p className="text-xs font-medium text-slate-300 leading-normal bg-[#070b13] border border-slate-800 p-2 rounded break-all font-mono">
                                      {windowTitle}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredActivities.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                      Waiting for live activity logs...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredActivities.length > visibleLogsCount && (
            <div className="flex justify-center py-2 border-t border-slate-800 bg-[#111827]/40">
              <button
                onClick={() => setVisibleLogsCount(prev => Math.min(prev + 10, filteredActivities.length))}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                Load More Activity Logs
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
