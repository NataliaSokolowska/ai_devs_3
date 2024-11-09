import { MODELS, OPEN_AI_API_URL } from "./openAiService.constants";

export const connectWithOpenAi = async (
  userMessage: string,
  systemMessage = "You are a helpful assistant.",
) => {
  const response = await fetch(`${OPEN_AI_API_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELS.GPT_4O_MINI,
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `Failed to fetch OpenAI response. Status: ${response.status}`,
    };
  }

  const data = await response.json();
  return { ok: true, data };
};
