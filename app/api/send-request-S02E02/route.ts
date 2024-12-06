import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { connectWithOpenAi } from "@/app/lib/openAiService";
import { MODELS } from "@/app/lib/openAiService.constants";

export async function POST(req: Request) {
  try {
    const { imagePath } = await req.json();
    if (!imagePath) {
      return NextResponse.json(
        { error: "Missing required imagePath parameter." },
        { status: 400 },
      );
    }

    const folderPath = path.join(process.cwd(), imagePath);
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json(
        { error: `Folder not found: ${imagePath}` },
        { status: 404 },
      );
    }

    const images = fs
      .readdirSync(folderPath)
      .filter((file) => /\.(jpg|jpeg|png|gif)$/.test(file));

    if (images.length === 0) {
      return NextResponse.json(
        { error: "No images found in the specified folder." },
        { status: 404 },
      );
    }

    const base64Images = images.map((imagePath) => {
      const fileContent = fs.readFileSync(path.join(folderPath, imagePath), {
        encoding: "base64",
      });
      return {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${fileContent}`,
        },
      };
    });

    const userMessage = [
      {
        type: "text",
        text: `
          Task: Determine the city represented by the provided map fragments and additional clues.

          Important:
          - Carefully analyze the map fragments for street names, landmarks, or urban patterns.
          - Use the provided textual clues to refine your answer.
          - Respond **only** with the name of the city that matches the majority of clues.

          Additional clues:
          - This city is crossed by road number 534.
          - It has spichlerze (granaries) and a twierdza (fortress).
          - It has an Evangelical-Augsburg cemetery near Parkowa and Cmentarna streets.
        `,
      },
      ...base64Images,
    ];

    const systemMessage =
      "You are a helpful assistant that can answer questions, recognize images, and analyze map fragments to help with tasks.";

    const response = await connectWithOpenAi(
      userMessage,
      systemMessage,
      0.5,
      MODELS.GPT_4O,
    );
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

    return NextResponse.json({ flag: aiAnswer });
  } catch (error) {
    console.error("Error processing the request:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
