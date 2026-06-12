import { FALLBACK_ROLES, getNormalizedRoleName } from "./classifier";

export interface GeminiClassificationResult {
  category: "Productive" | "Unproductive" | "Neutral" | "Idle";
  score: number;
  reason: string;
}

export function getGeminiCacheKey(appName: string, website: string, roleName: string): string {
  const cleanApp = (appName || "").trim().toLowerCase();
  const cleanWeb = (website || "").trim().toLowerCase();
  const cleanRole = (roleName || "").trim().toLowerCase();
  return `gemini_cls::${cleanApp}::${cleanWeb}::${cleanRole}`;
}

export async function fetchGeminiClassification(
  appName: string,
  website: string,
  roleName: string
): Promise<GeminiClassificationResult | null> {
  const appLower = (appName || "").trim().toLowerCase();
  if (appLower === "idle" || appLower === "unknown") {
    return {
      category: "Idle",
      score: 0,
      reason: "System was idle, locked, or in sleep mode."
    };
  }

  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key" || apiKey.includes("your_actual")) {
    console.warn("Gemini API key is not configured or is a placeholder.");
    return null;
  }

  // Get role description for prompt context
  const searchName = getNormalizedRoleName(roleName);
  const roleInfo = Object.entries(FALLBACK_ROLES).find(
    ([key, r]) =>
      key.toLowerCase() === searchName.toLowerCase() ||
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

Return the result as a raw JSON object containing exactly the keys "category", "score", and "reason". Do not wrap in markdown code fences.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("Empty response from Gemini API");
    }

    const result = JSON.parse(textResult) as GeminiClassificationResult;
    return {
      category: result.category,
      score: Number(result.score),
      reason: result.reason,
    };
  } catch (error) {
    console.error("Failed to fetch classification from Gemini:", error);
    return null;
  }
}
