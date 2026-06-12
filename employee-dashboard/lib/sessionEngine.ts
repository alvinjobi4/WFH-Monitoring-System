import { classifyActivityWithAI, normalizeActivity } from "./classifier";

export interface SessionMetrics {
  totalDurationSeconds: number;
  productiveDurationSeconds: number;
  unproductiveDurationSeconds: number;
  neutralDurationSeconds: number;
  idleDurationSeconds: number;
  breakDurationSeconds: number;
  appSwitches: number;
  distractionCount: number;
  focusScore: number;         // 0 to 100
  fragmentationIndex: number; // 0 to 100
  deepWorkHours: number;      // Total hours in deep work blocks
  deepWorkBlocksCount: number;
  mostProductiveWindow: string; // e.g. "09:00 AM - 11:00 AM"
  workflowPath: string[];      // Sequential representation of apps
}

/**
 * Computes high-fidelity session analytics from raw supabase activity logs
 */
export const calculateSessionMetrics = (
  logs: any[],
  roleName = "role_1"
): SessionMetrics => {
  if (!logs || logs.length === 0) {
    return {
      totalDurationSeconds: 0,
      productiveDurationSeconds: 0,
      unproductiveDurationSeconds: 0,
      neutralDurationSeconds: 0,
      idleDurationSeconds: 0,
      breakDurationSeconds: 0,
      appSwitches: 0,
      distractionCount: 0,
      focusScore: 100,
      fragmentationIndex: 0,
      deepWorkHours: 0,
      deepWorkBlocksCount: 0,
      mostProductiveWindow: "N/A",
      workflowPath: []
    };
  }

  // 1. Sort logs oldest to newest for chronological sequence evaluation
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  let totalSec = 0;
  let prodSec = 0;
  let unprodSec = 0;
  let neutSec = 0;
  let idleSec = 0;
  let breakSec = 0;
  let switches = 0;
  let distractions = 0;
  let lastApp = "";
  const workflowPath: string[] = [];

  // Deep work tracking variables
  let currentDeepBlockDuration = 0;
  let deepBlocksCount = 0;
  let totalDeepWorkSec = 0;

  // Hourly scores tracking
  const hourlyScores: Record<number, { sum: number; count: number }> = {};
  for (let i = 0; i < 24; i++) {
    hourlyScores[i] = { sum: 0, count: 0 };
  }

  sortedLogs.forEach((log, index) => {
    const duration = log.duration_seconds || 0;
    totalSec += duration;

    // Build context history for sequential classification modifiers
    const contextHistory = sortedLogs.slice(Math.max(0, index - 4), index).map(l => ({
      app_name: l.app_name,
      website: l.website,
      timestamp: l.start_time
    }));

    const classification = log.ai || classifyActivityWithAI(
      log.app_name,
      log.website,
      log.category || "Neutral",
      roleName,
      duration,
      contextHistory
    );

    // Track hourly metrics
    const logDate = new Date(log.start_time);
    const hour = logDate.getHours();
    hourlyScores[hour].sum += classification.score;
    hourlyScores[hour].count++;

    // App switches
    const cleanApp = classification.cleanName;
    if (cleanApp && cleanApp !== lastApp) {
      if (lastApp !== "") {
        switches++;
      }
      lastApp = cleanApp;
      if (workflowPath.length === 0 || workflowPath[workflowPath.length - 1] !== cleanApp) {
        workflowPath.push(cleanApp);
      }
    }

    // Accumulate category timers
    if (classification.category === "Productive") {
      prodSec += duration;
      currentDeepBlockDuration += duration;
    } else {
      // Break deep work block on distraction, break, or idle
      if (classification.category === "Unproductive" || classification.category === "Idle" || classification.category === "Break") {
        if (currentDeepBlockDuration >= 900) { // 15 mins
          deepBlocksCount++;
          totalDeepWorkSec += currentDeepBlockDuration;
        }
        currentDeepBlockDuration = 0;
      }

      if (classification.category === "Unproductive") {
        unprodSec += duration;
        distractions++;
      } else if (classification.category === "Idle") {
        idleSec += duration;
      } else if (classification.category === "Break") {
        breakSec += duration;
      } else {
        neutSec += duration;
      }
    }
  });

  // Check final deep work block at the end of logs
  if (currentDeepBlockDuration >= 900) {
    deepBlocksCount++;
    totalDeepWorkSec += currentDeepBlockDuration;
  }

  // 2. Focus Score calculation (Clamped 0 to 100)
  // Highly continuous work gets higher score. Distractions and frequent context switches reduce it.
  const activeSec = totalSec - idleSec - breakSec;
  const prodRatio = activeSec > 0 ? prodSec / activeSec : 0;
  
  let calculatedFocus = Math.round(prodRatio * 100);
  // Apply distraction penalties
  calculatedFocus -= distractions * 4;
  // Apply switch penalties (switching more than 10 times an hour is fragmented)
  const totalHours = totalSec / 3600 || 1;
  const switchFrequency = switches / totalHours;
  if (switchFrequency > 10) {
    calculatedFocus -= Math.round((switchFrequency - 10) * 1.5);
  }
  
  const focusScore = Math.max(0, Math.min(100, calculatedFocus));

  // 3. Fragmentation Index (0 to 100)
  // Measures context switching frequency
  const switchesPerMinute = totalSec > 0 ? switches / (totalSec / 60) : 0;
  const fragmentationIndex = Math.min(100, Math.round(switchesPerMinute * 100 * 3)); // Normalized multiplier

  // 4. Most Productive Window
  let bestHour = 9;
  let maxScore = -999;
  
  for (let i = 0; i < 23; i++) {
    // 2-hour sliding window check
    const currentWindowAvg = (hourlyScores[i].sum + hourlyScores[i+1].sum);
    if (currentWindowAvg > maxScore && (hourlyScores[i].count + hourlyScores[i+1].count) > 0) {
      maxScore = currentWindowAvg;
      bestHour = i;
    }
  }

  const formatHour = (h: number): string => {
    const period = h >= 12 ? "PM" : "AM";
    const formatted = h % 12 === 0 ? 12 : h % 12;
    return `${formatted}:00 ${period}`;
  };
  const mostProductiveWindow = totalSec > 0 && maxScore > -999 
    ? `${formatHour(bestHour)} - ${formatHour((bestHour + 2) % 24)}`
    : "No continuous blocks";

  return {
    totalDurationSeconds: totalSec,
    productiveDurationSeconds: prodSec,
    unproductiveDurationSeconds: unprodSec,
    neutralDurationSeconds: neutSec,
    idleDurationSeconds: idleSec,
    breakDurationSeconds: breakSec,
    appSwitches: switches,
    distractionCount: distractions,
    focusScore,
    fragmentationIndex,
    deepWorkHours: parseFloat((totalDeepWorkSec / 3600).toFixed(1)),
    deepWorkBlocksCount: deepBlocksCount,
    mostProductiveWindow,
    workflowPath: workflowPath.slice(-6) // Return last 6 app workflows for visualization
  };
};
