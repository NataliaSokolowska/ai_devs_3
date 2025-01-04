"use client";

import React, { useState } from "react";

const TaskS03E01Page = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flag, setFlag] = useState<string | null>(null);

  const handleFetchData = async () => {
    setLoading(true);
    setError(null);
    setFlag(null);

    try {
      const response = await fetch("/api/send-request-S03E01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: process.env.NEXT_PUBLIC_DATA_URL_S03_E01,
        }),
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
      <h1 className="text-2xl font-bold mb-4">Task S03E01 - Report</h1>
      <button
        type="button"
        onClick={handleFetchData}
        className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300"
      >
        {loading ? "Processing..." : "Process ZIP Data"}
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
    </div>
  );
};

export default TaskS03E01Page;
