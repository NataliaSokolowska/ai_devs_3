import fs from "fs";
import path from "path";
import { constants } from "fs";

import { NodeHtmlMarkdown } from "node-html-markdown";
import { connectWithOpenAi } from "@/app/lib/openAiService";

/**
 * Generuje pełny URL obrazka na podstawie reguł.
 * @param url - Oryginalny URL obrazka (pełny lub względny)
 * @param baseUrl - Bazowy URL dla względnych ścieżek
 * @param imagePathPrefix - Opcjonalny prefiks dla ścieżki (np. /dane/i/)
 * @returns Pełny URL obrazka
 */
function generateImageUrl(
  url: string,
  baseUrl: string,
  imagePathPrefix = "/dane/i/",
): string {
  // Pobierz nazwę pliku z URL
  const fileName = path.basename(url);

  if (url.startsWith("http")) {
    // Dla pełnych URL-i, zamień tylko segment ścieżki
    const urlObject = new URL(url);
    return `${urlObject.origin}${imagePathPrefix}${fileName}`;
  }

  // Dla względnych URL-i, zbuduj pełny URL na podstawie baseUrl
  return new URL(`${imagePathPrefix}${fileName}`, baseUrl).toString();
}

async function extractImageLinksAndCaptionsFromHTML(
  html: string,
  baseUrl: string,
  imagePathPrefix = "/dane/i/",
) {
  const imageLinks: { url: string; caption: string }[] = [];
  const regex = /<img[^>]+src="([^">]+)"[^>]*>?/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = match[1]; // Ścieżka względna lub pełna
    const nextChars = html.substring(match.index, match.index + 200);
    const captionMatch = /<figcaption[^>]*>(.*)<\/figcaption>/g.exec(nextChars);

    // Generowanie pełnego URL-a za pomocą uniwersalnej funkcji
    const fullUrl = generateImageUrl(url, baseUrl, imagePathPrefix);

    if (captionMatch) {
      imageLinks.push({ url: fullUrl, caption: captionMatch[1] });
    } else {
      imageLinks.push({ url: fullUrl, caption: "" });
    }
  }

  return imageLinks;
}

async function extractAudioLinksFromHTML(html: string, baseUrl: string) {
  const audioLinks: string[] = [];

  // Wyrażenie regularne dla audio w tagu <audio> z <source>
  const audioRegex = /<audio[^>]*>.*?<source[^>]+src="([^">]+)"/g;
  let match;

  console.log("Extracting audio links...");

  // Wyciąganie linków audio z <audio>
  while ((match = audioRegex.exec(html)) !== null) {
    const fullUrl = match[1].startsWith("http")
      ? match[1]
      : `${baseUrl}${match[1]}`;
    console.log("Full audio URL from <audio>: ", fullUrl); // Logowanie URL
    audioLinks.push(fullUrl);
  }

  // Dodajemy obsługę linków w tagach <a> (jeśli są)
  const linkRegex = /<a[^>]+href="([^">]+)"[^>]*>[^<]*\.mp3[^<]*<\/a>/g;

  while ((match = linkRegex.exec(html)) !== null) {
    const fullUrl = match[1].startsWith("http")
      ? match[1]
      : `${baseUrl}${match[1]}`;
    console.log("Full audio URL from <a>: ", fullUrl); // Logowanie URL
    audioLinks.push(fullUrl);
  }

  console.log("Extracted audio links:", audioLinks);
  return audioLinks;
}

export async function convertHtmlToMarkdown(html: string, baseUrl: string) {
  // Konwertujemy HTML na Markdown
  const nhm = new NodeHtmlMarkdown();
  let markdown = nhm.translate(html);

  // Wyciągamy obrazki i audio
  const imageLinks = await extractImageLinksAndCaptionsFromHTML(html, baseUrl);
  const audioLinks = await extractAudioLinksFromHTML(html, baseUrl);

  console.log("audioLinks", audioLinks);

  // Dodajemy obrazki do Markdowna
  if (imageLinks.length > 0) {
    markdown += "\n### Images:\n";
    for (const link of imageLinks) {
      markdown += `![${link.caption}](${link.url})\n`;
    }
  }

  // Dodajemy audio do Markdowna
  if (audioLinks.length > 0) {
    markdown += "\n### Audio:\n";
    for (const link of audioLinks) {
      markdown += `[Audio](${link})\n`;
    }
  }

  return markdown;
}

export async function saveMarkdownToFile(markdown: string, fileName: string) {
  const taskFolder = path.join(process.cwd(), "app", "tasks", "S02E05");

  const filePath = path.join(taskFolder, fileName);

  // Sprawdzamy, czy folder istnieje, jeśli nie - tworzymy go
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  // Zapisujemy plik Markdown
  await fs.promises.writeFile(filePath, markdown, "utf8");
}

export async function downloadAndSaveImage(
  imageUrl: string,
  outputDir: string,
): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${imageUrl}`);
    }

    // Pobierz nazwę pliku z URL
    const imageName = path.basename(new URL(imageUrl).pathname);
    const imagePath = path.join(outputDir, imageName);

    // Stwórz katalog, jeśli nie istnieje
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Pobierz zawartość obrazka
    const imageBuffer = await response.arrayBuffer();

    // Zapisz plik
    await fs.promises.writeFile(imagePath, Buffer.from(imageBuffer));

    return imagePath;
  } catch (error) {
    console.error(`Error downloading image: ${imageUrl}`, error);
    throw error;
  }
}

// Funkcja do aktualizacji ścieżek obrazów w Markdown
export function updateImagePathsInMarkdown(
  markdownContent: string,
  imageMap: Record<string, string>,
): string {
  // 1. Aktualizacja sekcji `### Images:`
  let updatedMarkdown = markdownContent.replace(
    /!\[.*?\]\((https:\/\/[^)]+)\)/g,
    (match, url) => {
      if (imageMap[url]) {
        return match.replace(url, imageMap[url]);
      }
      return match;
    },
  );

  // 2. Aktualizacja ścieżek względnych `![](i/...)`
  updatedMarkdown = updatedMarkdown.replace(
    /!\[\]\(i\/([^)\s]+)\)/g,
    (match, relativePath) => {
      const matchedUrl = Object.keys(imageMap).find((url) =>
        url.includes(relativePath),
      );

      if (matchedUrl && imageMap[matchedUrl]) {
        return `![](${imageMap[matchedUrl]})`;
      }
      return match;
    },
  );

  return updatedMarkdown;
}

/**
 * Pobiera i zapisuje plik audio do podanego katalogu.
 * @param audioUrl - URL pliku audio
 * @param outputDir - Katalog docelowy dla pliku audio
 * @returns Ścieżka lokalna zapisanego pliku audio
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

    // Pobierz nazwę pliku z URL
    const audioName = path.basename(new URL(audioUrl).pathname);
    const audioPath = path.join(outputDir, audioName);

    // Stwórz katalog, jeśli nie istnieje
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Pobierz zawartość pliku audio
    const audioBuffer = await response.arrayBuffer();

    // Zapisz plik audio
    await fs.promises.writeFile(audioPath, Buffer.from(audioBuffer));

    return audioPath;
  } catch (error) {
    console.error(`Error downloading audio: ${audioUrl}`, error);
    throw error;
  }
}

/**
 * Generuje pełny URL pliku audio na podstawie reguł.
 * @param url - Oryginalny URL pliku audio (pełny lub względny)
 * @param baseUrl - Bazowy URL dla względnych ścieżek
 * @param audioPathPrefix - Opcjonalny prefiks dla ścieżki (np. /dane/i/)
 * @returns Pełny URL pliku audio
 */
function generateAudioUrl(
  url: string,
  baseUrl: string,
  audioPathPrefix = "/dane/i/",
): string {
  // Pobierz nazwę pliku z URL
  const fileName = path.basename(url);

  if (url.startsWith("http")) {
    // Dla pełnych URL-i, zamień tylko segment ścieżki
    const urlObject = new URL(url);
    return `${urlObject.origin}${audioPathPrefix}${fileName}`;
  }

  // Dla względnych URL-i, zbuduj pełny URL na podstawie baseUrl
  return new URL(`${audioPathPrefix}${fileName}`, baseUrl).toString();
}

/**
 * Wyodrębnia URL-e plików audio z treści Markdown i generuje poprawne ścieżki.
 * @param markdownContent - Treść pliku Markdown
 * @param baseUrl - Bazowy URL do przetwarzania względnych ścieżek
 * @returns Tablica poprawnych URL-i plików audio
 */
export function extractAudioLinksFromMarkdown(
  markdownContent: string,
  baseUrl: string,
): string[] {
  const audioRegex = /\[Audio\]\((https:\/\/[^)]+\.mp3)\)/g;
  const audioLinks: string[] = [];
  let match;

  while ((match = audioRegex.exec(markdownContent)) !== null) {
    const fullUrl = generateAudioUrl(match[1], baseUrl, "/dane/i/");
    audioLinks.push(fullUrl);
  }

  return audioLinks;
}

/**
 * Sprawdza, czy plik istnieje w podanej ścieżce.
 * @param filePath Ścieżka do pliku.
 * @returns Boolean - `true`, jeśli plik istnieje, w przeciwnym razie `false`.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, constants.F_OK);
    return true; // Plik istnieje
  } catch {
    return false; // Plik nie istnieje
  }
}

/**
 * Analizuje obraz i zwraca opis zawartości.
 * @param filePath Ścieżka do pliku obrazu.
 * @param instruction Instrukcja dla AI dotycząca analizy obrazu.
 * @returns Tekstowy opis zawartości obrazu.
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

  // Sprawdź, czy plik z analizą już istnieje
  const analysisExists = await fileExists(analysisPath);

  if (analysisExists) {
    return await fs.promises.readFile(analysisPath, "utf-8");
  }

  // Wczytaj obraz i skonwertuj na base64
  const fileBuffer = await fs.promises.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");

  // Wiadomość dla AI
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

  // Wysłanie do OpenAI
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
 * Wstrzykuje opisy obrazów do odpowiednich sekcji w Markdown.
 * @param markdownContent - Zawartość Markdown.
 * @param imageDescriptions - Tablica opisów obrazów.
 * @returns Zaktualizowany Markdown z opisami obrazów.
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
