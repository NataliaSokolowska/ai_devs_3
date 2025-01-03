import { NextResponse } from "next/server";
import { connectWithOpenAi } from "@/app/lib/openAiService";
import {
  analyzeImageContent,
  convertHtmlToMarkdown,
  downloadAndSaveAudio,
  downloadAndSaveImage,
  extractAudioLinksFromMarkdown,
  injectImageDescriptionsIntoMarkdown,
  saveMarkdownToFile,
  updateImagePathsInMarkdown,
} from "../extract-content-from-html/route";

import path from "path";
import fs from "fs";
import { processAudioFile } from "@/app/lib/utils/utils";

export async function POST(req: Request) {
  try {
    const { questionUrl, informationUrl, outputDirectory } = await req.json();

    if (!questionUrl || !informationUrl || !outputDirectory) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: questionUrl, informationUrl or outputDirectory",
        },
        { status: 400 },
      );
    }
    // 1. Pobierz treść HTML i skonwertuj na Markdown
    const informationResponse = await fetch(informationUrl);
    if (!informationResponse.ok) {
      throw new Error(
        `Failed to fetch information content. Status: ${informationResponse.status}`,
      );
    }
    const htmlContent = await informationResponse.text();
    const baseUrl = informationUrl.replace(/\/[^/]+$/, "");
    const markdownContent = await convertHtmlToMarkdown(htmlContent, baseUrl);

    // 2. Zapisz plik Markdown
    const markdownFilePath = path.join(outputDirectory, "converted_content.md");
    await saveMarkdownToFile(markdownContent, markdownFilePath);

    // 3. Pobierz i zapisz obrazy
    const imageOutputDir = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E05",
      "files",
      "images",
    );

    const imageUrls = [
      ...markdownContent.matchAll(/!\[.*?\]\((https:\/\/[^)]+)\)/g),
    ].map((match) => match[1]);
    const imageMap: Record<string, string> = {};

    for (const imageUrl of imageUrls) {
      const localImagePath = await downloadAndSaveImage(
        imageUrl,
        imageOutputDir,
      );
      imageMap[imageUrl] = `./images/${path.basename(localImagePath)}`;
    }

    // 4. Zaktualizuj ścieżki obrazów w Markdown
    const updatedMarkdownContent = updateImagePathsInMarkdown(
      markdownContent,
      imageMap,
    );

    // 5. Analiza obrazów
    const analyzedImages: string[] = [];
    for (const imageUrl of imageUrls) {
      const localImagePath = path.join(imageOutputDir, path.basename(imageUrl));
      try {
        const description = await analyzeImageContent(
          localImagePath,
          "Identify the specific object or food item in this image. Be concise and provide one-word answer if possible. Return the answer in Polsh.",
        );
        analyzedImages.push(description);
      } catch (error) {
        console.error(`Failed to analyze image: ${localImagePath}`, error);
      }
    }

    const imageAnalysisResults = analyzedImages.join("\n");

    // 6. Pobierz i zapisz pliki audio
    const audioOutputDir = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E05",
      "files",
      "audio",
    );
    const audioUrls = extractAudioLinksFromMarkdown(markdownContent, baseUrl);
    const audioMap: Record<string, string> = {};

    for (const audioUrl of audioUrls) {
      const localAudioPath = await downloadAndSaveAudio(
        audioUrl,
        audioOutputDir,
      );
      audioMap[audioUrl] = `./audio/${path.basename(localAudioPath)}`;
    }

    // 7. Transkrypcja plików audio
    const updatedMarkdownWithAudio = updatedMarkdownContent.replace(
      /\[Audio\]\((https:\/\/[^)]+\.mp3)\)/g,
      (match, url) => {
        if (audioMap[url]) {
          return `[Audio](${audioMap[url]})`;
        }
        return match;
      },
    );

    // 8. Wstrzykiwanie opisów obrazów do Markdowna
    const updatedMarkdownWithDescriptions = injectImageDescriptionsIntoMarkdown(
      updatedMarkdownWithAudio,
      analyzedImages,
    );

    // Zapisz zaktualizowany Markdown
    await saveMarkdownToFile(updatedMarkdownWithDescriptions, markdownFilePath);

    // 9. Transkrypcja plików audio
    const transcriptionFolder = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E05",
      "files",
      "transcriptions",
    );
    await fs.promises.mkdir(transcriptionFolder, { recursive: true });

    const audioFiles = await fs.promises.readdir(audioOutputDir);
    const transcriptions: string[] = [];
    for (const fileName of audioFiles) {
      const audioFilePath = path.join(audioOutputDir, fileName);
      try {
        const transcription = await processAudioFile(
          audioFilePath,
          transcriptionFolder,
        );
        transcriptions.push(transcription);
      } catch (err) {
        console.error(`Failed to process file: ${fileName}`, err);
      }
    }

    const transcriptionContext = transcriptions.join("\n");

    // 10. Pobranie pytań z questionUrl
    const questionResponse = await fetch(questionUrl);
    if (!questionResponse.ok) {
      throw new Error(
        `Failed to fetch questions. Status: ${questionResponse.status}`,
      );
    }
    const questionsText = await questionResponse.text();
    const questions = questionsText.split("\n").map((q) => q.trim());

    // 11. Generowanie odpowiedzi
    const answers: Record<string, string> = {};

    for (const question of questions) {
      if (!question) {
        console.warn("Skipping empty question.");
        continue;
      }

      const prompt = `
You are an AI assistant tasked with answering questions based on the provided content, images, and audio transcripts. Use the following information to answer each question accurately and concisely.

### Content:
${updatedMarkdownWithDescriptions}

    ### Image Descriptions:
${imageAnalysisResults}

      ### Audio Transcripts:
      ${transcriptionContext}

### Instructions:
- Carefully analyze the provided content, including descriptions of images.
- Use specific names for objects, fruits, or dishes seen in the images.
- Avoid generic terms like "fruit" or "food".
- Respond concisely with one-word or short-phrase answers.

### Question:
${question}

Provide your response in the exact format:
**Answer:** [your one-word or short-phrase answer]
`;
      const response = await connectWithOpenAi(prompt, undefined, 0.7);

      if (response.ok) {
        console.log("AI response:", response.data.choices[0]?.message?.content);
        const rawAnswer =
          response.data.choices[0]?.message?.content || "unknown";

        // Poprawiony regex do parsowania odpowiedzi
        const cleanAnswerMatch = rawAnswer.match(
          /^(\*\*Answer:\*\*|\*Answer:\*)\s*(.+)/,
        );
        const cleanAnswer = cleanAnswerMatch
          ? cleanAnswerMatch[2].trim()
          : "unknown";

        if (!cleanAnswer || cleanAnswer === "unknown") {
          console.error("Failed to parse AI answer for question:", question);
          continue;
        }

        // Pobieranie identyfikatora pytania
        const questionIdMatch = question.match(/^(\d+)=/);
        const questionId = questionIdMatch ? questionIdMatch[1] : null;

        if (!questionId) {
          console.error("Failed to extract question ID for:", question);
          continue;
        }

        answers[questionId] = cleanAnswer;
      } else {
        console.error("AI response failed for question:", question);
      }
    }

    const reportData = {
      task: "arxiv",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: answers,
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
      throw new Error(`Failed to send report. Response: ${errorText}`);
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
