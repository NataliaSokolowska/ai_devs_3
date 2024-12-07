import { NextResponse } from "next/server";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import AdmZip from "adm-zip";
import { Readable } from "stream";

function convertReadableStreamToNodeReadable(
  webStream: ReadableStream<Uint8Array>,
): Readable {
  const reader = webStream.getReader();

  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
      } else {
        this.push(Buffer.from(value));
      }
    },
  });
}

//Method to download and extract the zip file
async function downloadAndExtract(
  url: string,
  outputDirectory: string,
): Promise<void> {
  const tempFilePath = path.join("/tmp", `downloaded-file-${Date.now()}.zip`);

  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to fetch file from ${url}. Status: ${response.status}`,
    );
  }

  const nodeReadableStream = convertReadableStreamToNodeReadable(response.body);

  const fileStream = createWriteStream(tempFilePath);

  await pipeline(nodeReadableStream, fileStream);

  const fileExists = await fs.stat(tempFilePath).catch(() => null);
  if (!fileExists) {
    throw new Error(`Temporary ZIP file not found: ${tempFilePath}`);
  }

  const zip = new AdmZip(tempFilePath);
  await fs.mkdir(outputDirectory, { recursive: true });

  try {
    zip.extractAllTo(outputDirectory, true);
  } catch (error) {
    console.error(`Failed to extract ZIP file: ${error}`);
    throw error;
  }

  await fs.unlink(tempFilePath);
}

export async function ensureFilesExist(
  folderPath: string,
  url: string,
  forceDownload = false, //Optional param to force download
): Promise<void> {
  try {
    await fs.mkdir(folderPath, { recursive: true });

    const files = await fs.readdir(folderPath);
    if (forceDownload || files.length === 0) {
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

//Method to handle POST request
export async function POST(req: Request) {
  try {
    const { url, outputDirectory } = await req.json();

    if (!url || !outputDirectory) {
      return NextResponse.json(
        { error: "Missing required parameters: url or outputDirectory" },
        { status: 400 },
      );
    }

    await downloadAndExtract(url, outputDirectory);

    return NextResponse.json({
      message: "File downloaded and extracted successfully",
      extractedPath: path.resolve(outputDirectory),
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to download or extract file" },
      { status: 500 },
    );
  }
}
