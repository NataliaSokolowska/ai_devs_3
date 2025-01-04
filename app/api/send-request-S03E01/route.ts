import { NextResponse } from "next/server";
import { ensureFilesExist } from "../unzip-data/route";
import path from "path";
import fs from "fs/promises";
import { getAllFiles, segregateFiles } from "@/app/lib/utils/utils";
import { connectWithOpenAi } from "@/app/lib/openAiService";

interface FactMetadata {
  people: string[];
  roles: string[];
  technologies: string[];
  locations: string[];
  animals: string[];
  keywords: string[];
}

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

    const factsMetadata: Record<string, FactMetadata> = {};

    for (const factFile of factsTxtFiles) {
      const factFileName = path.basename(factFile);
      const factContent = await fs.readFile(factFile, "utf-8");

      const factPrompt = `
        You are an AI assistant analyzing factual documents related to security incidents.
        Extract the following details:

        1. **People**: Names of individuals mentioned.
        2. **Roles**: Their professions or roles.
        3. **Technologies**: Technologies mentioned.
        4. **Locations**: Places mentioned.
        5. **Animals**: Any animal references.
        6. **Keywords**: 10-15 meaningful keywords summarizing the document.

        ### Document Name:
        ${factFileName}

        ### Document Content:
        ${factContent}

        ### Expected Response Format (JSON):
        {
          "people": ["name1", "name2"],
          "roles": ["role1", "role2"],
          "technologies": ["tech1", "tech2"],
          "locations": ["location1", "location2"],
          "animals": ["animal1", "animal2"],
          "keywords": ["keyword1", "keyword2", "keyword3"]
        }
    `;

      const factResponse = await connectWithOpenAi(factPrompt, undefined, 0.5);

      if (factResponse.ok) {
        try {
          let content =
            factResponse.data.choices[0]?.message?.content?.trim() || "";

          // Remove the JSON prefix and suffix
          content = content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

          // Check if the response is a valid JSON structure
          if (content.startsWith("{") && content.endsWith("}")) {
            const metadata = JSON.parse(content);
            factsMetadata[factFileName] = {
              people: metadata.people || [],
              roles: metadata.roles || [],
              technologies: metadata.technologies || [],
              locations: metadata.locations || [],
              animals: metadata.animals || [],
              keywords: metadata.keywords || [],
            };
            console.log(`✅ Metadata for ${factFileName}:`, metadata);
          } else {
            throw new Error(
              "Response is not a valid JSON structure after cleanup.",
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to parse metadata for ${factFileName}: ${error}`,
          );
          factsMetadata[factFileName] = {
            people: [],
            roles: [],
            technologies: [],
            locations: [],
            animals: [],
            keywords: [],
          };
        }
      } else {
        console.error(`❌ Failed to process fact ${factFileName}`);
        factsMetadata[factFileName] = {
          people: [],
          roles: [],
          technologies: [],
          locations: [],
          animals: [],
          keywords: [],
        };
      }
    }

    // Keywords from reports and from facts
    const metadata: Record<string, string> = {};

    for (const filePath of allTxtFiles) {
      const fileName = path.basename(filePath);
      const fileContent = await fs.readFile(filePath, "utf-8");

      // Check related facts for metadata
      const relatedFacts = Object.entries(factsMetadata)
        .filter(([_, factData]) => {
          return (
            factData.people.some((person) => fileContent.includes(person)) ||
            factData.roles.some((role) => fileContent.includes(role)) ||
            factData.technologies.some((tech) => fileContent.includes(tech)) ||
            factData.animals.some((animal) => fileContent.includes(animal)) ||
            factData.locations.some((location) =>
              fileContent.includes(location),
            )
          );
        })
        .map(([factName, factData]) => ({
          name: factName,
          people: factData.people,
          roles: factData.roles,
          technologies: factData.technologies,
          locations: factData.locations,
          animals: factData.animals,
          keywords: factData.keywords,
        }));

      // Connect unique metadata from related facts
      const uniquePeople = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.people)),
      );
      const uniqueRoles = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.roles)),
      );
      const uniqueTechnologies = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.technologies)),
      );
      const uniqueLocations = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.locations)),
      );
      const uniqueAnimals = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.animals)),
      );
      const uniqueKeywords = Array.from(
        new Set(relatedFacts.flatMap((fact) => fact.keywords)),
      );

      const generateMetadataPrompt = `
        You are an AI assistant analyzing security incident reports. Your task is to generate meaningful keywords for the given report.

        ### Instructions:
        1. Analyze the **content of the report** and the metadata from related facts.
        2. Explicitly associate **individuals (people)** with their **roles (professions)** and **technologies** if mentioned in either the report or related facts.
        3. Ensure that keywords include:
          - **Person → Role → Technology** mappings (e.g., Barbara Zawadzka → Programista JavaScript → Python)
          - **Sectors (e.g., sektor C4)**
          - **Professions (e.g., nauczyciel, programista JavaScript)**
          - **Technological skills (e.g., JavaScript, Python)**
          - **Locations (e.g., Kraków, ul. Bracka)**
          - **Events and anomalies (e.g., incydent, eksplozje)**

        4. Ensure that relationships (e.g., Barbara Zawadzka is a JavaScript programmer) are **explicitly stated** in the keywords.

        5. Keywords must:
          - Be in **Polish**.
          - Be in **nominative case**.
          - Prioritize associations between **people → roles → technologies**.
          - Avoid duplicates or overly generic terms.

          ### Details:
        - **People:** ${uniquePeople.join(", ")}
        - **Roles:** ${uniqueRoles.join(", ")}
        - **Technologies:** ${uniqueTechnologies.join(", ")}
        - **Locations:** ${uniqueLocations.join(", ")}
        - **Animals:** ${uniqueAnimals.join(", ")}
        - **Keywords:** ${uniqueKeywords.join(", ")}

        ### Example:
        If the report mentions **Barbara Zawadzka** and the related factual document describes her as a **Frontend Developer** using **JavaScript** and **Python**, the keywords should include:
        **sektor C4, Barbara Zawadzka, programista JavaScript, Python, Kraków, ruch oporu, patrol, incydent, bezpieczeństwo, raport, technologie, automatyzacja, 2024-11-12**

        ### Report Details:
        - **File Name:** ${fileName}
        - **Report Content:**
        ${fileContent}

        ### Related Facts:
        ${relatedFacts
          .map(
            (fact, index) =>
              `Fakt ${index + 1}: Osoby: ${fact.people.join(", ")}, Role: ${fact.roles.join(
                ", ",
              )}, Technologie: ${fact.technologies.join(", ")}, Lokalizacje: ${fact.locations.join(
                ", ",
              )}, Słowa kluczowe: ${fact.keywords.join(", ")}`,
          )
          .join("\n")}

        ### Expected Response Format:
        sektor C4, Barbara Zawadzka, programista JavaScript, Python, Kraków, ul. Bracka, ruch oporu, patrol, incydent, bezpieczeństwo, raport, technologie, automatyzacja, 2024-11-12
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
