import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { connectWithOpenAi, transcribeAudio } from "@/app/lib/openAiService";

const AUDIO_FOLDER_PATH = path.resolve("app/tasks/S02E01/audio");
const TRANSCRIPTION_FOLDER_PATH = path.resolve(
  "app/tasks/S02E01/transcriptions",
);

async function getOrTranscribeFile(file: File): Promise<string> {
  try {
    const transcriptionFilePath = path.join(
      TRANSCRIPTION_FOLDER_PATH,
      `${file.name}.txt`,
    );

    try {
      const existingTranscription = await fs.readFile(
        transcriptionFilePath,
        "utf-8",
      );
      return existingTranscription;
    } catch {
      console.error(
        `No transcription found for file: ${file.name}, transcribing...`,
      );
    }

    const result = await transcribeAudio(file);
    if (result.ok) {
      const transcription = result.data.text;

      await fs.writeFile(transcriptionFilePath, transcription, "utf-8");
      return transcription;
    }
    console.error(`Transcription failed for file: ${file.name}`, result.error);
    throw new Error(`Failed to transcribe file: ${file.name}`);
  } catch (error) {
    console.error("Error during transcription process:", error);
    throw error;
  }
}

async function processAudioFiles(files: File[]): Promise<string[]> {
  const transcriptions: string[] = [];

  for (const file of files) {
    try {
      const transcription = await getOrTranscribeFile(file);
      transcriptions.push(transcription);
    } catch (error) {
      console.error("Error processing file:", file.name, error);
    }
  }

  return transcriptions;
}

async function getAudioFiles(): Promise<File[]> {
  try {
    const fileNames = await fs.readdir(AUDIO_FOLDER_PATH);
    const files: File[] = [];

    for (const fileName of fileNames) {
      const filePath = path.join(AUDIO_FOLDER_PATH, fileName);
      const fileBuffer = await fs.readFile(filePath);
      const file = new File([fileBuffer], fileName);
      files.push(file);
    }

    return files;
  } catch (error) {
    console.error("Error reading audio files:", error);
    throw new Error("Failed to read audio files");
  }
}

export async function POST() {
  try {
    await fs.mkdir(TRANSCRIPTION_FOLDER_PATH, { recursive: true });

    const audioFiles = await getAudioFiles();
    if (audioFiles.length === 0) {
      return NextResponse.json({ error: "No audio files found" });
    }

    const transcriptions = await processAudioFiles(audioFiles);

    if (transcriptions.length === 0) {
      console.error("No transcriptions available for processing.");
      return NextResponse.json({ error: "No transcriptions available." });
    }

    const context = transcriptions.join("\n");
    const systemPrompt = `
      <objective>
      Determine the specific street on which the university's specific institute, where Andrzej Maj lectures, is located.
      </objective>
      <rules>
      1. Take a deep breath.
      2. Thinking in Polish.
      3. Use all provided transcriptions and your internal knowledge to deduce the specific institute's location, even if the exact street name is not explicitly mentioned.
      4. Focus on identifying the street associated with the institute where Andrzej Maj lectures, rather than the university's main address.
      5. If conflicting information is present, evaluate and choose the most plausible answer based on consistency and probability.
      6. Think aloud as you analyze the information, but your final answer must only contain the name of the street.
      7. Avoid guessing arbitrarily. Base your answer on logical deduction from the provided transcriptions and your internal knowledge.
      </rules>
      <result>
      Return only the name of the street where the specific institute is located. Do not include explanations, assumptions, or commentary in your final output.
      </result>
    `;

    const response = await connectWithOpenAi(context, systemPrompt);
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
