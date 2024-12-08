import { promises as fs, Stats } from "fs";

import path from "path";
import {
  connectWithOpenAi,
  transcribeAudio,
  TranscriptionResult,
} from "../openAiService";

export const sanitizeFileNames = (files: string[]): string[] => {
  const sanitized = files.map((file) => {
    if (file.endsWith(".png.txt")) {
      return file.replace(".png.txt", ".png");
    }
    if (file.endsWith(".mp3.txt")) {
      return file.replace(".mp3.txt", ".mp3");
    }
    if (file.endsWith(".txt") && !file.includes(".")) {
      return file.replace(".txt", "");
    }
    return file;
  });

  //Remove duplicates and sort the array
  return Array.from(new Set(sanitized)).sort();
};

export async function getAllFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? getAllFiles(res) : res;
    }),
  );
  return Array.prototype.concat(...files);
}

export async function ensureFolderExists(folderPath: string): Promise<void> {
  try {
    await fs.access(folderPath);
  } catch {
    await fs.mkdir(folderPath, { recursive: true });
  }
}

async function processTextFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf-8");
}

async function processImageFile(
  filePath: string,
  outputDirectory: string,
): Promise<string> {
  const file = path.basename(filePath);
  const extractedTextPath = path.join(
    outputDirectory,
    "extracted_text",
    `${file}.txt`,
  );

  const textExists = await fs
    .access(extractedTextPath)
    .then(() => true)
    .catch(() => false);

  if (textExists) {
    return await fs.readFile(extractedTextPath, "utf-8");
  }

  const fileBuffer = await fs.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");

  const userMessage = [
    {
      type: "text",
      text: "Return whole text found on the image. Be precise and pull all the text you can. Return the text only without any comments.",
    },
    {
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${base64Image}`,
      },
    },
  ];

  const response = await connectWithOpenAi(userMessage);

  if (!response.ok) {
    throw new Error(
      `Failed to extract text from PNG file. Error: ${response.error}`,
    );
  }

  const extractedText =
    response.data.choices[0]?.message?.content?.trim() || "";
  await ensureFolderExists(path.dirname(extractedTextPath));
  await fs.writeFile(extractedTextPath, extractedText, "utf-8");

  return extractedText;
}

export async function processAudioFile(
  filePath: string,
  outputDirectory: string,
): Promise<string> {
  const file = path.basename(filePath);
  const transcriptPath = path.join(
    outputDirectory,
    "transcripts",
    `${file}.txt`,
  );

  const transcriptExists = await fs
    .access(transcriptPath)
    .then(() => true)
    .catch(() => false);

  if (transcriptExists) {
    return await fs.readFile(transcriptPath, "utf-8");
  }

  const fileBuffer = await fs.readFile(filePath);
  const audioFile = new File([fileBuffer], file, {
    type: "audio/mpeg",
  });

  const transcriptionResult: TranscriptionResult =
    await transcribeAudio(audioFile);
  if (!transcriptionResult.ok || !transcriptionResult.data?.text) {
    throw new Error(
      `Failed to transcribe audio file. Error: ${transcriptionResult.error || "Unknown error"}`,
    );
  }

  const transcription = transcriptionResult.data.text;
  await ensureFolderExists(path.dirname(transcriptPath));
  await fs.writeFile(transcriptPath, transcription, "utf-8");

  return transcription;
}

export async function processFileContent(
  filePath: string,
  ext: string,
  outputDirectory: string,
): Promise<string> {
  switch (ext) {
    case ".txt":
      return await processTextFile(filePath);
    case ".png":
      return await processImageFile(filePath, outputDirectory);
    case ".mp3":
      return await processAudioFile(filePath, outputDirectory);
    default:
      return "";
  }
}

export async function removeUnwantedEntries(
  filePath: string,
  fileStat: Stats,
  unwantedDirectories: string[],
  unwantedFiles: string[],
): Promise<boolean> {
  const fileName = path.basename(filePath).toLowerCase();

  if (fileStat.isDirectory() && unwantedDirectories.includes(fileName)) {
    await fs.rm(filePath, { recursive: true, force: true });
    return true;
  }

  if (fileStat.isFile() && unwantedFiles.includes(fileName)) {
    await fs.unlink(filePath);
    return true;
  }

  return false;
}

export const getTargetFolder = (
  baseFolder: string,
  ext: string,
): string | null => {
  const folderMapping: Record<string, string> = {
    ".txt": "text",
    ".png": "images",
    ".mp3": "audio",
    ".m4a": "audio",
  };

  return folderMapping[ext] ? path.join(baseFolder, folderMapping[ext]) : null;
};

async function moveFileToFolder(
  filePath: string,
  targetFolder: string,
): Promise<void> {
  try {
    await fs.mkdir(targetFolder, { recursive: true });
    const destinationPath = path.join(targetFolder, path.basename(filePath));
    await fs.rename(filePath, destinationPath);
  } catch (error) {
    console.error(`Failed to move file: ${filePath} to ${targetFolder}`, error);
  }
}

export async function segregateFiles(
  baseFolder: string,
  unwantedDirectories: string[] = ["facts", "weapons_tests"],
  unwantedFiles: string[] = ["weapons_tests.zip"],
): Promise<void> {
  const files = await fs.readdir(baseFolder);

  for (const file of files) {
    const filePath = path.join(baseFolder, file);
    const fileStat = await fs.stat(filePath);

    const isRemoved = await removeUnwantedEntries(
      filePath,
      fileStat,
      unwantedDirectories,
      unwantedFiles,
    );
    if (isRemoved) continue;

    if (fileStat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      const targetFolder = getTargetFolder(baseFolder, ext);

      if (targetFolder) {
        await moveFileToFolder(filePath, targetFolder);
      } else {
        await fs.unlink(filePath);
      }
    }
  }
}
