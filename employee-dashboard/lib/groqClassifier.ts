import { FALLBACK_ROLES, getNormalizedRoleName } from "./classifier";

export interface GroqClassificationResult {
  category: "Productive" | "Unproductive" | "Neutral" | "Idle";
  score: number;
  reason: string;
}

export function getGroqCacheKey(appName: string, website: string, roleName: string): string {
  const cleanApp = (appName || "").trim().toLowerCase();
  const cleanWeb = (website || "").trim().toLowerCase();
  const cleanRole = (roleName || "").trim().toLowerCase();
  return `groq_cls::${cleanApp}::${cleanWeb}::${cleanRole}`;
}

export async function fetchGroqClassification(
  appName: string,
  website: string,
  roleName: string
): Promise<GroqClassificationResult | null> {
  const appLower = (appName || "").trim().toLowerCase();
  if (appLower === "idle" || appLower === "unknown") {
    return {
      category: "Idle",
      score: 0,
      reason: "System was idle, locked, or in sleep mode."
    };
  }

  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key" || apiKey.includes("your_actual")) {
    console.warn("Groq API key is not configured or is a placeholder.");
    return null;
  }

  // Get role description for prompt context
  const searchName = getNormalizedRoleName(roleName);
  const roleInfo = Object.entries(FALLBACK_ROLES).find(
    ([key, r]) => key.toLowerCase() === searchName.toLowerCase() || 
                  r.name.toLowerCase() === searchName.toLowerCase() || 
                  r.id === searchName
  )?.[1];
  
  const roleDescription = roleInfo?.description || "General office work, writing, and coordination.";
  const roleDisplayName = roleInfo?.name || roleName;

  const prompt = `You are an AI WFH (Work From Home) productivity auditor.
Your job is to classify the following computer activity based on the employee's role.

Employee Role: ${roleDisplayName}
Role Description: ${roleDescription}
Application Process: ${appName}
Active Tab / Website Domain: ${website}

Determine:
1. "category": Choose exactly one of ["Productive", "Unproductive", "Neutral", "Idle"].
2. "score": A productivity score from -10 (highly distracting, e.g., gaming, social media during work) to 10 (highly productive, core job activities). Neutral operations (e.g. system files, finder, local folders) should be around 0 to 3.
3. "reason": A brief, professional, and clear one-sentence justification. Do not mention JSON or technical jargon.

Return the result as a raw JSON object containing exactly the keys "category", "score", and "reason".`;

  try {
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
          response_format: {
            type: "json_object"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content;
    if (!textResult) {
      throw new Error("Empty response from Groq API");
    }

    const result = JSON.parse(textResult) as GroqClassificationResult;
    return {
      category: result.category,
      score: Number(result.score),
      reason: result.reason,
    };
  } catch (error) {
    console.error("Failed to fetch classification from Groq:", error);
    return null;
  }
}

export async function fetchGroqClassificationsBatch(
  activities: Array<{ appName: string; website: string; roleName: string; key: string }>
): Promise<Record<string, GroqClassificationResult>> {
  if (activities.length === 0) return {};

  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key" || apiKey.includes("your_actual")) {
    console.warn("Groq API key is not configured or is a placeholder.");
    return {};
  }

  // Format activities to be sent in the batch prompt
  const formattedActivities = activities.map((item, idx) => {
    const searchName = getNormalizedRoleName(item.roleName);
    const roleInfo = Object.entries(FALLBACK_ROLES).find(
      ([key, r]) => key.toLowerCase() === searchName.toLowerCase() || 
                    r.name.toLowerCase() === searchName.toLowerCase() || 
                    r.id === searchName
    )?.[1];
    const roleDescription = roleInfo?.description || "General office work, writing, and coordination.";
    const roleDisplayName = roleInfo?.name || item.roleName;

    return {
      index: idx,
      key: item.key,
      employeeRole: roleDisplayName,
      roleDescription: roleDescription,
      appName: item.appName,
      website: item.website
    };
  });

  const prompt = `You are an AI WFH (Work From Home) productivity auditor.
Your job is to classify the WFH productivity of the following activities based on each employee's role.

Activities to classify:
${JSON.stringify(formattedActivities, null, 2)}

For each activity, determine:
1. "category": Choose exactly one of ["Productive", "Unproductive", "Neutral", "Idle"].
2. "score": A productivity score from -10 (highly distracting, e.g. gaming, social media during work) to 10 (highly productive, core job activities). Neutral operations should be around 0 to 3.
3. "reason": A brief, professional, and clear one-sentence justification.

Return the results as a single JSON object where the keys are the "key" of each activity, and the values are objects with "category", "score", and "reason".
Example response format:
{
  "activity_key_1": {
    "category": "Productive",
    "score": 8,
    "reason": "Developer is editing code in VS Code."
  }
}`;

  try {
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
          response_format: {
            type: "json_object"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content;
    if (!textResult) {
      throw new Error("Empty response from Groq API");
    }

    const results = JSON.parse(textResult) as Record<string, GroqClassificationResult>;
    const cleaned: Record<string, GroqClassificationResult> = {};
    for (const key in results) {
      cleaned[key] = {
        category: results[key].category,
        score: Number(results[key].score),
        reason: results[key].reason
      };
    }
    return cleaned;
  } catch (error) {
    console.error("Failed to fetch batch classification from Groq:", error);
    return {};
  }
}
