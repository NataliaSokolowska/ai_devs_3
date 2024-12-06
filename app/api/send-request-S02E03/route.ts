import { generateImageWithDalle } from "@/app/lib/openAiService";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const robotDescriptionResponse = await fetch(
      process.env.NEXT_PUBLIC_URL_S02_E03 as string,
    );
    if (!robotDescriptionResponse.ok) {
      throw new Error(
        `Failed to fetch robot description. Status: ${robotDescriptionResponse.status}`,
      );
    }
    const { description } = await robotDescriptionResponse.json();

    if (!description) {
      return NextResponse.json(
        { error: "No description found in the response." },
        { status: 400 },
      );
    }

    const prompt = `Generate a highly detailed visualization of a robot based on the following description: "${description}". The robot should look futuristic and industrial, with fine metallic textures, gears, and intricate details. The background should be a minimal, factory-like setting.`;

    const imageResponse = await generateImageWithDalle(prompt);

    const imageUrl = imageResponse?.data?.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("Failed to generate image from DALL-E.");
    }

    const reportData = {
      task: "robotid",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: imageUrl,
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
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
