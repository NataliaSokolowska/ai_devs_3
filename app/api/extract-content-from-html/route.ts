import fs from "fs";
import path from "path";
import { constants } from "fs";

import { NodeHtmlMarkdown } from "node-html-markdown";
import { connectWithOpenAi } from "@/app/lib/openAiService";

/**
 * Generates a full file URL based on rules.
 * @param url - Original file URL (absolute or relative).
 * @param baseUrl - Base URL for relative paths.
 * @param pathPrefix - Path prefix (e.g., /dane/i/).
 * @returns Full file URL.
 */
function generateFileUrl(
  url: string,
  baseUrl: string,
  pathPrefix = "/dane/i/",
): string {
  const fileName = path.basename(url);

  if (url.startsWith("http")) {
    const urlObject = new URL(url);
    return `${urlObject.origin}${pathPrefix}${fileName}`;
  }

  return new URL(`${pathPrefix}${fileName}`, baseUrl).toString();
}

/**
 * Extracts file links from HTML or Markdown.
 * @param html - HTML or Markdown content.
 * @param baseUrl - Base URL for relative paths.
 * @param regex - Regular expression for extracting links.
 * @param pathPrefix - Path prefix for links.
 * @returns Array of file URLs.
 */
export function extractLinksFromHTML(
  html: string,
  baseUrl: string,
  regex: RegExp,
  pathPrefix: string,
): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while (true) {
    match = regex.exec(html);
    if (!match) break;

    const url = match[1];
    const fullUrl = url.startsWith("http")
      ? `${new URL(url).origin}${pathPrefix}${path.basename(url)}`
      : generateFileUrl(url, baseUrl, pathPrefix);

    links.push(fullUrl);
  }

  return links;
}

/**
 * Converts HTML content to Markdown.
 * @param html - HTML content.
 * @param baseUrl - Base URL for relative paths.
 * @returns Converted Markdown content.
 */
export async function convertHtmlToMarkdown(html: string, baseUrl: string) {
  // Konwertujemy HTML na Markdown
  const nhm = new NodeHtmlMarkdown();
  let markdown = nhm.translate(html);

  // Wyciągamy obrazki i audio
  const imageLinks = extractLinksFromHTML(
    html,
    baseUrl,
    /<img[^>]+src="([^">]+)"[^>]*>?/g,
    "/dane/i/",
  );
  const audioLinks = [
    ...extractLinksFromHTML(
      html,
      baseUrl,
      /<audio[^>]*>.*?<source[^>]+src="([^">]+)"/g,
      "/dane/i/",
    ),
    ...extractLinksFromHTML(
      html,
      baseUrl,
      /<a[^>]+href="([^">]+\.mp3)"[^>]*>/g,
      "/dane/i/",
    ),
  ];

  // Add images to Markdown
  if (imageLinks.length > 0) {
    markdown += "\n### Images:\n";
    for (const link of imageLinks) {
      markdown += `![${path.basename(link)}](${link})\n`;
    }
  }

  // Add audio to Markdown
  if (audioLinks.length > 0) {
    markdown += "\n### Audio:\n";
    for (const link of audioLinks) {
      markdown += `[Audio](${link})\n`;
    }
  }

  return markdown;
}

/**
 * Saves Markdown content to a file.
 * @param markdown - Markdown content.
 * @param fileName - Name of the file.
 */
export async function saveMarkdownToFile(markdown: string, fileName: string) {
  const taskFolder = path.join(process.cwd(), "app", "tasks", "S02E05");

  const filePath = path.join(taskFolder, fileName);

  // Create directory if it doesn't exist
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  // Save the file with Markdown content
  await fs.promises.writeFile(filePath, markdown, "utf8");
}

/**
 * Downloads and saves an image file.
 * @param imageUrl - URL of the image.
 * @param outputDir - Directory to save the image.
 * @returns Local path of the saved image.
 */
export async function downloadAndSaveImage(
  imageUrl: string,
  outputDir: string,
): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${imageUrl}`);
    }

    // Get image name and path
    const imageName = path.basename(new URL(imageUrl).pathname);
    const imagePath = path.join(outputDir, imageName);

    // Create directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Download image
    const imageBuffer = await response.arrayBuffer();

    // Save image to file
    await fs.promises.writeFile(imagePath, Buffer.from(imageBuffer));

    return imagePath;
  } catch (error) {
    console.error(`Error downloading image: ${imageUrl}`, error);
    throw error;
  }
}

/**
 * Updates file paths in Markdown.
 * @param markdownContent - Markdown content.
 * @param fileMap - Mapping of old URLs to new paths.
 * @returns Updated Markdown content.
 */
export function updateFilePathsInMarkdown(
  markdownContent: string,
  fileMap: Record<string, string>,
): string {
  // Update image paths
  let updatedMarkdown = markdownContent.replace(
    /!\[.*?\]\((https:\/\/[^)]+)\)/g,
    (match, url) => {
      return fileMap[url] ? `![${path.basename(url)}](${fileMap[url]})` : match;
    },
  );

  // Update audio paths
  updatedMarkdown = updatedMarkdown.replace(
    /!\[\]\(i\/([^)\s]+)\)/g,
    (match, relativePath) => {
      const matchedUrl = Object.keys(fileMap).find((url) =>
        url.includes(relativePath),
      );
      return matchedUrl && fileMap[matchedUrl]
        ? `![](${fileMap[matchedUrl]})`
        : match;
    },
  );

  return updatedMarkdown;
}

/**
 * Downloads and saves an audio file.
 * @param audioUrl - URL of the audio file.
 * @param outputDir - Directory to save the audio.
 * @returns Local path of the saved audio file.
 */
export async function downloadAndSaveAudio(
  audioUrl: string,
  outputDir: string,
): Promise<string> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${audioUrl}`);
    }

    const audioName = path.basename(new URL(audioUrl).pathname);
    const audioPath = path.join(outputDir, audioName);

    await fs.promises.mkdir(outputDir, { recursive: true });
    const audioBuffer = await response.arrayBuffer();
    await fs.promises.writeFile(audioPath, Buffer.from(audioBuffer));

    return audioPath;
  } catch (error) {
    console.error(`Error downloading audio: ${audioUrl}`, error);
    throw error;
  }
}

/**
 * Extracts audio file links from Markdown content.
 * @param markdownContent - Markdown content containing audio links.
 * @param baseUrl - Base URL for relative paths.
 * @returns Array of full URLs for audio files.
 */
export function extractAudioLinksFromMarkdown(
  markdownContent: string,
  baseUrl: string,
): string[] {
  const audioRegex = /\[Audio\]\((https:\/\/[^)]+\.mp3)\)/g;
  const audioLinks: string[] = [];
  let match: RegExpExecArray | null = audioRegex.exec(markdownContent);

  while (match !== null) {
    const fullUrl = generateFileUrl(match[1], baseUrl, "/dane/i/");
    audioLinks.push(fullUrl);
    match = audioRegex.exec(markdownContent);
  }
  return audioLinks;
}

/**
 * Checks if a file exists.
 * @param filePath - Path to the file.
 * @returns Boolean indicating if the file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyzes image content using AI.
 * @param filePath - Path to the image file.
 * @param instruction - Instruction for the AI analysis.
 * @returns Text description of the image content.
 */
export async function analyzeImageContent(
  filePath: string,
  instruction: string,
): Promise<string> {
  const file = path.basename(filePath);
  const analysisPath = path.join(
    path.dirname(filePath),
    "analysis",
    `${file}.txt`,
  );

  // Check if analysis already exists
  const analysisExists = await fileExists(analysisPath);

  if (analysisExists) {
    return await fs.promises.readFile(analysisPath, "utf-8");
  }

  // Read image file and convert to base64
  const fileBuffer = await fs.promises.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");

  // Prepare user message
  const userMessage = [
    {
      type: "text",
      text: instruction,
    },
    {
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${base64Image}`,
      },
    },
  ];

  // Connect with OpenAI API
  const response = await connectWithOpenAi(userMessage);

  if (!response.ok) {
    throw new Error(
      `Failed to analyze image content. Error: ${response.error}`,
    );
  }

  const extractedDescription =
    response.data.choices[0]?.message?.content?.trim() || "";
  await fs.promises.mkdir(path.dirname(analysisPath), { recursive: true });
  await fs.promises.writeFile(analysisPath, extractedDescription, "utf-8");

  return extractedDescription;
}

/**
 * Injects image descriptions into Markdown.
 * @param markdownContent - Markdown content.
 * @param imageDescriptions - Array of image descriptions.
 * @returns Updated Markdown content with descriptions.
 */
export function injectImageDescriptionsIntoMarkdown(
  markdownContent: string,
  imageDescriptions: string[],
): string {
  const imageRegex = /!\[\]\(\.\/images\/[^\)]+\)/g;
  let index = 0;

  return markdownContent.replace(imageRegex, (match) => {
    const description = imageDescriptions[index] || "No description available";
    index++;
    return `${match}\n**Description:** ${description}`;
  });
}
