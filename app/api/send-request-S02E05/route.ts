import { NextResponse } from "next/server";
import { connectWithOpenAi } from "@/app/lib/openAiService";
import {
  analyzeImageContent,
  convertHtmlToMarkdown,
  downloadAndSaveAudio,
  downloadAndSaveImage,
  extractLinksFromHTML,
  injectImageDescriptionsIntoMarkdown,
  saveMarkdownToFile,
  updateFilePathsInMarkdown,
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
    // 1. Get HTML content and convert it to Markdown
    const informationResponse = await fetch(informationUrl);
    if (!informationResponse.ok) {
      throw new Error(
        `Failed to fetch information content. Status: ${informationResponse.status}`,
      );
    }
    const htmlContent = await informationResponse.text();
    const baseUrl = informationUrl.replace(/\/[^/]+$/, "");
    let markdownContent = await convertHtmlToMarkdown(htmlContent, baseUrl);

    const markdownFilePath = path.join(outputDirectory, "converted_content.md");
    await saveMarkdownToFile(markdownContent, markdownFilePath);

    // 2. Fetch and save images
    const imageOutputDir = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E05",
      "files",
      "images",
    );
    await fs.promises.mkdir(imageOutputDir, { recursive: true });

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

    markdownContent = updateFilePathsInMarkdown(markdownContent, imageMap);
    await saveMarkdownToFile(markdownContent, markdownFilePath);

    // 3. Analyze image content and add descriptions to the Markdown
    const imageAnalysisResults = await Promise.all(
      imageUrls.map(async (imageUrl) => {
        const localImagePath = path.join(
          imageOutputDir,
          path.basename(imageUrl),
        );

        try {
          return await analyzeImageContent(
            localImagePath,
            "Analyse the picture and identify what is in it. If it is food identify what food is in the picture. Focus on characteristics such as shape, texture and additives. If it's something else, write down what it is. Be concise and provide one-word answer if possible. Return the answer in Polish.",
          );
        } catch (error) {
          console.error(`Failed to analyze image: ${localImagePath}`, error);
          return "";
        }
      }),
    );

    const updatedMarkdownWithDescriptions = injectImageDescriptionsIntoMarkdown(
      markdownContent,
      imageAnalysisResults,
    );

    // Save updated markdown with image descriptions
    await saveMarkdownToFile(updatedMarkdownWithDescriptions, markdownFilePath);

    // 4. Extract audio links from the Markdown and download audio files
    const audioOutputDir = path.join(
      process.cwd(),
      "app",
      "tasks",
      "S02E05",
      "files",
      "audio",
    );
    await fs.promises.mkdir(audioOutputDir, { recursive: true });

    const audioRegex = /\[Audio\]\((https:\/\/[^)]+\.mp3)\)/g;
    const audioUrls = extractLinksFromHTML(
      updatedMarkdownWithDescriptions,
      baseUrl,
      audioRegex,
      "/dane/i/",
    );
    const audioMap: Record<string, string> = {};

    for (const audioUrl of audioUrls) {
      try {
        const localAudioPath = await downloadAndSaveAudio(
          audioUrl,
          audioOutputDir,
        );
        audioMap[audioUrl] = `./audio/${path.basename(localAudioPath)}`;
      } catch (error) {
        console.error(`Failed to download audio: ${audioUrl}`, error);
      }
    }

    for (const audioUrl of audioUrls) {
      try {
        const localAudioPath = await downloadAndSaveAudio(
          audioUrl,
          audioOutputDir,
        );
        audioMap[audioUrl] = `./audio/${path.basename(localAudioPath)}`;
      } catch (error) {
        console.error(`Failed to download audio: ${audioUrl}`, error);
      }
    }
    const updatedMarkdownWithAudio = updateFilePathsInMarkdown(
      updatedMarkdownWithDescriptions,
      audioMap,
    );
    await saveMarkdownToFile(updatedMarkdownWithAudio, markdownFilePath);

    // 5. Generate transcriptions for audio files
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
    const transcriptionContext = (
      await Promise.all(
        audioFiles.map(async (fileName) => {
          const audioFilePath = path.join(audioOutputDir, fileName);
          try {
            return await processAudioFile(audioFilePath, transcriptionFolder);
          } catch (err) {
            console.error(`Failed to process file: ${fileName}`, err);
            return "";
          }
        }),
      )
    ).join("\n");

    // 6. Fetch questions from the provided URL
    const questionResponse = await fetch(questionUrl);
    if (!questionResponse.ok) {
      throw new Error(
        `Failed to fetch questions. Status: ${questionResponse.status}`,
      );
    }
    const questionsText = await questionResponse.text();
    const questions = questionsText.split("\n").map((q) => q.trim());

    // 7. Prepare and send questions to the AI model
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
        const rawAnswer =
          response.data.choices[0]?.message?.content || "unknown";

        // Regex to extract the answer from the raw response
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

        // Extract question ID from the question text
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

    console.log("Report data:", JSON.stringify(reportData));

    // 8. Send the answers to the response server
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
    // Extract the flag from the response
    const flagMatch = reportResult.message.match(/{{FLG:(.*?)}}/);
    const flag = flagMatch ? flagMatch[1] : "Flag not found";

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Error processing the request:", error);
    return NextResponse.json({ error: "Failed to process the request." });
  }
}
