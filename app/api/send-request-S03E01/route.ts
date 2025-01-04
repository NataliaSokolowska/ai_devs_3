import { NextResponse } from "next/server";
import { ensureFilesExist } from "../unzip-data/route";
import path from "path";
import fs from "fs/promises";
import { getAllFiles, segregateFiles } from "@/app/lib/utils/utils";
import { connectWithOpenAi } from "@/app/lib/openAiService";

export async function POST(req: Request) {
  try {
    const { dataUrl } = await req.json();
    const outputDirectory = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S03E01",
      "files",
    );

    if (!dataUrl || !outputDirectory) {
      return NextResponse.json(
        { error: "Missing required parameters: dataUrl or outputDirectory" },
        { status: 400 },
      );
    }

    await ensureFilesExist(outputDirectory, dataUrl, true);
    await segregateFiles(
      outputDirectory,
      ["weapons_tests"],
      ["weapons_tests.zip", ".mp3", ".png"],
    );

    const textDirectory = path.join(outputDirectory, "text");
    const factsDirectory = path.join(outputDirectory, "facts");

    const allTxtFiles = await getAllFiles(textDirectory);
    const factsTxtFiles = await getAllFiles(factsDirectory);

    if (allTxtFiles.length === 0) {
      throw new Error("No text files found for processing.");
    }

    // Keywords from facts
    const factsKeywords: Record<string, string> = {};

    for (const factFile of factsTxtFiles) {
      const factFileName = path.basename(factFile);
      const factContent = await fs.readFile(factFile, "utf-8");

      const factPrompt = `
        You are an AI assistant analyzing factual documents related to security incidents.
        Generate meaningful keywords for the following document.

        ### Instructions:
        - Generate 10-15 meaningful keywords.
        - Keywords must be in nominative case (e.g., nauczyciel, not ‘nauczycielem’).
        - Keywords must be in Polish only.
        - Include names of people, locations, significant terms, and events.
        - Avoid duplicates or overly generic terms.

        ### Document Name:
        ${factFileName}

        ### Document Content:
        ${factContent}

        ### Expected Response Format:
        keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10, keyword11, keyword12, keyword13, keyword14, keyword15
      `;

      const factResponse = await connectWithOpenAi(factPrompt, undefined, 0.5);

      if (factResponse.ok) {
        const keywords =
          factResponse.data.choices[0]?.message?.content?.trim() || "";
        factsKeywords[factFileName] = keywords;
        console.log(`✅ Keywords for fact ${factFileName}: ${keywords}`);
      } else {
        console.error(`❌ Failed to generate keywords for ${factFileName}`);
        factsKeywords[factFileName] = "Failed to generate keywords";
      }
    }

    // Keywords from reports and from facts
    const metadata: Record<string, string> = {};

    for (const filePath of allTxtFiles) {
      const fileName = path.basename(filePath);
      const fileContent = await fs.readFile(filePath, "utf-8");

      // Find related facts - it's not generic, but it's a good start
      const relatedFacts = Object.entries(factsKeywords)
        .filter(([factName, factKeywords]) => {
          const keywordsArray = factKeywords
            .split(", ")
            .map((k) => k.toLowerCase());
          return (
            keywordsArray.some((keyword) =>
              fileContent.toLowerCase().includes(keyword),
            ) ||
            keywordsArray.some((keyword) =>
              fileName.toLowerCase().includes(keyword),
            ) ||
            keywordsArray.includes("javascript") ||
            keywordsArray.includes("python") ||
            keywordsArray.includes("programista") ||
            keywordsArray.includes("nauczyciel")
          );
        })
        .map(([_, factKeywords]) => factKeywords);

      const generateMetadataPrompt = `
        You are an AI assistant analyzing security incident reports. Your task is to generate meaningful keywords for the given report.

        ### Instructions:
        1. Carefully analyze the **content of the report**.
        2. Cross-reference individuals, professions, technologies, sectors, dates, and events with information from the **factual documents**.
        3. If a person appears both in the **report** and **factual documents**, include:
           - Their **full name**
           - **Profession or role** (e.g., programista JavaScript, nauczyciel, inżynier)
           - **Technological skills** (e.g., JavaScript, Python, AI Devs)
        4. Always prioritize:
           - **Sectors (e.g., sektor C4)**
           - **Professions and roles (e.g., nauczyciel, programista JavaScript)**
           - **Technological skills (e.g., JavaScript, Python)**
           - **Significant events and locations**
          - **Animals or fauna references**
           - **Dates (e.g., 2024-11-12)**
        5. If an individual, animal, is mentioned indirectly in the report but their details (e.g., profession, technologies) exist in the factual documents, **explicitly include them in the keywords**.
        6. Ensure that keywords reflect **individuals, animals, and their roles/skills**, even if not explicitly stated in the report but inferred from related facts.
        7. Avoid duplicates or overly generic terms.
        8. Detect and include keywords derived from the **report file name**.

        ### Example:
        If the report mentions **Barbara Zawadzka** and the related factual document describes her as a **programista JavaScript**, then the keywords should include:
        **sektor C4, Barbara Zawadzka, programista JavaScript, Python, Kraków, ruch oporu, patrol, incydent, bezpieczeństwo, raport, technologie, 2024-11-12**

        If the report mentions **zwierzyna leśna** and the related factual document describes activities in **sektor A1**, then the keywords should include:
        **sektor A1, zwierzyna leśna, las, patrol, incydent, bezpieczeństwo, raport, 2024-11-12**

        ### Report Details:
        - **File Name:** ${fileName}
        - **Report Content:**
        ${fileContent}

        ### Related Facts:
        ${relatedFacts.map((fact, index) => `Fakt ${index + 1}: ${fact}`).join("\n")}

        ### Expected Response Format:
        sektor C4, Barbara Zawadzka, programista JavaScript, Python, Kraków, ruch oporu, patrol, incydent, bezpieczeństwo, raport, technologie, 2024-11-12
        `;

      const response = await connectWithOpenAi(
        generateMetadataPrompt,
        undefined,
        0.5,
      );

      if (response.ok) {
        const keywords =
          response.data.choices[0]?.message?.content?.trim() || "";
        metadata[fileName] = keywords;
        console.log(`✅ Keywords for ${fileName}: ${keywords}`);
      } else {
        console.error(`❌ Failed to generate keywords for ${fileName}`);
        metadata[fileName] = "Failed to generate keywords";
      }
    }

    const reportData = {
      task: "dokumenty",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: metadata,
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
    console.error("Error processing the request:", error);
    return NextResponse.json({ error: "Failed to process the request." });
  }
}
