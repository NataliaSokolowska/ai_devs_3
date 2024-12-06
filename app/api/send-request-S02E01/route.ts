import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { connectWithOpenAi, transcribeAudio } from "@/app/lib/openAiService";
import { downloadAndExtract } from "../unzip-data/route";

// Method to ensure that the files exist
async function ensureFilesExist(
  folderPath: string,
  url: string,
): Promise<void> {
  try {
    await fs.mkdir(folderPath, { recursive: true });

    const files = await fs.readdir(folderPath);
    if (files.length === 0) {
      await downloadAndExtract(url, folderPath);
    }
  } catch (error) {
    console.error(
      `Folder ${folderPath} does not exist or is inaccessible. Downloading...`,
      error,
    );
    await downloadAndExtract(url, folderPath);
  }
}

// Method to get existing or new transcriptions
async function getExistingOrNewTranscriptions(
  audioFiles: string[],
  audioPath: string,
  transcriptionFolder: string,
): Promise<string[]> {
  const transcriptions: string[] = [];
  const transcriptionFiles = await fs.readdir(transcriptionFolder);

  for (const fileName of audioFiles) {
    const audioFilePath = path.join(audioPath, fileName);
    const baseName = path.parse(fileName).name;

    const transcriptionFileName = `${baseName}.txt`;
    const transcriptionFilePath = path.join(
      transcriptionFolder,
      transcriptionFileName,
    );

    //If transcription file exists, read it, else transcribe the audio
    if (transcriptionFiles.includes(transcriptionFileName)) {
      const existingTranscription = await fs.readFile(
        transcriptionFilePath,
        "utf-8",
      );
      transcriptions.push(existingTranscription);
    } else {
      try {
        const fileBuffer = await fs.readFile(audioFilePath);
        const file = new File([fileBuffer], fileName);

        const result = await transcribeAudio(file);
        if (result.ok) {
          const transcription = result.data.text;

          // Save transcription to file
          await fs.writeFile(transcriptionFilePath, transcription, "utf-8");
          transcriptions.push(transcription);
        } else {
          console.error(
            `Transcription failed for file: ${fileName}`,
            result.error,
          );
          throw new Error(`Failed to transcribe file: ${fileName}`);
        }
      } catch (err) {
        console.error(`Error reading or transcribing file: ${fileName}`, err);
        throw new Error(`Failed to process file: ${fileName}`);
      }
    }
  }

  return transcriptions;
}

export async function POST(req: Request) {
  try {
    // Get audio URL and path from the request
    const { audioUrl, audioPath } = await req.json();

    if (!audioUrl || !audioPath) {
      return NextResponse.json(
        { error: "Missing required parameters: audioUrl or transcriptionUrl" },
        { status: 400 },
      );
    }

    //Set the audio folder path and transcription folder path
    const audioFolderPath = path.resolve(audioPath, "../audio");
    const transcriptionFolder = path.resolve(audioPath, "../transcriptions");

    await ensureFilesExist(audioFolderPath, audioUrl);

    // Get all audio files in the folder
    const audioFilesNames = await fs.readdir(audioFolderPath);
    if (audioFilesNames.length === 0) {
      return NextResponse.json({ error: "No audio files found" });
    }
    // Create the transcription folder if it does not exist
    await fs.mkdir(transcriptionFolder, { recursive: true });
    // Get existing or new transcriptions
    const transcriptions = await getExistingOrNewTranscriptions(
      audioFilesNames,
      audioFolderPath,
      transcriptionFolder,
    );

    if (transcriptions.length === 0) {
      return NextResponse.json({ error: "No transcriptions available." });
    }

    const context = transcriptions.join("\n");
    //     const systemPrompt = `
    // <objective>
    // Determine the specific street on which the university's specific institute, where Andrzej Maj lectures, is located, based on the provided testimonies.
    // </objective>

    // <rules>
    // 1. Take a deep breath.
    // 2. Think in Polish.
    // 3. Avoid directly searching for street names in the testimonies. Deduce the name at the final step.
    // 4. Follow this reasoning process:
    //    - Step 1: Identify the city where Andrzej Maj works.
    //    - Step 2: Identify the university where Andrzej Maj works.
    //    - Step 3: Identify the specific institute or department where Andrzej Maj works.
    //    - Step 4: Using your internal knowledge, determine the street name associated with the institute from Step 3.
    // 5. Combine information hierarchically and logically.
    // 6. If no valid answer can be determined, respond with: "No specific location found in the provided information."
    // </rules>

    // <output>
    // - Step 1: [City]
    // - Step 2: [University]
    // - Step 3: [Institute/Department]
    // - Step 4: [Street Name or "No specific location found in the provided information."]
    // </output>
    // `;

    const systemPrompt = `
Be my assistant, conducting logical reasoning in Polish. Your goal is to provide a specific answer based on testimonies, considering both general suggestions and detailed hints to combine all workplace components. You will receive testimonies from various people, each marked with <person>...</person>.
Question: What is the name of the street where Andrzej Maj works?
Reasoning Process:
No Direct Street Name Search: Avoid looking directly for any street names mentioned in testimonies. Instead, conclude the street name at the final step.
General and Specific Workplaces:
Broad Suggestions: Look for any high-level workplace mentions, such as universities, cities, or fields of study.
Detailed Identifiers: Also, find specific workplace elements such as department names, institutes, or faculty. Aim to extract the workplace name without generalizing to “main place” alone.
Hierarchy of Place Names:
Gather all relevant terms that describe the workplace, arranging them hierarchically to create a precise, detailed workplace name.
Combine Information: Using your general knowledge, combine these elements into the most complete, specific name of Andrzej Maj’s workplace without any unnecessary generalization.
Street Identification: With the exact workplace name established, identify the associated street name from your general knowledge of Polish universities and institutions.
Output: Provide only the street name where Andrzej Maj works.`;

    // Connect with OpenAI to get the answer
    const response = await connectWithOpenAi(context, systemPrompt, 0.5);
    if (!response.ok) {
      console.error(
        "AI failed to generate an answer:",
        response.error || "Unknown error",
      );
      return NextResponse.json({
        error: "AI failed to generate an answer.",
        details: response.error || "Unknown error",
      });
    }

    const aiAnswer =
      response.data?.choices?.[0]?.message?.content || "No response from AI";

    const reportData = {
      task: "mp3",
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
