import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectWithOpenAi } from "@/app/lib/openAiService";

const localFilePath = path.resolve("app/tasks/04/files/test-data.txt");

async function getLocalOrRemoteData(): Promise<string> {
  try {
    const dirPath = path.dirname(localFilePath);
    await fs.mkdir(dirPath, { recursive: true });

    const localData = await fs.readFile(localFilePath, "utf-8");
    return localData;
  } catch (err) {
    console.error("Failed to read local file:", err);
    const response = await fetch(process.env.QUESTION_URL_04 as string);
    const htmlData = await response.text();

    const sensitiveText = htmlData.trim();

    await fs.writeFile(localFilePath, sensitiveText);
    return sensitiveText;
  }
}

export async function POST() {
  try {
    const sensitiveData = await getLocalOrRemoteData();

    const systemPrompt = `
    <objective>
    Please replace sensitive information in the following text with the word 'CENZURA'.
    </objective>
    <rules>
    Make sure that:
    1. A full name (first name + surname) is replaced by a single instance of 'CENZURA'.
    2. A full address is treated as:
    - Town replaced by one instance of 'CENZURA'.
    - Street name and house number together replaced by one instance of 'CENZURA'.
    3. Any other sensitive information, such as town and age, is replaced with 'CENZURA'.
    4. Maintain grammatical correctness in the response, particularly with age-related phrases, ensuring the form "lat" or "lata" aligns with the original text.
    </rules>
    <examples>
    Original: Dane podejrzanego: Jakub Woźniak. Adres: Rzeszów, ul. Miła 4. Wiek: 33 lata.
    Expected: Dane podejrzanego: CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lata.

    Original: Podejrzany nazywa się Tomasz Kaczmarek. Jest zameldowany w Poznaniu, ul. Konwaliowa 18. Ma 25 lat.
    Expected: Podejrzany nazywa się CENZURA. Jest zameldowany w CENZURA, ul. CENZURA. Ma CENZURA lat.
    </examples>
    <result>
    Return the text with only one 'CENZURA' per sensitive detail, keeping the original sentence structure and correct grammatical forms intact.
    </result>
`;

    const openAiResponse = await connectWithOpenAi(sensitiveData, systemPrompt);
    const aiAnswer = openAiResponse.ok
      ? openAiResponse.data?.choices?.[0]?.message?.content.trim()
      : "No response from AI";

    const reportData = {
      task: "CENZURA",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: aiAnswer,
    };

    const reportResponse = await fetch(process.env.RESPONSE_URL_04 as string, {
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
