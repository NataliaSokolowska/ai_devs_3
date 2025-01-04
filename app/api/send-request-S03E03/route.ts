import { connectWithOpenAi } from "@/app/lib/openAiService";
import { NextResponse } from "next/server";

async function queryDatabase(apiUrl: string, query: string): Promise<any> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "database",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY,
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(`Database query failed: ${response.statusText}`);
  }

  return await response.json();
}

export async function POST(req: Request) {
  try {
    const { dataAPI } = await req.json();

    const schema = [];
    let resp = await queryDatabase(dataAPI, "SHOW CREATE TABLE datacenters");
    schema.push(resp.reply[0]?.["Create Table"] || "No schema for datacenters");
    resp = await queryDatabase(dataAPI, "SHOW CREATE TABLE users");
    schema.push(resp.reply[0]?.["Create Table"] || "No schema for users");
    const schemaString = schema.join("\n");

    const systemMessage = `You are an expert at generating SQL queries. Your task is to generate a query that will return the data asked by the user.\nHere is the DB schema: ${schemaString}. Return the the query without any formatting and nothing else.`;

    const userMessage =
      "Które aktywne datacenter (DC_ID) są zarządzane przez pracowników, którzy są na urlopie (is_active=0)?";

    const response = await connectWithOpenAi(userMessage, systemMessage, 0.5);

    const sqlQuery = response.data.choices[0]?.message?.content?.trim() || "";

    if (!sqlQuery.toLowerCase().includes("select")) {
      throw new Error("OpenAI did not return a valid SELECT SQL query.");
    }

    const queryResult = await queryDatabase(dataAPI, sqlQuery);

    if (!Array.isArray(queryResult.reply)) {
      throw new Error("Unexpected database response format.");
    }

    const matchingDatacenterIds = queryResult.reply
      .map((row: any) => row?.dc_id || row?.DC_ID)
      .filter(Boolean)
      .map(Number);

    const reportData = {
      task: "database",
      apikey: process.env.NEXT_PUBLIC_AIDEVS_KEY as string,
      answer: matchingDatacenterIds,
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
    return NextResponse.json({ error: "Failed to process the request." });
  }
}
