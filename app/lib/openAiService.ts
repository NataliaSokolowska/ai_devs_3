import {
  MODELS,
  OPEN_AI_API_URL,
  OPEN_AI_DALLE_API_URL,
  OPEN_AI_WHISPER_API_URL,
} from "./openAiService.constants";

export type TranscriptionResult = {
  ok: boolean;
  data?: {
    text: string;
  };
  error?: string;
};

export const connectWithOpenAi = async (
  userMessage: string | object,
  systemMessage = "You are a helpful assistant.",
  temperature = 1.0,
  model = MODELS.GPT_4O_MINI,
) => {
  const response = await fetch(`${OPEN_AI_API_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model,
      temperature,
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

export const transcribeAudio = async (
  audioFile: File,
): Promise<TranscriptionResult> => {
  try {
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", MODELS.WHISPER_1);

    const response = await fetch(`${OPEN_AI_WHISPER_API_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Failed to transcribe audio. Status: ${response.status}, Response: ${errorText}`,
      };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    console.error("Error during audio transcription:", error);
    return {
      ok: false,
      error: "An unexpected error occurred during audio transcription.",
    };
  }
};

export const generateImageWithDalle = async (
  prompt: string,
  size = "1024x1024",
): Promise<{ ok: boolean; data?: any; error?: string }> => {
  try {
    const response = await fetch(`${OPEN_AI_DALLE_API_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Failed to generate image. Status: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    console.error("Error in generateImageWithDalle:", error);
    return { ok: false, error: "Internal server error." };
  }
};
