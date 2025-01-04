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
    const { dataAPI, question } = await req.json();

    // Check which tables are available in the database
    const tablesResponse = await queryDatabase(dataAPI, "SHOW TABLES");
    const tables = tablesResponse.reply.map(
      (table: any) => table?.Tables_in_banan || table?.table_name,
    );

    // Check if the database contains any tables
    const tableSchemas: string[] = [];
    for (const table of tables) {
      const schemaResponse = await queryDatabase(
        dataAPI,
        `SHOW CREATE TABLE ${table}`,
      );
      const schema = schemaResponse.reply?.[0]?.["Create Table"] || "";
      if (schema) {
        tableSchemas.push(schema);
      }
    }

    const schemaString = tableSchemas.join("\n");

    const systemMessage = `You are an expert MySQL assistant.
    You have access to the following database schemas:
    ${schemaString}

    Your task:
    1. Analyze the table structures provided.
    2. Write a valid SQL SELECT query to find the IDs (dc_id) of active datacenters (is_active=1) managed by inactive users (is_active=0).
    3. Ensure that the query matches the column names exactly as they appear in the schema.
    4. Return only the SQL query without any explanation or formatting.`;

    const response = await connectWithOpenAi(question, systemMessage, 0.5);

    const sqlQuery = response.data.choices[0]?.message?.content?.trim() || "";

    if (!sqlQuery.toLowerCase().includes("select")) {
      throw new Error("OpenAI did not return a valid SELECT SQL query.");
    }

    // Execute the SQL query from OpenAI
    const queryResult = await queryDatabase(dataAPI, sqlQuery);

    if (!queryResult || !Array.isArray(queryResult.reply)) {
      throw new Error(
        `Unexpected database response format: ${JSON.stringify(queryResult)}`,
      );
    }

    // Extract the datacenter IDs from the query result
    const matchingDatacenterIds = queryResult.reply
      .map((row: any) => row?.dc_id || row?.DC_ID || row?.dcId)
      .filter(Boolean)
      .map(Number);

    if (matchingDatacenterIds.length === 0) {
      throw new Error("No matching datacenter IDs found.");
    }

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
