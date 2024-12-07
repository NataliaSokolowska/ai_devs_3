import { NextResponse } from "next/server";
import path from "path";
import { ensureFilesExist } from "../unzip-data/route";
import { connectWithOpenAi } from "@/app/lib/openAiService";
import {
  getAllFiles,
  processFileContent,
  sanitizeFileNames,
  segregateFiles,
} from "@/app/lib/utils/utils";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const outputDirectory = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E04",
      "files",
    );

    if (!url || !outputDirectory) {
      return NextResponse.json(
        { error: "Missing required parameters: url or baseFolder" },
        { status: 400 },
      );
    }

    await ensureFilesExist(outputDirectory, url, true);
    await segregateFiles(
      outputDirectory,
      ["facts", "weapons_tests"],
      ["weapons_tests.zip"],
    );

    const allFiles = await getAllFiles(outputDirectory);

    const result = {
      people: new Set<string>(),
      hardware: new Set<string>(),
    };

    for (const filePath of allFiles) {
      const file = path.basename(filePath);
      const ext = path.extname(file).toLowerCase();

      try {
        const content = await processFileContent(
          filePath,
          ext,
          outputDirectory,
        );

        if (content.trim() === "") {
          continue;
        }

        const prompt = `
        You are an advanced document and media classification assistant. Your task is to analyze the provided content and classify it into one of the following categories:
        - "people": If the content contains references to captured people, evidence of their presence, or related details.
        - "hardware": If the content contains information about repaired or maintained hardware components, such as physical devices, machinery, or tangible systems. Ignore updates or changes related to software, AI algorithms, or system configurations.
        - "irrelevant": If the content does not belong to either of the above categories.

        Be specific in your classification. Here are examples:
        <examples>
        <example_one>The camera lens was replaced after damage. → hardware</example_one>
        <example_two>The AI system received a software update. → irrelevant</example_two>
        <example_three>John Doe was identified in the footage. → people</example_three>
        <example_four>The robot’s motor was repaired due to a mechanical issue. → hardware</example_four>
        </examples>

        File Name: ${file}
        Content: ${content}

        Respond with one of the following only: "people", "hardware", or "irrelevant".
        `;

        const response = await connectWithOpenAi(prompt, undefined, 0.5);

        if (response.ok) {
          const classification =
            response.data?.choices?.[0]?.message?.content?.trim();

          if (classification === "people") {
            result.people.add(file);
          } else if (classification === "hardware") {
            result.hardware.add(file);
          }
        } else {
          console.error(`AI failed to analyze file: ${file}`, response.error);
        }
      } catch (err) {
        console.error(`Failed to process file: ${file}`, err);
      }
    }

    const sanitizedResult = {
      people: sanitizeFileNames(Array.from(result.people)),
      hardware: sanitizeFileNames(Array.from(result.hardware)),
    };

    const reportData = {
      task: "kategorie",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: sanitizedResult,
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

    const flagMatch = reportResult.message.match(/{{FLG:(.*?)}}/);
    const flag = flagMatch ? flagMatch[1] : "Flag not found";

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process files." },
      { status: 500 },
    );
  }
}
