import { connectWithOpenAi } from "@/app/lib/openAiService";
import { NextResponse } from "next/server";

interface TestItem {
  question: string;
  answer: number;
  test?: {
    q: string;
    a?: string;
  };
}

export async function POST() {
  try {
    const jsonResponse = await fetch(process.env.QUESTION_URL_03 as string);
    const jsonData = await jsonResponse.json();

    const correctedTestData = await Promise.all(
      jsonData["test-data"].map(async (item: TestItem) => {
        const { question, answer, test } = item;

        if (question && !test) {
          const [num1, , num2] = question.split(" ").map(Number);
          const correctAnswer = num1 + num2;

          return correctAnswer !== answer
            ? { ...item, answer: correctAnswer }
            : item;
        }

        if (test?.q) {
          const openAiResponse = await connectWithOpenAi(
            test.q,
            "Answer in a concise, accurate way.",
          );

          const aiAnswer = openAiResponse.ok
            ? openAiResponse.data?.choices?.[0]?.message?.content.trim()
            : "No response from AI";

          return { ...item, test: { ...test, a: aiAnswer || "No answer" } };
        }

        return item;
      }),
    );

    const reportData = {
      task: "JSON",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: {
        apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
        description: jsonData.description,
        copyright: jsonData.copyright,
        "test-data": correctedTestData,
      },
    };

    const reportResponse = await fetch(process.env.RESPONSE_URL_03 as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reportData),
    });

    if (!reportResponse.ok) {
      const errorText = await reportResponse.text();
      console.error(
        `Failed to send report. Status: ${reportResponse.status}, Response: ${errorText}`,
      );
      return NextResponse.json({
        error: `Failed to send report. Status: ${reportResponse.status}, Response: ${errorText}`,
      });
    }

    const reportResult = await reportResponse.json();
    return NextResponse.json(reportResult);
  } catch (error) {
    console.error("Error processing the request:", error);
    return NextResponse.json({ error: "Failed to process the request" });
  }
}
