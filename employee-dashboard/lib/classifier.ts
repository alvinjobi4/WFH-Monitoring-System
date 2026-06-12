// ==========================================
// ROLE-AWARE PRODUCTIVITY INTELLIGENCE TYPES
// ==========================================
export type ProductivityCategory = "Productive" | "Unproductive" | "Neutral" | "Idle" | "Break";

export const PRODUCTIVITY_COLORS = {
  Productive: "#10B981",    // SaaS Success Green
  Unproductive: "#EF4444",  // SaaS Danger Red
  Idle: "#6B7280",          // SaaS Muted Gray
  Neutral: "#3B82F6",        // SaaS Accent Blue
  Break: "#F59E0B"          // SaaS Warning/Break Amber/Yellow
};

export interface Role {
  id: string;
  name: string;
  parent_role_id?: string | null;
  description: string;
}

export interface RoleRule {
  id: string;
  role_id: string;
  rule_type: "app" | "domain" | "window_title" | "sequence" | "keyword";
  match_type: "exact" | "contains" | "regex";
  pattern: string;
  score: number;
  category: ProductivityCategory;
  confidence: number;
}

export interface NormalizedActivity {
  process: string;
  app_name: string;
  window_title: string;
  cleaned_title: string;
  domain: string;
}

export interface AIClassification {
  cleanName: string;
  category: ProductivityCategory;
  score: number;
  confidence: number;
  reason: string;
  matchedRuleId?: string;
  modifiersApplied: string[];
}

// ==========================================
// STATIC SEED & HIERARCHY FALLBACKS
// ==========================================
export const FALLBACK_ROLES: Record<string, Role> = {
  "role_1": {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Knowledge Worker",
    parent_role_id: null,
    description: "Default role for general office tasks and coordination"
  },
  "role_2": {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Software Developer",
    parent_role_id: "11111111-1111-1111-1111-111111111111",
    description: "Technical role specializing in coding, design, and analysis"
  },
  "role_3": {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Designer",
    parent_role_id: "11111111-1111-1111-1111-111111111111",
    description: "Visual and UI designer, leverages figma and modeling resources"
  },
  "role_4": {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Recruiter",
    parent_role_id: "11111111-1111-1111-1111-111111111111",
    description: "Talent acquisition, heavy social platforming and outreach"
  }
};

export const getNormalizedRoleName = (roleOrDept: string): string => {
  const normalized = (roleOrDept || "").toLowerCase().trim();
  
  if (
    normalized === "22222222-2222-2222-2222-222222222222" ||
    normalized.includes("role_2") ||
    normalized.includes("engineering") ||
    normalized.includes("software") ||
    normalized.includes("developer") ||
    normalized.includes("dev")
  ) {
    return "Software Developer";
  }
  if (
    normalized === "33333333-3333-3333-3333-333333333333" ||
    normalized.includes("role_3") ||
    normalized.includes("electrical") ||
    normalized.includes("designer") ||
    normalized.includes("design") ||
    normalized.includes("frontend")
  ) {
    return "Designer";
  }
  if (
    normalized === "44444444-4444-4444-4444-444444444444" ||
    normalized.includes("role_4") ||
    normalized.includes("recruiter") ||
    normalized.includes("hr") ||
    normalized.includes("hiring") ||
    normalized.includes("talent")
  ) {
    return "Recruiter";
  }
  return "Knowledge Worker";
};

export const FALLBACK_RULES: RoleRule[] = [
  // Role 1 rules
  { id: "r1", role_id: "11111111-1111-1111-1111-111111111111", rule_type: "domain", match_type: "exact", pattern: "slack.com", score: 7, category: "Productive", confidence: 1.0 },
  { id: "r2", role_id: "11111111-1111-1111-1111-111111111111", rule_type: "domain", match_type: "exact", pattern: "notion.so", score: 8, category: "Productive", confidence: 1.0 },
  { id: "r3", role_id: "11111111-1111-1111-1111-111111111111", rule_type: "domain", match_type: "exact", pattern: "youtube.com", score: -10, category: "Unproductive", confidence: 0.9 },
  { id: "r4", role_id: "11111111-1111-1111-1111-111111111111", rule_type: "app", match_type: "exact", pattern: "explorer.exe", score: 2, category: "Neutral", confidence: 0.8 },

  // Role 2 rules
  { id: "r5", role_id: "22222222-2222-2222-2222-222222222222", rule_type: "app", match_type: "contains", pattern: "code", score: 10, category: "Productive", confidence: 1.0 },
  { id: "r6", role_id: "22222222-2222-2222-2222-222222222222", rule_type: "app", match_type: "contains", pattern: "pycharm", score: 10, category: "Productive", confidence: 1.0 },
  { id: "r7", role_id: "22222222-2222-2222-2222-222222222222", rule_type: "domain", match_type: "contains", pattern: "github", score: 10, category: "Productive", confidence: 1.0 },
  { id: "r8", role_id: "22222222-2222-2222-2222-222222222222", rule_type: "domain", match_type: "exact", pattern: "stackoverflow.com", score: 9, category: "Productive", confidence: 1.0 },

  // Role 3 rules
  { id: "r10", role_id: "33333333-3333-3333-3333-333333333333", rule_type: "domain", match_type: "exact", pattern: "react.dev", score: 10, category: "Productive", confidence: 1.0 },
  { id: "r11", role_id: "33333333-3333-3333-3333-333333333333", rule_type: "app", match_type: "exact", pattern: "figma.exe", score: 8, category: "Productive", confidence: 0.9 },

  // Role 4 rules
  { id: "r13", role_id: "44444444-4444-4444-4444-444444444444", rule_type: "domain", match_type: "contains", pattern: "linkedin.com", score: 10, category: "Productive", confidence: 1.0 }
];

// ==========================================
// ACTIVITY NORMALIZATION SERVICE
// ==========================================
export const extractDomain = (website: string): string => {
  if (!website) return "";
  let clean = website.trim();
  if (clean.includes(" | ")) {
    const parts = clean.split(" | ");
    clean = parts[parts.length - 1] || "";
  }
  // Strip notification counts like (4) at the start of the title
  clean = clean.replace(/^\(\d+\)\s+/i, "").trim();
  clean = clean.replace(/\s*-\s*(Google Chrome|Microsoft Edge|Firefox|Chrome|Web Browser|Brave|Brave Browser|Brave Nightly|Opera|Safari)\s*$/i, "").trim();
  if (clean.startsWith("http")) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      // noop
    }
  }
  clean = clean.replace(/^www\./i, "");
  if (clean.endsWith(".exe")) {
    clean = clean.replace(/\.exe$/i, "");
  }
  return clean.toLowerCase();
};

export const normalizeActivity = (appName: string, website: string): NormalizedActivity => {
  const process = (appName || "").split(" | ")[0]?.trim() || "";
  const domain = extractDomain(website || appName || "");

  let window_title = "";
  if (appName && appName.includes(" | ")) {
    const parts = appName.split(" | ");
    window_title = parts.slice(1).join(" | ").trim();
  }

  // Generate cleaned display titles for the UI
  let cleaned_title = process.replace(/\.exe$/i, "").trim();
  cleaned_title = cleaned_title.replace(/([A-Z])/g, " $1").trim()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const lowerApp = cleaned_title.toLowerCase();
  if (lowerApp.includes("chrome") || lowerApp.includes("edge") || lowerApp.includes("firefox") || lowerApp.includes("brave") || lowerApp.includes("opera") || lowerApp.includes("safari")) {
    cleaned_title = domain ? domain.split(".")[0]?.toUpperCase() || "Web Browser" : "Web Browser";
  }

  // Hardcoded standardization for standard processes
  const lowerTitle = cleaned_title.toLowerCase();
  if (lowerTitle.includes("whatsapp")) cleaned_title = "WhatsApp";
  if (lowerTitle.includes("antigravity")) cleaned_title = "Antigravity AI";
  if (lowerTitle.includes("code") || lowerTitle.includes("vs code")) cleaned_title = "VS Code";
  if (lowerTitle.includes("pycharm")) cleaned_title = "PyCharm";
  if (lowerTitle.includes("explorer")) cleaned_title = "File Explorer";

  return {
    process,
    app_name: cleaned_title,
    window_title,
    cleaned_title,
    domain
  };
};

// ==========================================
// ROLE HIERARCHY TREE BUILDER
// ==========================================
const getActiveRoleRulesRecursive = (roleName: string): RoleRule[] => {
  const searchName = getNormalizedRoleName(roleName);
  const activeRole = Object.entries(FALLBACK_ROLES).find(
    ([key, r]) => key.toLowerCase() === searchName.toLowerCase() ||
      r.name.toLowerCase() === searchName.toLowerCase() ||
      r.id === searchName
  )?.[1];

  if (!activeRole) {
    // If no specific role matched, return default role_1 rules
    return FALLBACK_RULES.filter(rule => rule.role_id === "11111111-1111-1111-1111-111111111111");
  }

  const collectedRules: RoleRule[] = [];
  let currentRole: Role | null = activeRole;

  while (currentRole) {
    const roleRules = FALLBACK_RULES.filter(rule => rule.role_id === currentRole!.id);
    // Push these rules (higher specificity matches first, child overrides parent)
    collectedRules.push(...roleRules);

    if (currentRole.parent_role_id) {
      const parentId: string = currentRole.parent_role_id;
      currentRole = Object.values(FALLBACK_ROLES).find(r => r.id === parentId) || null;
    } else {
      currentRole = null;
    }
  }

  return collectedRules;
};

// ==========================================
// MODULAR SCORING & PIPELINE ENGINE
// ==========================================
export interface DomainRuleInfo {
  type: "whitelist" | "blacklist" | "neutral";
  score: number;
}

export const classifyActivityWithAI = (
  appName: string,
  website: string,
  rawCategory: string,
  roleName = "role_1",
  durationSeconds = 0,
  recentHistory: { app_name: string; website: string; timestamp: string }[] = [],
  groqClassification?: { category: string; score: number; reason: string } | null,
  domainRulesMap?: Record<string, DomainRuleInfo>,
  logStartTime?: string,
  breakLogs?: Array<{ start_time: string; end_time?: string | null }>
): AIClassification => {
  // 1. Normalize
  const normalized = normalizeActivity(appName, website);

  // 1.5. Manual Break Session Override
  if (logStartTime && breakLogs && breakLogs.length > 0) {
    const logTime = new Date(logStartTime).getTime();
    const insideBreak = breakLogs.some(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = b.end_time ? new Date(b.end_time).getTime() : Date.now();
      return logTime >= bStart && logTime <= bEnd;
    });
    if (insideBreak) {
      return {
        cleanName: appName?.startsWith("STATUS_CHANGE") ? appName.split(" | ")[1] === "on_break" ? "Start Break Session" : "End Break Session" : "On Break",
        category: "Break",
        score: 0,
        confidence: 1.0,
        reason: "Activity was logged during a manually initiated break session.",
        modifiersApplied: []
      };
    }
  }

  // 2. Idle / Sleep Detection
  const appLower = normalized.process.toLowerCase();
  const webLower = (website || "").toLowerCase();
  if (
    appLower === "idle" ||
    appLower === "unknown" ||
    rawCategory === "Idle" ||
    (appLower === "unknown" && webLower === "idle")
  ) {
    return {
      cleanName: "Idle / Sleep",
      category: "Idle",
      score: 0,
      confidence: 1.0,
      reason: "System was idle, locked, or in sleep mode.",
      modifiersApplied: []
    };
  }

  // 3. Status Change detection
  if (appName?.startsWith("STATUS_CHANGE")) {
    const statusVal = appName.split(" | ")[1] || "Offline";
    const formattedStatus = statusVal.toLowerCase() === "dnd" ? "DND" : statusVal.charAt(0).toUpperCase() + statusVal.slice(1).toLowerCase();
    return {
      cleanName: `Status Changed: ${formattedStatus}`,
      category: "Neutral",
      score: 0,
      confidence: 1.0,
      reason: `Employee manually updated their WFH status to ${formattedStatus}.`,
      modifiersApplied: []
    };
  }

  // 3.5. Check domain rules map (whitelist/blacklist bypass)
  if (domainRulesMap) {
    const domain = normalized.domain;
    const processLower = normalized.process.toLowerCase();
    const cleanTitleLower = normalized.cleaned_title.toLowerCase();
    const windowTitleLower = normalized.window_title.toLowerCase();
    const webLower = (website || "").toLowerCase();
    const appNameLower = (appName || "").toLowerCase();

    // 1. Check Blacklist Rules (Broad keyword-based matching as requested by user)
    const blacklistedRuleKey = Object.keys(domainRulesMap).find(d => {
      const info = domainRulesMap[d];
      if (!info || info.type !== "blacklist") return false;
      const keyword = d.trim().toLowerCase();
      if (!keyword) return false;
      return (
        domain.includes(keyword) ||
        processLower.includes(keyword) ||
        cleanTitleLower.includes(keyword) ||
        windowTitleLower.includes(keyword) ||
        webLower.includes(keyword) ||
        appNameLower.includes(keyword)
      );
    });

    if (blacklistedRuleKey) {
      const info = domainRulesMap[blacklistedRuleKey]!;
      const customScore = typeof info.score === "number" ? info.score : -10;
      return {
        cleanName: normalized.cleaned_title,
        category: "Unproductive",
        score: customScore,
        confidence: 1.0,
        reason: `Activity contains blacklisted keyword "${blacklistedRuleKey}".`,
        modifiersApplied: []
      };
    }

    // 1.5. Check Neutral Rules (Broad keyword-based matching)
    const neutralRuleKey = Object.keys(domainRulesMap).find(d => {
      const info = domainRulesMap[d];
      if (!info || info.type !== "neutral") return false;
      const keyword = d.trim().toLowerCase();
      if (!keyword) return false;
      return (
        domain.includes(keyword) ||
        processLower.includes(keyword) ||
        cleanTitleLower.includes(keyword) ||
        windowTitleLower.includes(keyword) ||
        webLower.includes(keyword) ||
        appNameLower.includes(keyword)
      );
    });

    if (neutralRuleKey) {
      return {
        cleanName: normalized.cleaned_title,
        category: "Neutral",
        score: 0,
        confidence: 1.0,
        reason: `Activity contains neutral keyword "${neutralRuleKey}".`,
        modifiersApplied: []
      };
    }

    // 2. Check Whitelist Rules (Broad keyword-based matching and strict domain suffix matching)
    const whitelistedRuleKey = Object.keys(domainRulesMap).find(d => {
      const info = domainRulesMap[d];
      if (!info || info.type !== "whitelist") return false;
      const keyword = d.trim().toLowerCase();
      if (!keyword) return false;

      // Strict domain or subdomain suffix check first
      if (domain === keyword || domain.endsWith("." + keyword)) {
        return true;
      }

      // Broad keyword check
      return (
        domain.includes(keyword) ||
        processLower.includes(keyword) ||
        cleanTitleLower.includes(keyword) ||
        windowTitleLower.includes(keyword) ||
        webLower.includes(keyword) ||
        appNameLower.includes(keyword)
      );
    });

    if (whitelistedRuleKey) {
      const info = domainRulesMap[whitelistedRuleKey]!;
      const customScore = typeof info.score === "number" ? info.score : 10;
      return {
        cleanName: normalized.cleaned_title,
        category: "Productive",
        score: customScore,
        confidence: 1.0,
        reason: `Activity contains whitelisted keyword/domain "${whitelistedRuleKey}".`,
        modifiersApplied: []
      };
    }
  }

  // 0. Use Groq Classification if available
  if (groqClassification) {
    return {
      cleanName: normalized.cleaned_title,
      category: groqClassification.category as ProductivityCategory,
      score: groqClassification.score,
      confidence: 0.95,
      reason: groqClassification.reason,
      modifiersApplied: []
    };
  }

  const rules = getActiveRoleRulesRecursive(roleName);

  let matchedRule: RoleRule | undefined = undefined;
  let matchedReason = "No matching rules; defaulted to Neutral classification.";
  let baseCategory: ProductivityCategory = "Neutral";
  let baseScore = 0;
  let confidence = 0.5;

  // 3. Rule Priority Scoring
  // Priority 1: Exact Domain Match
  if (normalized.domain) {
    matchedRule = rules.find(r => r.rule_type === "domain" && r.match_type === "exact" && r.pattern.toLowerCase() === normalized.domain);
  }

  // Priority 2: Exact App Match
  if (!matchedRule && normalized.process) {
    const proc = normalized.process.toLowerCase();
    matchedRule = rules.find(r => r.rule_type === "app" && r.match_type === "exact" && r.pattern.toLowerCase() === proc);
  }

  // Priority 3: App Name Contains Match
  if (!matchedRule && normalized.process) {
    const proc = normalized.process.toLowerCase();
    matchedRule = rules.find(r => r.rule_type === "app" && r.match_type === "contains" && proc.includes(r.pattern.toLowerCase()));
  }

  // Priority 4: Domain Contains Match
  if (!matchedRule && normalized.domain) {
    matchedRule = rules.find(r => r.rule_type === "domain" && r.match_type === "contains" && normalized.domain.includes(r.pattern.toLowerCase()));
  }

  // Priority 5: Window Title Keyword Match
  if (!matchedRule && normalized.window_title) {
    const titleLower = normalized.window_title.toLowerCase();
    matchedRule = rules.find(r => r.rule_type === "window_title" && r.match_type === "contains" && titleLower.includes(r.pattern.toLowerCase()));
  }

  // 4. Resolve Base Classifications
  if (matchedRule) {
    baseCategory = matchedRule.category;
    baseScore = matchedRule.score;
    confidence = matchedRule.confidence;

    const ruleSource = matchedRule.rule_type === "domain" ? `website "${matchedRule.pattern}"` : `application "${matchedRule.pattern}"`;
    matchedReason = `Classified as ${matchedRule.category} based on your role's productivity rules for ${ruleSource}.`;
  } else {
    // Basic heuristics fallback
    const lowerApp = normalized.app_name.toLowerCase();
    const systemKeywords = ["explorer", "system", "taskmgr", "cmd", "powershell"];
    if (systemKeywords.some(kw => lowerApp.includes(kw))) {
      baseCategory = "Neutral";
      baseScore = 2;
      matchedReason = "Recognized as a system tool or administrative window required for standard computer operations.";
    } else {
      matchedReason = "This activity is not explicitly categorized in your WFH productivity policy. It has been set to Neutral.";
    }
  }

  // 5. Contextual Modifiers
  const modifiersApplied: string[] = [];
  let finalScore = baseScore;
  let finalCategory = baseCategory;

  // A. Tutorial & Documentation Detection on Distracting Sites
  if (normalized.domain === "youtube.com" || normalized.domain === "netflix.com") {
    const titleLower = (normalized.window_title || "").toLowerCase();
    const tutorialKeywords = ["tutorial", "guide", "course", "documentation", "learn", "how to", "developer"];
    if (tutorialKeywords.some(kw => titleLower.includes(kw))) {
      finalCategory = "Productive";
      finalScore = 6; // Promoted to Productive
      confidence = Math.max(confidence, 0.7);
      modifiersApplied.push("Educational Content Upgrade (Promoted video domain to Productive)");
      matchedReason = "Upgraded to Productive! Our AI identified learning keywords (tutorials, guides, or courses) in the title of this session.";
    }
  }

  // B. Long Entertainment Consumption Penalty
  if ((normalized.domain === "youtube.com" || normalized.domain === "netflix.com") && finalCategory !== "Productive") {
    if (durationSeconds > 1800) { // Greater than 30 minutes
      finalScore = -15; // Extra severe distraction penalty
      modifiersApplied.push("Severe Distraction Penalty (Entertainment session exceeded 30 minutes)");
      matchedReason = "Flagged as a severe distraction! This entertainment session exceeded 30 continuous minutes.";
    }
  }

  // C. Workflow Continuity & Context Switch Modifiers
  if (recentHistory.length >= 3) {
    // Measure Context Switches (App shifts)
    let switches = 0;
    for (let i = 0; i < Math.min(recentHistory.length - 1, 4); i++) {
      if (recentHistory[i]!.app_name !== recentHistory[i + 1]!.app_name) {
        switches++;
      }
    }

    // Switch Penalty
    if (switches >= 3) {
      finalScore = Math.max(-15, finalScore - 3); // Deduct 3 points for heavy fragmentation
      modifiersApplied.push("Context Switching Penalty (Frequent shifts between tasks)");
    }

    // Sequence Continuity Bonus (e.g. IDE -> GitHub -> Localhost)
    const appsList = recentHistory.map(h => normalizeActivity(h.app_name, h.website).app_name.toLowerCase());
    const hasIDE = appsList.some(a => a.includes("vs code") || a.includes("pycharm"));
    const hasGit = appsList.some(a => a.includes("github") || a.includes("gitlab"));

    if (hasIDE && hasGit && finalCategory === "Productive") {
      finalScore = Math.min(10, finalScore + 2); // Injected bonus
      modifiersApplied.push("Deep Focus & Workflow Continuity Bonus (Continuous coding stream)");
    }
  }

  return {
    cleanName: normalized.cleaned_title,
    category: finalCategory,
    score: finalScore,
    confidence,
    reason: matchedReason,
    matchedRuleId: matchedRule?.id,
    modifiersApplied
  };
};
