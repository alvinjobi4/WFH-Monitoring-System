"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Tooltip as ReTooltip
} from 'recharts';
import {
  Clock, Target, Laptop, CalendarDays,
  RefreshCw
} from 'lucide-react';
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES, getNormalizedRoleName, DomainRuleInfo } from "../../lib/classifier";
import Dropdown from "../components/Dropdown";
import { fetchGeminiClassification, getGeminiCacheKey, GeminiClassificationResult } from "../../lib/geminiClassifier";

// ==========================================
// HELPERS & CUSTOM COMPONENTS
// ==========================================
const CATEGORY_COLORS: Record<string, string> = PRODUCTIVITY_COLORS;

const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

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

// CompactStatWidget renders the metrics cards at the top of the dashboard.
function CompactStatWidget({ label, value, sub, colorClass }: {
  label: string; value: string; sub?: string; colorClass?: string;
}) {
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center min-w-0 shadow-sm hover:bg-[#121826]/80 transition-colors">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xl font-bold font-mono tracking-tight mt-0.5 ${colorClass || "text-slate-100"}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-500 font-medium mt-0.5 leading-snug">{sub}</span>}
    </div>
  );
}





const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 shadow-lg text-xs font-mono">
      <p className="text-slate-200 font-bold border-b border-slate-800 pb-1 mb-1.5 uppercase text-[10px]">{data.time}</p>
      <div className="space-y-1">
        {data["Break Timing"] && (
          <div className="flex justify-between gap-4 text-amber-400 font-bold border-b border-slate-800/60 pb-1 mb-1">
            <span>On Break:</span>
            <span>{data["Break Timing"]}</span>
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
        <div className="border-t border-slate-800 pt-1 mt-1 text-[9px] text-slate-505">
          <span className="block font-semibold uppercase text-[8px] text-slate-400 mb-0.5">Active Apps:</span>
          <span className="block text-slate-300 break-words max-w-[200px] leading-normal">{data["Active Apps"]}</span>
        </div>
      </div>
    </div>
  );
};



// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("Knowledge Worker");
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "yesterday" | "weekly" | "monthly" | "all" | "custom">("daily");
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [userStatus, setUserStatus] = useState<string>("online");
  const [geminiClassifications, setGeminiClassifications] = useState<Record<string, GeminiClassificationResult>>({});
  const [domainRules, setDomainRules] = useState<Record<string, DomainRuleInfo>>({});

  // Stream UI states
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Break Management States
  const [breakLogs, setBreakLogs] = useState<any[]>([]);
  const [breakPolicy, setBreakPolicy] = useState<any>({
    daily_break_allowance: 60,
    policy_type: "flexible",
    enable_over_break_tracking: true,
    productivity_penalty: 0
  });
  const [activeBreak, setActiveBreak] = useState<any | null>(null);
  const [currentBreakElapsed, setCurrentBreakElapsed] = useState(0);

  // Fetch domain rules on mount
  useEffect(() => {
    async function loadDomainRules() {
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
        console.error("Failed to fetch domain rules:", err);
      }
    }
    loadDomainRules();
  }, []);

  const fetchBreakData = async (name: string) => {
    try {
      const { data: policyData } = await supabase
        .from("break_policy")
        .select("*")
        .eq("id", "global")
        .single();
      if (policyData) {
        setBreakPolicy(policyData);
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: logsData } = await supabase
        .from("break_logs")
        .select("*")
        .eq("employee_name", name)
        .gte("start_time", startOfToday.toISOString());
      
      if (logsData) {
        setBreakLogs(logsData);
        const active = logsData.find((l: any) => !l.end_time);
        setActiveBreak(active || null);
        if (active) {
          setUserStatus("on_break");
          localStorage.setItem("userStatus", "on_break");
        } else {
          const currentLocal = localStorage.getItem("userStatus") || "online";
          if (currentLocal === "on_break") {
            setUserStatus("online");
            localStorage.setItem("userStatus", "online");
          } else {
            setUserStatus(currentLocal);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching break data:", err);
    }
  };

  // Ticking active break timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeBreak) {
      const start = new Date(activeBreak.start_time).getTime();
      const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setCurrentBreakElapsed(elapsed >= 0 ? elapsed : 0);
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setCurrentBreakElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeBreak]);

  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "custom", label: "Custom Date" },
    { value: "all", label: "All Time" }
  ], []);

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "employee" || !name) {
      router.push("/");
    } else {
      setEmployeeName(name);
      fetchEmployeeRole(name);
      fetchBreakData(name);
    }
  }, [router]);

  useEffect(() => {
    if (employeeName) {
      fetchActivityLogs(employeeName, timeFilter, customDate);
    }
  }, [employeeName, timeFilter, customDate]);

  // Real-Time Postgres listener (zero-polling)
  useEffect(() => {
    if (isLoading || !employeeName) return;

    const channel = supabase
      .channel("activity-channel-employee")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs", filter: `employee_name=eq.${employeeName}` }, (payload) => {
        fetchActivityLogs(employeeName, timeFilter, customDate);
      })
      .subscribe();

    const breakChannel = supabase
      .channel("break-logs-employee")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs", filter: `employee_name=eq.${employeeName}` }, (payload) => {
        fetchBreakData(employeeName);
      })
      .subscribe();

    const policyChannel = supabase
      .channel("break-policy-employee")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_policy" }, (payload) => {
        if (employeeName) fetchBreakData(employeeName);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(breakChannel);
      supabase.removeChannel(policyChannel);
    };
  }, [isLoading, employeeName, timeFilter, customDate]);

  // Load and fetch Gemini classifications for all unique activities
  useEffect(() => {
    if (!logs.length) return;

    const newClassifications: Record<string, GeminiClassificationResult> = { ...geminiClassifications };
    let stateChanged = false;
    const pendingFetches: Array<{ appName: string; website: string; key: string }> = [];

    logs.forEach(log => {
      if (log.app_name === "IDLE" || log.app_name === "Unknown" || log.app_name?.startsWith("STATUS_CHANGE")) return;

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
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
        pendingFetches.push({ appName: log.app_name, website: log.website, key: cacheKey });
      }
    });

    if (stateChanged) {
      setGeminiClassifications(newClassifications);
    }

    if (pendingFetches.length > 0) {
      const fetchAll = async () => {
        for (const item of pendingFetches) {
          const result = await fetchGeminiClassification(item.appName, item.website, roleName);
          if (result) {
            localStorage.setItem(item.key, JSON.stringify(result));
            setGeminiClassifications(prev => ({ ...prev, [item.key]: result }));
          }
        }
      };
      fetchAll();
    }
  }, [logs, roleName]);





  const fetchEmployeeRole = async (name: string) => {
    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("department")
        .eq("name", name)
        .single();
      if (empData && empData.department) {
        setRoleName(getNormalizedRoleName(empData.department));
      } else {
        setRoleName("Knowledge Worker");
      }
    } catch {
      setRoleName("Knowledge Worker");
    }
  };

  async function fetchActivityLogs(name: string, filter: string, targetDateStr?: string) {
    setIsLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_name", name);

    if (filter === "custom" && targetDateStr) {
      const [year, month, day] = targetDateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
    } else if (filter === "yesterday") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);

      query = query
        .gte("start_time", startOfYesterday.toISOString())
        .lt("start_time", startOfToday.toISOString());
    } else if (filter === "weekly") {
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
    } else if (filter === "monthly") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfMonth.toISOString())
        .lte("start_time", endOfMonth.toISOString());
    } else if (filter === "daily") {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data, error } = await query
      .order("start_time", { ascending: false })
      .limit(5000);

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  }

  const handleRefresh = async () => {
    if (!employeeName) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchActivityLogs(employeeName, timeFilter, customDate),
        fetchBreakData(employeeName)
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };



  // Sort and classify logs chronologically exactly once
  const classifiedLogs = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    return sorted.map((log, index) => {
      const contextHistory = sorted.slice(Math.max(0, index - 4), index).map(l => ({
        app_name: l.app_name,
        website: l.website,
        timestamp: l.start_time
      }));

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
      const geminiCls = geminiClassifications[cacheKey] || null;

      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        contextHistory,
        geminiCls,
        domainRules,
        log.start_time,
        breakLogs
      );

      return {
        ...log,
        ai
      };
    });
  }, [logs, roleName, geminiClassifications, domainRules, breakLogs]);

  const totalDuration = useMemo(() => {
    return classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE") && l.ai.category !== "Break" && l.ai.category !== "Idle")
      .reduce((sum, log) => sum + (log.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const productivityRate = useMemo(() => {
    let productive = 0;
    let total = 0;
    classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE"))
      .forEach(log => {
        const duration = log.duration_seconds || 0;
        const cat = log.ai.category;
        if (cat === "Productive") {
          productive += duration;
        }
        total += duration;
      });
    
    let rate = total > 0 ? Math.round((productive / total) * 100) : 0;

    // Apply productivity penalty for over-break
    const allowanceSeconds = (breakPolicy?.daily_break_allowance || 60) * 60;
    let totalBreakSec = 0;
    breakLogs.forEach((b: any) => {
      if (b.end_time) {
        totalBreakSec += b.duration_seconds || 0;
      } else {
        totalBreakSec += currentBreakElapsed;
      }
    });
    const overBreakSeconds = Math.max(0, totalBreakSec - allowanceSeconds);
    if (breakPolicy?.enable_over_break_tracking && overBreakSeconds > 0 && breakPolicy?.productivity_penalty > 0) {
      rate = Math.max(0, rate - breakPolicy.productivity_penalty);
    }

    return rate;
  }, [classifiedLogs, breakPolicy, breakLogs, currentBreakElapsed]);

  const productivityData = useMemo(() => {
    let productive = 0;
    let unproductive = 0;
    let idle = 0;
    let neutral = 0;
    let breakTime = 0;

    classifiedLogs.forEach(log => {
      const duration = log.duration_seconds || 0;
      const cat = log.ai.category;

      if (cat === "Idle") {
        idle += duration;
      } else if (cat === "Productive") {
        productive += duration;
      } else if (cat === "Unproductive") {
        unproductive += duration;
      } else if (cat === "Break") {
        breakTime += duration;
      } else {
        neutral += duration;
      }
    });

    const total = productive + unproductive + idle + neutral + breakTime;
    if (total === 0) return [];

    return [
      { name: 'Productive', value: Math.round((productive / total) * 100), raw: productive },
      { name: 'Unproductive', value: Math.round((unproductive / total) * 100), raw: unproductive },
      { name: 'Neutral', value: Math.round((neutral / total) * 100), raw: neutral },
      { name: 'Idle', value: Math.round((idle / total) * 100), raw: idle },
      { name: 'Break', value: Math.round((breakTime / total) * 100), raw: breakTime },
    ].filter(d => d.value > 0);
  }, [classifiedLogs]);



  // Hourly focus and trend data formatted for Recharts
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

    classifiedLogs.forEach(a => {
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
      const period = hour >= 12 ? "PM" : "AM";
      const formatHour = hour % 12 === 0 ? 12 : hour % 12;
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

      const endHour = (hour + 1) % 24;
      const endPeriod = endHour >= 12 ? "PM" : "AM";
      const formatEnd = endHour % 12 === 0 ? 12 : endHour % 12;
      const slotLabel = `${timeLabel} - ${formatEnd} ${endPeriod}`;

      // Check if this hour overlaps with any break logs today
      const activeBreaksInHour = breakLogs.filter(b => {
        if (classifiedLogs.length > 0) {
          const logDate = new Date(classifiedLogs[0].start_time).toDateString();
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
        .map(b => `${formatTimeOnly(b.start_time)} - ${b.end_time ? formatTimeOnly(b.end_time) : "Active"}`)
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
  }, [classifiedLogs, breakLogs]);

  const totalIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category === "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalDailyTime = useMemo(() => {
    return classifiedLogs.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalNonIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category !== "Idle" && a.ai.category !== "Break")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalBreakTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category === "Break")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const longestIdlePeriod = useMemo(() => {
    const idleLogs = classifiedLogs.filter(a => a.ai.category === "Idle");
    if (idleLogs.length === 0) return 0;
    return Math.max(...idleLogs.map(l => l.duration_seconds || 0));
  }, [classifiedLogs]);

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

    classifiedLogs.forEach(a => {
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
  }, [classifiedLogs]);

  const totalBreakUsedToday = useMemo(() => {
    let totalSec = 0;
    breakLogs.forEach((b: any) => {
      if (b.end_time) {
        totalSec += b.duration_seconds || 0;
      } else {
        totalSec += currentBreakElapsed;
      }
    });
    return totalSec;
  }, [breakLogs, currentBreakElapsed]);

  const remainingBreakTime = useMemo(() => {
    const totalAllowanceSeconds = (breakPolicy?.daily_break_allowance || 60) * 60;
    return Math.max(0, totalAllowanceSeconds - totalBreakUsedToday);
  }, [breakPolicy, totalBreakUsedToday]);

  const activeBreakStartTime = useMemo(() => {
    if (!activeBreak) return null;
    try {
      return new Date(activeBreak.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [activeBreak]);

  const breakStatusState = useMemo(() => {
    const isCurrentlyOnBreak = !!activeBreak;
    const usedMinutes = totalBreakUsedToday / 60;
    const allowanceMinutes = breakPolicy?.daily_break_allowance || 60;

    if (isCurrentlyOnBreak) {
      if (usedMinutes > allowanceMinutes) {
        return "Over Break Limit";
      }
      return "On Break";
    } else {
      if (usedMinutes >= allowanceMinutes) {
        return "Break Limit Reached";
      }
      return "Available";
    }
  }, [activeBreak, totalBreakUsedToday, breakPolicy]);

  const handleStartBreak = async () => {
    if (!employeeName) return;
    if (activeBreak) return;

    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("id, department")
        .eq("name", employeeName)
        .single();
      
      const empId = empData?.id || "unknown";
      const empDept = empData?.department || "Unknown";

      const { data: newBreak, error: breakErr } = await supabase
        .from("break_logs")
        .insert({
          employee_id: empId,
          employee_name: employeeName,
          start_time: new Date().toISOString()
        })
        .select()
        .single();

      if (breakErr) throw breakErr;

      await supabase.from("activity_logs").insert({
        employee_id: empId,
        employee_name: employeeName,
        device_id: "web-dashboard",
        department: empDept,
        app_name: "STATUS_CHANGE | on_break",
        website: "status",
        category: "Neutral",
        productivity_score: 0,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 0
      });

      setUserStatus("on_break");
      localStorage.setItem("userStatus", "on_break");
      fetchBreakData(employeeName);
    } catch (err: any) {
      console.error("Error starting break:", err);
      alert(`Error starting break: ${err?.message || err}. Please ensure you have run the Break Management SQL migration script in your Supabase SQL Editor to create the break_policy and break_logs tables.`);
    }
  };

  const handleEndBreak = async () => {
    if (!employeeName || !activeBreak) return;

    try {
      const now = new Date();
      const start = new Date(activeBreak.start_time);
      const durationSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));

      const { error: breakErr } = await supabase
        .from("break_logs")
        .update({
          end_time: now.toISOString(),
          duration_seconds: durationSeconds
        })
        .eq("id", activeBreak.id);

      if (breakErr) throw breakErr;

      const { data: empData } = await supabase
        .from("employees")
        .select("department")
        .eq("name", employeeName)
        .single();
      
      const empDept = empData?.department || "Unknown";

      await supabase.from("activity_logs").insert({
        employee_id: activeBreak.employee_id,
        employee_name: employeeName,
        device_id: "web-dashboard",
        department: empDept,
        app_name: "STATUS_CHANGE | online",
        website: "status",
        category: "Neutral",
        productivity_score: 0,
        start_time: now.toISOString(),
        end_time: now.toISOString(),
        duration_seconds: 0
      });

      setUserStatus("online");
      localStorage.setItem("userStatus", "online");
      fetchBreakData(employeeName);
    } catch (err: any) {
      console.error("Error ending break:", err);
      alert(`Error ending break: ${err?.message || err}. Please ensure the break_logs and activity_logs tables exist and are accessible.`);
    }
  };

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3 relative z-30">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-blue-500" /> Employee Dashboard <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* BREAK POLICY DISPLAY */}
            <div className="bg-[#121826] border border-slate-800 px-3 py-1 rounded flex flex-col justify-center text-left h-[32px] shrink-0 font-mono text-[9px] min-w-[120px] select-none">
              <span className="text-slate-500 font-bold uppercase tracking-wider leading-none">Break Policy</span>
              <span className="text-slate-200 font-bold leading-none mt-0.5">{breakPolicy?.daily_break_allowance || 60} Min Daily ({breakPolicy?.policy_type === 'fixed' ? `Fixed: ${breakPolicy?.scheduled_slots || '1:00 PM - 2:00 PM'}` : 'Flexible'})</span>
            </div>

            {/* Time filters Dropdown */}
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

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center h-[32px]"
              title="Refresh logs & dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : "text-slate-400"}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer h-[32px]"
            >
              Logout
            </button>
          </div>
        </header>

        {/* KPI STATUS BAR */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <CompactStatWidget
            label="Active Time"
            value={formatDuration(totalDuration)}
            colorClass="text-blue-400"
          />
          <CompactStatWidget
            label="Productivity Rate"
            value={`${productivityRate}%`}
            colorClass={productivityRate >= 70 ? "text-emerald-400" : "text-slate-300"}
          />
          <CompactStatWidget
            label="Your Role"
            value={FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
            colorClass="text-indigo-400"
          />
          <CompactStatWidget
            label="Active Status"
            value={userStatus === "dnd" ? "DND" : userStatus === "on_break" ? "On Break" : userStatus}
            colorClass={userStatus === "online" ? "text-emerald-400" : userStatus === "dnd" ? "text-rose-400" : "text-amber-400"}
          />

          {/* BREAK STATUS CARD */}
          <div className="bg-[#121826] border border-slate-800 rounded p-2 flex flex-col justify-between min-w-0 shadow-sm hover:bg-[#121826]/80 transition-colors">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Break Status</span>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                  breakStatusState === "Available" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  breakStatusState === "On Break" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                  breakStatusState === "Break Limit Reached" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                  "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  <span className={`w-1 h-1 rounded-full ${
                    breakStatusState === "Available" ? "bg-emerald-500" :
                    breakStatusState === "On Break" ? "bg-amber-500 animate-pulse" :
                    breakStatusState === "Break Limit Reached" ? "bg-orange-500" :
                    "bg-rose-500"
                  }`} />
                  {breakStatusState === "Over Break Limit" ? "Over Break Limit" : breakStatusState === "Break Limit Reached" ? "Limit Reached" : breakStatusState}
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  Allow: {breakPolicy?.daily_break_allowance || 60}m
                </span>
              </div>

              <div className="mt-1.5 space-y-0.5 text-[9px] font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Used Today:</span>
                  <span className="text-slate-200 font-semibold">{formatDuration(totalBreakUsedToday)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining:</span>
                  <span className={`font-semibold ${remainingBreakTime === 0 ? "text-rose-400" : "text-slate-200"}`}>
                    {formatDuration(remainingBreakTime)}
                  </span>
                </div>
                {breakPolicy?.policy_type === "fixed" && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Schedule:</span>
                    <span className="text-amber-400 font-semibold">{breakPolicy?.scheduled_slots || '1:00 PM - 2:00 PM'}</span>
                  </div>
                )}
                {activeBreak && (
                  <>
                    <div className="flex justify-between border-t border-slate-800/60 pt-0.5 mt-0.5">
                      <span className="text-slate-400">Current Session:</span>
                      <span className="text-amber-400 font-bold animate-pulse">{formatDuration(currentBreakElapsed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Started At:</span>
                      <span className="text-slate-300 font-semibold">{activeBreakStartTime || "—"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-1.5 flex gap-1.5 pt-1 border-t border-slate-800/60">
              {!activeBreak ? (
                <button
                  onClick={handleStartBreak}
                  disabled={breakStatusState === "Break Limit Reached"}
                  className="w-full py-0.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:hover:bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[9px] font-bold transition-all cursor-pointer text-center animate-none"
                >
                  Start Break
                </button>
              ) : (
                <button
                  onClick={handleEndBreak}
                  className="w-full py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[9px] font-bold transition-all cursor-pointer text-center animate-none"
                >
                  End Break
                </button>
              )}
            </div>
          </div>
        </div>



        {/* MIDDLE CHARTS & TRENDS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Productivity Distribution stacked horizontal bar style */}
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
                <div className="text-slate-505 text-center py-10 text-[11px] font-mono">
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

          {/* Focus & Activity Timeline AreaChart */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1 lg:col-span-2">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Focus & Activity Timeline</h2>
              </div>
            </div>

            <div className="p-3">
              {/* Timeline Header Summary stats */}
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
                {classifiedLogs.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-mono">
                    No data logs recorded.
                  </div>
                ) : (
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
                      
                      <ReTooltip content={<TimelineTooltip />} />
                      
                       {/* Dynamic Break intervals overlay */}
                      {breakLogs.map((b, idx) => {
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
                      })}

                      <ReferenceArea 
                        x1="10 AM" 
                        x2="6 PM" 
                        fill="rgba(59, 130, 246, 0.08)" 
                        label={{ value: 'WORKING HOURS', position: 'insideTop', fill: '#3B82F6', fontSize: 8, fontWeight: 'bold', opacity: 0.4, letterSpacing: '0.05em' }} 
                      />
                      <ReferenceLine x="10 AM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />
                      <ReferenceLine x="6 PM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />

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
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
