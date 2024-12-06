"use client";
import Image from "next/image";
import React, { useState } from "react";

export default function RobotIdTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flag, setFlag] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFetchData = async () => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    setFlag(null);

    try {
      const response = await fetch("/api/send-request-S02E03", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFlag(data.flag || "No flag found");
        setImageUrl(data.imageUrl || null);
        setError(null);
      }
    } catch (err) {
      console.error("Error while fetching data:", err);
      setError("Error while fetching data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-100 min-h-screen">
      <button
        type="button"
        onClick={handleFetchData}
        className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300"
      >
        {loading ? "Processing..." : "Generate Robot Visualization"}
      </button>

      {error && (
        <p className="mt-4 text-red-500 font-medium text-center">{error}</p>
      )}
      {flag && (
        <p className="font-bold">
          Flaga:{" "}
          <span className="mt-4 text-green-600 font-semibold text-lg text-center">
            {flag}
          </span>
        </p>
      )}
      {imageUrl && (
        <div className="mt-4">
          <Image
            src={imageUrl}
            alt="Generated Robot"
            className="rounded border shadow-md"
            width={1024}
            height={1024}
          />
        </div>
      )}
    </div>
  );
}
